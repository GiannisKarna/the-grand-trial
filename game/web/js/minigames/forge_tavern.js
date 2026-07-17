/*
 * The Grand Trial — The Tavern of One Bartender (event-loop concept trial)
 *
 * Contract (docs/superpowers/plans/2026-07-18-phase23-contracts.md):
 *   window.Minigames.forgeTavern.start(overlayEl, config, opts, onComplete)
 *     overlayEl : empty fullscreen div provided by the engine
 *     config    : parsed JSON from /api/content/minigames/forge-tavern
 *     opts      : {practice: bool} — practice shows a "no XP" ribbon
 *     onComplete: called exactly once with
 *       {completed, score, max, durationSec, missedQuestionIds: [], correctQuestionIds: []}
 *
 * The bartender is the event loop. Simulation rules (honest to the real thing):
 *   AWAIT (io)      : the kernel does the work in the background; the loop is
 *                     free; serving the completed order costs `resumeCost`
 *                     loop ticks (the callback / continuation).
 *   DO NOW          : the work runs on the loop; the loop is busy for the full
 *                     duration and can serve nothing else meanwhile. Correct
 *                     only for genuinely tiny CPU work. Synchronous I/O
 *                     behaves the same — the loop stands and waits.
 *   SEND TO KITCHEN : `handoffCost` loop ticks to dispatch, a worker runs the
 *                     job in parallel, then `pickupCost` loop ticks to serve.
 *                     Kitchen-ing a tiny task loses to DO NOW (fixed
 *                     overhead); kitchen-ing io works but wastes a worker on
 *                     pure waiting.
 *   AWAIT (cpu)     : await is not a spell — CPU work has no background to
 *                     run in, so it still runs ON the loop, same as DO NOW.
 *   While the loop is blocked, background io and kitchen workers KEEP
 *   progressing (the kernel and threads run regardless), but their
 *   completions cannot be served until the loop is free, and every unserved
 *   patron's patience drains every tick. Work for patrons who already left
 *   still runs to completion (nothing cancels it) — visible waste.
 *   The simulation is fully deterministic — no randomness anywhere.
 *
 * This module never touches game state, the network, or engine internals.
 * It cleans up its own DOM (and listeners/timers) before calling onComplete.
 * All dynamic text is inserted via textContent — HTML is always escaped.
 */
(function () {
  "use strict";

  window.Minigames = window.Minigames || {};

  var TICK_MS = 550;        /* animation speed: ms per simulation tick */
  var FAST_TICK_MS = 110;   /* once every patron is resolved (wasted-work tail) */

  var DEFAULTS = {
    resumeCost: 1,
    handoffCost: 1,
    pickupCost: 1,
    quickCpuMax: 2,
    patience: 10,
    workers: 2
  };

  var DECISION_ORDER = ["await", "now", "kitchen"];

  var DECISION_META = {
    "await": {
      key: "1",
      name: "AWAIT",
      chip: "awaited",
      hint: "Park it. If it runs itself (I/O), the kernel does the waiting and you serve it when the bell rings."
    },
    "now": {
      key: "2",
      name: "DO NOW",
      chip: "do now",
      hint: "Do it yourself, at the bar, this instant. Nothing else happens until you finish."
    },
    "kitchen": {
      key: "3",
      name: "SEND TO KITCHEN",
      chip: "to kitchen",
      hint: "Hand it to a cook. Dispatch and pickup each cost a tick of your time, but the work runs in parallel."
    }
  };

  /* ---------- small helpers (module-private) ---------- */

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function num(v, fallback) {
    return (typeof v === "number" && isFinite(v) && v >= 1) ? Math.floor(v) : fallback;
  }

  function sfx(name) {
    try {
      if (window.Game && window.Game.SFX && typeof window.Game.SFX.play === "function") {
        window.Game.SFX.play(name);
      }
    } catch (e) { /* sound is optional, never fatal */ }
  }

  /* ---------- the deterministic simulation (pure) ----------
   * entries : [{order: {name, kind, duration, patience?}, decision}]
   * params  : {patience, workers, resumeCost, handoffCost, pickupCost, quickCpuMax}
   * Tick order inside one tick:
   *   1) background io progresses (kernel runs no matter what the loop does)
   *   2) the loop does exactly one tick of the head job (FIFO queue;
   *      same-tick completions enqueue io-serves first, then kitchen pickups)
   *   3) the kitchen: free cooks take eligible queued jobs, busy cooks work
   *   4) patience drains for everyone not yet served or gone
   * A job finished at the end of tick t enqueues its follow-up eligible from
   * tick t+1 — completions are never served in the same tick they finish.
   */
  function simulate(entries, params) {
    var resumeCost = params.resumeCost;
    var handoffCost = params.handoffCost;
    var pickupCost = params.pickupCost;
    var quickCpuMax = params.quickCpuMax;

    var orders = entries.map(function (e, i) {
      var pat = num(e.order.patience, params.patience);
      return {
        idx: i,
        name: String(e.order.name || ("Order " + (i + 1))),
        kind: e.order.kind === "io" ? "io" : "cpu",
        duration: num(e.order.duration, 1),
        decision: e.decision,
        patienceMax: pat,
        patienceLeft: pat,
        st: "waiting",   /* waiting|bg|kqueue|cooking|atbar|ready|served|left */
        servedTick: null,
        leftTick: null,
        readySince: null,
        readyWait: 0,
        bg: null
      };
    });

    var loopQueue = [];    /* {orderIdx, type: work|serve|handoff|pickup, dur, remaining, eligible} */
    var kitchenQueue = []; /* {orderIdx, dur, remaining, eligible} */

    orders.forEach(function (o) {
      if (o.decision === "kitchen") {
        loopQueue.push({ orderIdx: o.idx, type: "handoff", dur: handoffCost, remaining: handoffCost, eligible: 1 });
      } else if (o.decision === "await" && o.kind === "io") {
        o.bg = { progress: 0, done: false };
        o.st = "bg";
      } else {
        /* DO NOW, or AWAIT on cpu (await moves nothing off the loop) */
        loopQueue.push({ orderIdx: o.idx, type: "work", dur: o.duration, remaining: o.duration, eligible: 1 });
      }
    });

    var current = null;
    var workers = [];
    var w;
    for (w = 0; w < params.workers; w++) workers.push(null);

    var ticks = [];
    var stats = {
      blockedTicks: 0, busyTicks: 0, idleTicks: 0, longestBlock: 0,
      readyWaitTotal: 0, ghostTicks: 0, ioWorkerTicks: 0
    };
    var runBlock = 0;
    var t = 0;

    while (t < 200) {
      t += 1;

      /* 1) background io — the kernel pours regardless of the loop */
      orders.forEach(function (o) {
        if (o.bg && !o.bg.done) {
          o.bg.progress += 1;
          if (o.bg.progress >= o.duration) {
            o.bg.done = true;
            if (o.st !== "left") { o.st = "ready"; o.readySince = t; }
            loopQueue.push({ orderIdx: o.idx, type: "serve", dur: resumeCost, remaining: resumeCost, eligible: t + 1 });
          }
        }
      });

      /* 2) the loop: exactly one tick of exactly one job */
      if (!current && loopQueue.length && loopQueue[0].eligible <= t) {
        current = loopQueue.shift();
      }
      var loopSnap;
      if (current) {
        var jo = orders[current.orderIdx];
        current.remaining -= 1;
        var blockedJob = current.type === "work" && current.dur > quickCpuMax;
        loopSnap = {
          cls: blockedJob ? "blocked" : "busy",
          type: current.type,
          orderIdx: current.orderIdx,
          done: current.dur - current.remaining,
          dur: current.dur
        };
        stats.busyTicks += 1;
        if (blockedJob) {
          stats.blockedTicks += 1;
          runBlock += 1;
          if (runBlock > stats.longestBlock) stats.longestBlock = runBlock;
        } else {
          runBlock = 0;
        }
        if (jo.st === "left") stats.ghostTicks += 1;
        else if (current.type === "work") jo.st = "atbar";
        if (current.remaining <= 0) {
          if (current.type === "handoff") {
            kitchenQueue.push({ orderIdx: current.orderIdx, dur: jo.duration, remaining: jo.duration, eligible: t + 1 });
            if (jo.st !== "left") jo.st = "kqueue";
          } else if (jo.st !== "left") {
            jo.st = "served";
            jo.servedTick = t;
          }
          current = null;
        }
      } else {
        loopSnap = { cls: "idle", type: null, orderIdx: null, done: 0, dur: 0 };
        stats.idleTicks += 1;
        runBlock = 0;
      }

      /* 3) the kitchen: assign free cooks, then everyone works one tick */
      workers.forEach(function (unused, wi) {
        if (!workers[wi] && kitchenQueue.length && kitchenQueue[0].eligible <= t) {
          workers[wi] = kitchenQueue.shift();
          var ko = orders[workers[wi].orderIdx];
          if (ko.st !== "left") ko.st = "cooking";
        }
        var job = workers[wi];
        if (job) {
          job.remaining -= 1;
          var ko2 = orders[job.orderIdx];
          if (ko2.kind === "io") stats.ioWorkerTicks += 1;
          if (ko2.st === "left") stats.ghostTicks += 1;
          if (job.remaining <= 0) {
            if (ko2.st !== "left") { ko2.st = "ready"; ko2.readySince = t; }
            loopQueue.push({ orderIdx: job.orderIdx, type: "pickup", dur: pickupCost, remaining: pickupCost, eligible: t + 1 });
            workers[wi] = null;
          }
        }
      });

      /* 4) patience drains; ready-and-waiting time is the loop's debt */
      orders.forEach(function (o) {
        if (o.st === "served" || o.st === "left") return;
        if (o.st === "ready" && o.readySince !== null && o.readySince < t) {
          o.readyWait += 1;
          stats.readyWaitTotal += 1;
        }
        o.patienceLeft -= 1;
        if (o.patienceLeft <= 0) {
          o.patienceLeft = 0;
          o.st = "left";
          o.leftTick = t;
        }
      });

      /* 5) snapshot for the animation + replay grid */
      var allResolved = orders.every(function (o) {
        return o.st === "served" || o.st === "left";
      });
      ticks.push({
        t: t,
        loop: loopSnap,
        workers: workers.map(function (job) {
          return job ? { orderIdx: job.orderIdx, done: job.dur - job.remaining, dur: job.dur } : null;
        }),
        orders: orders.map(function (o) {
          return { st: o.st, pat: o.patienceLeft, prog: o.bg ? o.bg.progress : 0 };
        }),
        allResolved: allResolved
      });

      /* 6) drained? (left patrons' pending work keeps the sim alive — waste) */
      var bgPending = orders.some(function (o) { return o.bg && !o.bg.done; });
      var kitchenBusy = workers.some(function (job) { return !!job; });
      if (!current && !loopQueue.length && !kitchenQueue.length && !kitchenBusy && !bgPending) break;
    }

    var served = orders.filter(function (o) { return o.st === "served"; }).length;
    return {
      orders: orders,
      ticks: ticks,
      served: served,
      total: orders.length,
      lastTick: t,
      stats: stats
    };
  }

  /* ---------- honest per-order verdicts ---------- */

  function verdictFor(o, params) {
    var d = o.duration;
    var roundTrip = params.handoffCost + params.pickupCost;
    var quick = d <= params.quickCpuMax;
    var mark, line;
    if (o.kind === "io") {
      if (o.decision === "await") {
        mark = "good";
        line = "Right call. It poured itself in the background for " + d +
          " ticks and needed none of your hands; serving it when the bell rang cost " +
          params.resumeCost + (params.resumeCost === 1 ? " tick" : " ticks") +
          " of loop time.";
      } else if (o.decision === "now") {
        mark = "bad";
        line = "The sin itself: synchronous I/O. You stood watching " + d +
          " ticks of waiting — the loop did no work, yet nothing else could run.";
      } else {
        mark = "warn";
        line = "It worked, but it held a cook for " + d +
          " ticks of pure watching, and the round trip cost " + roundTrip +
          " loop ticks. AWAIT does the same job for " + params.resumeCost +
          (params.resumeCost === 1 ? " tick" : " ticks") + " and no cook.";
      }
    } else if (o.decision === "now") {
      if (quick) {
        mark = "good";
        line = "Right call. " + d + (d === 1 ? " tick" : " ticks") +
          " of real work — no bigger than the " + roundTrip +
          "-tick round trip to the kitchen. Just do it.";
      } else {
        mark = "bad";
        line = "You ground it at the bar for " + d +
          " ticks. The loop was blocked the whole time — every patron in the room drained while you worked.";
      }
    } else if (o.decision === "await") {
      mark = quick ? "warn" : "bad";
      line = "await is not a spell. CPU work has no background to run in — it still ran ON the loop for " +
        d + " ticks, exactly as if you had done it now." +
        (quick ? " Tiny work, so little harm done — but the await bought you nothing." : " Everyone drained meanwhile.");
    } else if (quick) {
      mark = "warn";
      line = "Overhead trap: the " + roundTrip +
        "-tick round trip to the kitchen cost the loop as much or more than the " +
        d + "-tick task itself — and made this patron wait longer.";
    } else {
      mark = "good";
      line = "Right call. The kitchen ground it " + d +
        " ticks in parallel and your hands never touched it; the loop paid only the " +
        roundTrip + "-tick round trip.";
    }
    if (o.servedTick !== null) line += " Served at tick " + o.servedTick + ".";
    else if (o.leftTick !== null) line += " The patron stormed out at tick " + o.leftTick + ".";
    return { mark: mark, line: line };
  }

  /* Extra teaching lines earned by the round's actual mistakes. */
  function teachCallouts(simOrders, params) {
    var notes = [];
    var seen = {};
    simOrders.forEach(function (o) {
      var key = null;
      var text = null;
      if (o.kind === "io" && o.decision === "now") {
        key = "io-now";
        text = "Synchronous I/O on the loop is THE classic async sin: the CPU does nothing, yet nothing else can run. In production this is calling a blocking HTTP or database client inside an async handler.";
      } else if (o.kind === "io" && o.decision === "kitchen") {
        key = "io-kitchen";
        text = "I/O in the kitchen works, but wastes a worker on pure waiting — the kernel already runs I/O in the background for free, and that is what await taps into. The one production case where a worker on I/O is right: a blocking-only library with no async client (asyncio.to_thread) — better a parked thread than a blocked loop.";
      } else if (o.kind === "cpu" && o.decision === "await") {
        key = "cpu-await";
        text = "Awaiting CPU-bound work does not move it off the loop. await only helps when something OUTSIDE the loop does the work: the kernel (I/O) or a worker (the kitchen).";
      } else if (o.kind === "cpu" && o.decision === "kitchen" && o.duration <= params.quickCpuMax) {
        key = "tiny-kitchen";
        text = "Offloading has a fixed price: dispatch and resume overhead, plus serializing the arguments when the pool is a separate process. When the task is smaller than the overhead, doing it on the loop is the right call.";
      } else if (o.kind === "cpu" && o.decision === "now" && o.duration > params.quickCpuMax) {
        key = "cpu-now";
        text = "Long CPU work on the loop froze every patron at once. This is what worker pools exist for — and in CPython that means a process pool: the GIL stops threads from running Python CPU work in parallel.";
      }
      if (key && !seen[key]) {
        seen[key] = true;
        notes.push(text);
      }
    });
    return notes;
  }

  /* ---------- the minigame ---------- */

  function start(overlayEl, config, opts, onComplete) {
    opts = opts || {};
    config = config || {};
    var rounds = Array.isArray(config.rounds) ? config.rounds : [];
    var globalParams = {
      resumeCost: num(config.resumeCost, DEFAULTS.resumeCost),
      handoffCost: num(config.handoffCost, DEFAULTS.handoffCost),
      pickupCost: num(config.pickupCost, DEFAULTS.pickupCost),
      quickCpuMax: num(config.quickCpuMax, DEFAULTS.quickCpuMax)
    };
    var totalMax = rounds.reduce(function (acc, r) {
      return acc + ((r && Array.isArray(r.orders)) ? r.orders.length : 0);
    }, 0);

    var state = {
      phase: "splash",   /* splash | decide | run | summary | teach | end */
      round: 0,
      decisions: [],
      activeIdx: 0,
      sim: null,
      roundParams: null,
      score: 0,
      recap: [],
      startedAt: null,
      timerId: null,
      animIdx: 0,
      fastMode: false,
      anim: null,
      finished: false
    };

    var root = el("div", "mg-root ft-root");
    overlayEl.appendChild(root);
    if (opts.practice) root.appendChild(el("div", "ft-practice", "Practice run — no XP"));
    var screen = el("div", "ft-screen");
    root.appendChild(screen);

    function currentRound() { return rounds[state.round] || {}; }

    function roundParamsFor(round) {
      return {
        resumeCost: globalParams.resumeCost,
        handoffCost: globalParams.handoffCost,
        pickupCost: globalParams.pickupCost,
        quickCpuMax: globalParams.quickCpuMax,
        patience: num(round.patience, DEFAULTS.patience),
        workers: num(round.workers, DEFAULTS.workers)
      };
    }

    function onKeyDown(e) {
      if (state.finished || e.ctrlKey || e.altKey || e.metaKey) return;
      if (state.phase === "decide") {
        var n = parseInt(e.key, 10);
        if (!Number.isNaN(n) && n >= 1 && n <= DECISION_ORDER.length) {
          e.preventDefault();
          chooseDecision(DECISION_ORDER[n - 1]);
          return;
        }
      }
      if (e.key === "Enter" || e.key === " ") {
        var btn = root.querySelector(".mg-primary");
        if (btn) {
          e.preventDefault();
          btn.click();
        }
      }
    }
    document.addEventListener("keydown", onKeyDown);

    function stopTimer() {
      if (state.timerId) {
        clearInterval(state.timerId);
        state.timerId = null;
      }
    }

    function cleanup() {
      stopTimer();
      document.removeEventListener("keydown", onKeyDown);
      if (root.parentNode) root.parentNode.removeChild(root);
    }

    /* Engine-driven abort (Esc → Abandon): the engine settles the result
     * itself and clears the overlay; this hook makes the game tear down its
     * own timers/listeners/DOM instead of running on detached nodes. */
    overlayEl.addEventListener("grandtrial:abort", function () {
      state.finished = true;
      cleanup();
    }, { once: true });

    function finish(completed) {
      if (state.finished) return;
      state.finished = true;
      var result = {
        completed: completed,
        score: state.score,
        max: totalMax,
        durationSec: state.startedAt ? Math.round((Date.now() - state.startedAt) / 1000) : 0,
        missedQuestionIds: [],
        correctQuestionIds: []
      };
      cleanup();
      onComplete(result);
    }

    function setScreen() {
      screen.innerHTML = "";
      stopTimer();
    }

    /* ---------- splash ---------- */

    function renderSplash() {
      state.phase = "splash";
      setScreen();
      var panel = el("div", "mg-panel mg-splash");
      panel.appendChild(el("div", "mg-splash-glyph", "⌛"));
      panel.appendChild(el("div", "mg-eyebrow", "Region Trial — The Gatekeeper's Forge"));
      panel.appendChild(el("h1", "mg-title", config.title || "The Tavern of One Bartender"));
      if (config.subtitle) panel.appendChild(el("div", "mg-subtitle", config.subtitle));
      if (config.flavor) panel.appendChild(el("p", "mg-flavor", config.flavor));

      var legend = el("div", "ft-legend");
      DECISION_ORDER.forEach(function (d) {
        var row = el("div", "ft-legend-row");
        row.appendChild(el("span", "ft-legend-key", DECISION_META[d].name));
        row.appendChild(el("span", "", DECISION_META[d].hint));
        legend.appendChild(row);
      });
      panel.appendChild(legend);

      var btn = el("button", "mg-primary", rounds.length ? "Open the Tavern" : "Withdraw");
      btn.type = "button";
      btn.addEventListener("click", function () {
        if (state.phase !== "splash") return;
        if (!rounds.length) {
          finish(false);
          return;
        }
        sfx("click");
        state.startedAt = Date.now();
        startRound(0);
      });
      var actions = el("div", "mg-actions");
      actions.appendChild(btn);
      panel.appendChild(actions);
      screen.appendChild(panel);
    }

    /* ---------- decision phase ---------- */

    function startRound(r) {
      state.round = r;
      var round = currentRound();
      var orders = Array.isArray(round.orders) ? round.orders : [];
      if (!orders.length) {
        /* defensive: an empty round contributes nothing and skips to its card */
        state.recap.push({ name: round.name || ("Round " + (r + 1)), served: 0, total: 0 });
        state.sim = null;
        renderTeach();
        return;
      }
      state.decisions = orders.map(function () { return null; });
      state.activeIdx = 0;
      renderDecide();
    }

    function chooseDecision(d) {
      if (state.phase !== "decide") return;
      if (state.activeIdx === null || state.activeIdx === undefined) return;
      state.decisions[state.activeIdx] = d;
      sfx("click");
      var next = null;
      var n = state.decisions.length;
      var i;
      for (i = 1; i <= n; i++) {
        var idx = (state.activeIdx + i) % n;
        if (!state.decisions[idx]) { next = idx; break; }
      }
      state.activeIdx = next;
      renderDecide();
    }

    function renderDecide() {
      state.phase = "decide";
      setScreen();
      var round = currentRound();
      var orders = round.orders;
      var params = roundParamsFor(round);

      var stage = el("div", "mg-stage ft-stage");
      stage.appendChild(el("div", "mg-eyebrow",
        "Round " + (state.round + 1) + " of " + rounds.length +
        (round.name ? " — " + round.name : "")));
      if (round.intro) stage.appendChild(el("p", "mg-flavor", round.intro));

      var meta = el("div", "ft-meta");
      meta.appendChild(el("span", "ft-meta-chip", "Patience: " + params.patience + " ticks"));
      meta.appendChild(el("span", "ft-meta-chip",
        params.workers + (params.workers === 1 ? " cook" : " cooks") + " in the kitchen"));
      meta.appendChild(el("span", "ft-meta-chip", orders.length + " orders"));
      stage.appendChild(meta);

      var list = el("div", "ft-patrons");
      orders.forEach(function (order, i) {
        var isActive = state.activeIdx === i;
        var decision = state.decisions[i];
        var card = el("div", "ft-patron" +
          (isActive ? " ft-patron-active" : "") +
          (decision ? " ft-patron-done" : ""));

        var head = el("div", "ft-pat-head");
        head.appendChild(el("span", "ft-pat-name", order.name || ("Order " + (i + 1))));
        var isIo = order.kind === "io";
        head.appendChild(el("span", "ft-kind " + (isIo ? "ft-kind-io" : "ft-kind-cpu"),
          isIo ? "pours itself · I/O" : "needs hands · CPU"));
        head.appendChild(el("span", "ft-dur",
          num(order.duration, 1) + (num(order.duration, 1) === 1 ? " tick" : " ticks")));
        if (num(order.patience, 0) >= 1) {
          head.appendChild(el("span", "ft-pat-patience", "patience " + num(order.patience, 1)));
        }
        if (decision && !isActive) {
          head.appendChild(el("span", "ft-chip", DECISION_META[decision].chip));
        }
        card.appendChild(head);
        if (order.desc) card.appendChild(el("p", "ft-desc", order.desc));

        if (isActive) {
          var bar = el("div", "ft-decide-bar");
          DECISION_ORDER.forEach(function (d) {
            var btn = el("button", "ft-dbtn");
            btn.type = "button";
            btn.appendChild(el("span", "ft-dkey", DECISION_META[d].key));
            btn.appendChild(el("span", "ft-dname", DECISION_META[d].name));
            btn.appendChild(el("span", "ft-dhint", DECISION_META[d].hint));
            btn.addEventListener("click", function () {
              if (state.activeIdx !== i) state.activeIdx = i;
              chooseDecision(d);
            });
            bar.appendChild(btn);
          });
          card.appendChild(bar);
        } else {
          card.addEventListener("click", function () {
            if (state.phase !== "decide") return;
            state.activeIdx = i;
            renderDecide();
          });
        }
        list.appendChild(card);
      });
      stage.appendChild(list);

      stage.appendChild(el("div", "ft-costs",
        "The ledger: serving a finished await costs " + params.resumeCost +
        " tick · kitchen round trip costs " + params.handoffCost + " + " +
        params.pickupCost + " ticks of your time · keys 1–3 choose"));

      var allDecided = state.decisions.every(function (d) { return !!d; });
      var actions = el("div", "mg-actions");
      if (allDecided) {
        var btn = el("button", "mg-primary", "Ring the Bell — Service!");
        btn.type = "button";
        btn.addEventListener("click", function () {
          if (state.phase !== "decide") return;
          runRound();
        });
        actions.appendChild(btn);
        stage.appendChild(actions);
        stage.appendChild(el("div", "ft-costs", "Click a patron to change their order."));
      }
      screen.appendChild(stage);
    }

    /* ---------- the tick-by-tick service ---------- */

    function runRound() {
      var round = currentRound();
      var params = roundParamsFor(round);
      var entries = round.orders.map(function (order, i) {
        return { order: order, decision: state.decisions[i] };
      });
      state.roundParams = params;
      state.sim = simulate(entries, params);
      state.score += state.sim.served;
      state.recap.push({
        name: round.name || ("Round " + (state.round + 1)),
        served: state.sim.served,
        total: state.sim.total
      });
      renderRun();
    }

    function renderRun() {
      state.phase = "run";
      setScreen();
      var sim = state.sim;
      var round = currentRound();

      var stage = el("div", "mg-stage ft-stage");
      var head = el("div", "ft-runhead");
      head.appendChild(el("div", "mg-progress",
        "Round " + (state.round + 1) + " of " + rounds.length +
        (round.name ? " — " + round.name : "")));
      var tickEl = el("div", "ft-tick", "Tick 0 / " + sim.lastTick);
      head.appendChild(tickEl);
      stage.appendChild(head);

      var loopStrip = el("div", "ft-loopstrip ft-loop-idle");
      loopStrip.appendChild(el("div", "ft-loop-label", "The Bartender — the event loop"));
      var loopStatus = el("div", "ft-loop-status", "Polishing a glass, waiting for the bell…");
      loopStrip.appendChild(loopStatus);
      stage.appendChild(loopStrip);

      var kitchen = el("div", "ft-kitchenstrip");
      var cookEls = [];
      var wi;
      for (wi = 0; wi < state.roundParams.workers; wi++) {
        var cook = el("div", "ft-cook", "Cook " + (wi + 1) + " — idle");
        kitchen.appendChild(cook);
        cookEls.push(cook);
      }
      stage.appendChild(kitchen);

      var prows = el("div", "ft-prows");
      var rowRefs = [];
      sim.orders.forEach(function (o) {
        var row = el("div", "ft-prow");
        var nameCell = el("div", "");
        nameCell.appendChild(el("div", "ft-pname", o.name));
        nameCell.appendChild(el("span", "ft-pdec",
          DECISION_META[o.decision] ? DECISION_META[o.decision].chip : String(o.decision)));
        row.appendChild(nameCell);
        var bar = el("div", "ft-pbar");
        var fill = el("div", "ft-pbar-fill");
        bar.appendChild(fill);
        row.appendChild(bar);
        var status = el("div", "ft-pstatus", "waiting");
        row.appendChild(status);
        prows.appendChild(row);
        rowRefs.push({ row: row, fill: fill, status: status, prevSt: "start" });
      });
      stage.appendChild(prows);

      var servedEl = el("div", "ft-served", "Served 0 / " + sim.total);
      var runActions = el("div", "ft-runactions");
      runActions.appendChild(servedEl);
      var skip = el("button", "mg-primary ft-skip", "Skip the Pour");
      skip.type = "button";
      skip.addEventListener("click", function () {
        if (state.phase !== "run") return;
        finishAnimation(true);
      });
      runActions.appendChild(skip);
      stage.appendChild(runActions);
      screen.appendChild(stage);

      state.anim = {
        tickEl: tickEl, loopStrip: loopStrip, loopStatus: loopStatus,
        cookEls: cookEls, rows: rowRefs, servedEl: servedEl,
        runActions: runActions, skip: skip
      };
      state.animIdx = 0;
      state.fastMode = false;
      state.timerId = setInterval(stepTick, TICK_MS);
    }

    function loopStatusText(tick, sim) {
      var lp = tick.loop;
      if (lp.cls === "idle") return "Free — watching the taps.";
      var o = sim.orders[lp.orderIdx];
      var ghost = o.st === "left" && o.leftTick !== null && o.leftTick < tick.t ? " …for an empty stool" : "";
      if (lp.type === "serve") return "Ding! Serving " + o.name + ghost + ".";
      if (lp.type === "handoff") return "Handing to the kitchen: " + o.name + ".";
      if (lp.type === "pickup") return "Serving from the kitchen: " + o.name + ghost + ".";
      if (lp.cls === "blocked") {
        return "BLOCKED — working " + o.name + " at the bar (" + lp.done + "/" + lp.dur + ")" + ghost + ".";
      }
      return "Quick work at the bar: " + o.name + " (" + lp.done + "/" + lp.dur + ").";
    }

    function orderStatusText(snap, o, tick) {
      if (snap.st === "waiting") return "in the queue — nothing happening yet";
      if (snap.st === "bg") return "pouring itself… (" + snap.prog + "/" + o.duration + ")";
      if (snap.st === "kqueue") return "on the pass — waiting for a cook";
      if (snap.st === "cooking") {
        var wjob = null;
        tick.workers.forEach(function (job) {
          if (job && job.orderIdx === o.idx) wjob = job;
        });
        return wjob
          ? "in the kitchen (" + wjob.done + "/" + wjob.dur + ")"
          : "in the kitchen";
      }
      if (snap.st === "atbar") return "the bartender works it now";
      if (snap.st === "ready") return "READY — waiting for the bartender!";
      if (snap.st === "served") return "SERVED ✓ (tick " + o.servedTick + ")";
      if (snap.st === "left") return "STORMS OUT ✕ (tick " + o.leftTick + ")";
      return snap.st;
    }

    function applyTick(tick, silent) {
      var sim = state.sim;
      var anim = state.anim;
      anim.tickEl.textContent = "Tick " + tick.t + " / " + sim.lastTick;
      anim.loopStrip.className = "ft-loopstrip ft-loop-" + tick.loop.cls;
      anim.loopStatus.textContent = loopStatusText(tick, sim);

      anim.cookEls.forEach(function (cookEl, ci) {
        var job = tick.workers[ci];
        if (job) {
          var o = sim.orders[job.orderIdx];
          var note = o.kind === "io" ? " — just watching it pour" : "";
          cookEl.className = "ft-cook ft-cook-busy";
          cookEl.textContent = "Cook " + (ci + 1) + " — " + o.name +
            " (" + job.done + "/" + job.dur + ")" + note;
        } else {
          cookEl.className = "ft-cook";
          cookEl.textContent = "Cook " + (ci + 1) + " — idle";
        }
      });

      var servedCount = 0;
      tick.orders.forEach(function (snap, i) {
        var o = sim.orders[i];
        var ref = anim.rows[i];
        if (snap.st === "served") servedCount += 1;
        var pct = o.patienceMax > 0 ? (snap.pat / o.patienceMax) * 100 : 0;
        ref.fill.style.width = pct + "%";
        ref.fill.className = "ft-pbar-fill" + (pct < 35 ? " ft-low" : "");
        ref.status.textContent = orderStatusText(snap, o, tick);
        var rowCls = "ft-prow";
        if (snap.st === "ready") rowCls += " ft-prow-ready";
        else if (snap.st === "served") rowCls += " ft-prow-served";
        else if (snap.st === "left") rowCls += " ft-prow-left";
        ref.row.className = rowCls;
        if (!silent && ref.prevSt !== snap.st) {
          if (snap.st === "served") sfx("correct");
          else if (snap.st === "left") sfx("wrong");
        }
        ref.prevSt = snap.st;
      });
      anim.servedEl.textContent = "Served " + servedCount + " / " + sim.total;
    }

    function stepTick() {
      var sim = state.sim;
      if (state.animIdx >= sim.ticks.length) {
        finishAnimation(false);
        return;
      }
      var tick = sim.ticks[state.animIdx];
      applyTick(tick, false);
      state.animIdx += 1;
      if (!state.fastMode && tick.allResolved && state.animIdx < sim.ticks.length) {
        /* every patron resolved: fast-forward the wasted-work tail */
        state.fastMode = true;
        stopTimer();
        state.timerId = setInterval(stepTick, FAST_TICK_MS);
      }
    }

    function finishAnimation(skipped) {
      if (state.phase !== "run") return;
      stopTimer();
      var sim = state.sim;
      applyTick(sim.ticks[sim.ticks.length - 1], true);
      var anim = state.anim;
      if (anim.skip && anim.skip.parentNode) anim.skip.parentNode.removeChild(anim.skip);
      state.phase = "run-done";
      var btn = el("button", "mg-primary", "See Where the Time Went");
      btn.type = "button";
      btn.addEventListener("click", function () {
        if (state.phase !== "run-done") return;
        renderSummary();
      });
      anim.runActions.appendChild(btn);
    }

    /* ---------- the reckoning: replay grid + lost-time ledger ---------- */

    var LOOP_CELL_CLS = { idle: "ft-c-idle", busy: "ft-c-busy", blocked: "ft-c-blocked" };
    var ORDER_CELL_CLS = {
      waiting: "ft-c-wait", bg: "ft-c-bg", kqueue: "ft-c-kq", cooking: "ft-c-cook",
      atbar: "ft-c-atbar", ready: "ft-c-ready"
    };

    function loopCellTitle(tick, sim) {
      if (tick.loop.cls === "idle") return "t" + tick.t + ": the loop is free";
      var o = sim.orders[tick.loop.orderIdx];
      var what = tick.loop.type === "serve" ? "serving (callback) "
        : tick.loop.type === "handoff" ? "handing off "
        : tick.loop.type === "pickup" ? "serving from kitchen "
        : tick.loop.cls === "blocked" ? "BLOCKED grinding " : "quick work: ";
      return "t" + tick.t + ": " + what + o.name;
    }

    function buildGrid(sim) {
      var grid = el("div", "ft-grid");
      var headRow = el("div", "ft-grow ft-ghead");
      headRow.appendChild(el("div", "ft-glabel", "tick"));
      sim.ticks.forEach(function (tick) {
        headRow.appendChild(el("div", "ft-gcell",
          (tick.t === 1 || tick.t % 5 === 0) ? String(tick.t) : "·"));
      });
      grid.appendChild(headRow);

      var loopRow = el("div", "ft-grow");
      loopRow.appendChild(el("div", "ft-glabel", "THE LOOP"));
      sim.ticks.forEach(function (tick) {
        var cell = el("div", "ft-gcell " + LOOP_CELL_CLS[tick.loop.cls]);
        cell.title = loopCellTitle(tick, sim);
        loopRow.appendChild(cell);
      });
      grid.appendChild(loopRow);

      sim.orders.forEach(function (o, i) {
        var row = el("div", "ft-grow");
        row.appendChild(el("div", "ft-glabel", o.name));
        sim.ticks.forEach(function (tick) {
          var snap = tick.orders[i];
          var cls, mark = "";
          if (snap.st === "served") {
            if (tick.t === o.servedTick) { cls = "ft-c-servedmark"; mark = "✓"; }
            else cls = "ft-c-done";
          } else if (snap.st === "left") {
            if (tick.t === o.leftTick) { cls = "ft-c-leftmark"; mark = "✕"; }
            else cls = "ft-c-gone";
          } else {
            cls = ORDER_CELL_CLS[snap.st] || "ft-c-wait";
          }
          var cell = el("div", "ft-gcell " + cls, mark);
          cell.title = "t" + tick.t + ": " + o.name + " — " + snap.st +
            " (patience " + snap.pat + "/" + o.patienceMax + ")";
          row.appendChild(cell);
        });
        grid.appendChild(row);
      });
      return grid;
    }

    function buildGridLegend() {
      var legend = el("div", "ft-legend2");
      var items = [
        ["ft-c-idle", "loop free"],
        ["ft-c-busy", "loop busy (quick)"],
        ["ft-c-blocked", "loop BLOCKED"],
        ["ft-c-bg", "pouring itself (I/O)"],
        ["ft-c-kq", "waiting for a cook"],
        ["ft-c-cook", "in the kitchen"],
        ["ft-c-atbar", "worked at the bar"],
        ["ft-c-ready", "ready, waiting for the loop"],
        ["ft-c-wait", "queued, patience draining"],
        ["ft-c-servedmark", "served"],
        ["ft-c-leftmark", "stormed out"]
      ];
      items.forEach(function (it) {
        var lg = el("div", "ft-lg");
        lg.appendChild(el("div", "ft-gcell " + it[0]));
        lg.appendChild(el("span", "", it[1]));
        legend.appendChild(lg);
      });
      return legend;
    }

    function lostTimeLines(sim) {
      var s = sim.stats;
      var lines = [];
      if (s.blockedTicks > 0) {
        lines.push("The bar was BLOCKED for " + s.blockedTicks +
          (s.blockedTicks === 1 ? " tick" : " ticks") +
          " (longest freeze: " + s.longestBlock +
          "). Every unserved patron drained patience through all of them.");
      }
      if (s.readyWaitTotal > 0) {
        lines.push(s.readyWaitTotal +
          (s.readyWaitTotal === 1 ? " tick" : " ticks") +
          " of finished orders sat on the pass waiting for the bartender — completions can only be served by a free loop.");
      }
      if (s.ghostTicks > 0) {
        lines.push(s.ghostTicks +
          (s.ghostTicks === 1 ? " tick" : " ticks") +
          " of work were done for patrons who had already stormed out — nothing cancelled their orders.");
      }
      if (s.ioWorkerTicks > 0) {
        lines.push("Cooks spent " + s.ioWorkerTicks +
          (s.ioWorkerTicks === 1 ? " tick" : " ticks") +
          " just watching liquid pour — I/O sent to the kitchen occupies a worker with pure waiting.");
      }
      if (!lines.length) {
        lines.push("No time was wasted: the loop never froze and every completion was served the first tick it could be.");
      }
      return lines;
    }

    function renderSummary() {
      state.phase = "summary";
      setScreen();
      var sim = state.sim;
      var round = currentRound();

      var stage = el("div", "mg-stage ft-stage");
      stage.appendChild(el("div", "mg-eyebrow",
        "Round " + (state.round + 1) + " of " + rounds.length + " — The Reckoning"));
      stage.appendChild(el("h1", "mg-title",
        "Served " + sim.served + " of " + sim.total));
      if (round.name) stage.appendChild(el("div", "mg-subtitle", round.name));

      stage.appendChild(buildGrid(sim));
      stage.appendChild(buildGridLegend());

      var lostTitle = el("div", "mg-subtitle", "Where the time went");
      stage.appendChild(lostTitle);
      var lost = el("div", "ft-lost");
      lostTimeLines(sim).forEach(function (line) {
        lost.appendChild(el("div", "ft-lost-item", line));
      });
      stage.appendChild(lost);

      var verdicts = el("div", "ft-verdicts");
      sim.orders.forEach(function (o) {
        var v = verdictFor(o, state.roundParams);
        var row = el("div", "ft-verdict ft-v-" + v.mark);
        row.appendChild(el("span", "ft-vmark",
          v.mark === "good" ? "✓" : v.mark === "warn" ? "△" : "✕"));
        var body = el("div", "ft-vbody");
        var title = el("div", "");
        title.appendChild(el("span", "ft-vname", o.name));
        title.appendChild(el("span", "ft-vdec",
          DECISION_META[o.decision] ? DECISION_META[o.decision].name : String(o.decision)));
        body.appendChild(title);
        body.appendChild(el("div", "ft-vline", v.line));
        row.appendChild(body);
        verdicts.appendChild(row);
      });
      stage.appendChild(verdicts);

      var btn = el("button", "mg-primary", "What Does This Teach?");
      btn.type = "button";
      btn.addEventListener("click", function () {
        if (state.phase !== "summary") return;
        renderTeach();
      });
      var actions = el("div", "mg-actions");
      actions.appendChild(btn);
      stage.appendChild(actions);
      screen.appendChild(stage);
    }

    /* ---------- the teaching card (never auto-advanced) ---------- */

    function renderTeach() {
      state.phase = "teach";
      setScreen();
      var round = currentRound();

      var panel = el("div", "mg-panel");
      panel.appendChild(el("div", "mg-eyebrow", "What This Teaches"));
      panel.appendChild(el("h1", "mg-title", round.name || ("Round " + (state.round + 1))));

      var card = el("div", "mg-card ft-teach");
      if (round.teach) card.appendChild(el("p", "ft-teach-text", round.teach));
      var notes = state.sim ? teachCallouts(state.sim.orders, state.roundParams) : [];
      if (notes.length) {
        var noteBox = el("div", "ft-teach-notes");
        noteBox.appendChild(el("div", "ft-teach-notes-title", "Lessons from your play"));
        notes.forEach(function (n) {
          noteBox.appendChild(el("p", "ft-note", n));
        });
        card.appendChild(noteBox);
      }
      panel.appendChild(card);

      var last = state.round + 1 >= rounds.length;
      var btn = el("button", "mg-primary", last ? "Last Call — the Verdict" : "The Next Bell Rings");
      btn.type = "button";
      btn.addEventListener("click", function () {
        if (state.phase !== "teach") return;
        sfx("click");
        if (last) renderEnd();
        else startRound(state.round + 1);
      });
      var actions = el("div", "mg-actions");
      actions.appendChild(btn);
      panel.appendChild(actions);
      screen.appendChild(panel);
    }

    /* ---------- end screen ---------- */

    function tierLine(pct) {
      var tiers = Array.isArray(config.tiers) ? config.tiers.slice() : [];
      tiers.sort(function (a, b) { return (b.min || 0) - (a.min || 0); });
      var i;
      for (i = 0; i < tiers.length; i++) {
        if (pct >= (tiers[i].min || 0)) return tiers[i].line || "";
      }
      return "";
    }

    function renderEnd() {
      state.phase = "end";
      setScreen();
      var pct = totalMax > 0 ? Math.round((state.score / totalMax) * 100) : 0;
      if (pct >= 80) sfx("victory");

      var panel = el("div", "mg-panel mg-end");
      panel.appendChild(el("div", "mg-eyebrow", "Last Call"));
      panel.appendChild(el("h1", "mg-title", "The Tavern Closes"));

      var stats = el("div", "mg-stats");
      var s1 = el("div", "mg-stat");
      s1.appendChild(el("div", "mg-stat-big", state.score + " / " + totalMax));
      s1.appendChild(el("div", "mg-stat-label", "patrons served"));
      stats.appendChild(s1);
      var s2 = el("div", "mg-stat");
      s2.appendChild(el("div", "mg-stat-big", pct + "%"));
      s2.appendChild(el("div", "mg-stat-label", "of the night saved"));
      stats.appendChild(s2);
      panel.appendChild(stats);

      if (state.recap.length) {
        var recap = el("div", "ft-rounds");
        state.recap.forEach(function (r, i) {
          var row = el("div", "ft-round-row");
          row.appendChild(el("span", "", "Round " + (i + 1) + " — " + r.name));
          row.appendChild(el("span", "ft-round-score", r.served + " / " + r.total));
          recap.appendChild(row);
        });
        panel.appendChild(recap);
      }

      var tl = tierLine(pct);
      if (tl) panel.appendChild(el("p", "ft-tierline", tl));

      var endcard = config.endcard || {};
      var map = el("div", "ft-map");
      map.appendChild(el("div", "ft-map-title", endcard.title || "The Bartender's Ledger"));
      (Array.isArray(endcard.lines) ? endcard.lines : []).forEach(function (line) {
        map.appendChild(el("div", "ft-map-line", line));
      });
      panel.appendChild(map);

      var btn = el("button", "mg-primary", "Leave the Tavern");
      btn.type = "button";
      btn.addEventListener("click", function () { finish(true); });
      var actions = el("div", "mg-actions");
      actions.appendChild(btn);
      panel.appendChild(actions);
      screen.appendChild(panel);
    }

    renderSplash();
  }

  window.Minigames.forgeTavern = {
    start: start,
    /* exposed for deterministic verification/testing only — not engine API */
    _sim: simulate
  };
})();
