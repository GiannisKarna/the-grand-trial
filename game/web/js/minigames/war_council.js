/*
 * The Grand Trial — The Council of Trade-offs (War Council region trial)
 *
 * Contract (docs/superpowers/plans/2026-07-18-phase23-contracts.md):
 *   window.Minigames.warCouncil.start(overlayEl, config, opts, onComplete)
 *     overlayEl : empty fullscreen div provided by the engine
 *     config    : parsed game/content/minigames/war-council.json
 *                 {title, deck, scenarios, scenarios_per_session, hand_size, plays_required}
 *     opts      : {practice: bool} — practice shows a "no XP" ribbon
 *     onComplete: called exactly once with
 *       {completed, score, max, durationSec, missedQuestionIds: [], correctQuestionIds: []}
 *
 * Decision-Card battle: each round deals a scenario (demands on p95 latency,
 * gold/month, complexity, quality) and a hand of 8 Decision Cards showing
 * honest production stats and a when-it-backfires line. The player plays
 * exactly 3; the council applies the deltas (with per-scenario context
 * overrides and pair effects) and animates four meters against the demands.
 * Round score = demands met (max 4); session = 3 scenarios; max = 12.
 *
 * This module never touches game state, the network, or engine internals.
 * It cleans up its own DOM (and listeners/timers) before calling onComplete.
 * All dynamic text is inserted via textContent — HTML is always escaped.
 */
(function () {
  "use strict";

  window.Minigames = window.Minigames || {};

  var DEFAULT_SCENARIOS_PER_SESSION = 3;
  var DEFAULT_HAND_SIZE = 8;
  var DEFAULT_PLAYS_REQUIRED = 3;
  var METER_STAGGER_MS = 500;
  var METER_SETTLE_MS = 950;
  var LATENCY_FLOOR_MS = 50;

  /*
   * The four meters. dir "under" = value must stay at-or-under the budget
   * (latency, gold, complexity); dir "over" = value must reach the floor
   * (quality). The latency label is overridden per scenario (felt response
   * vs to-completion — an honest distinction the scenarios teach).
   */
  var METERS = [
    { key: "latency_ms", label: "p95 latency", short: "p95", unit: "ms", dir: "under" },
    { key: "gold_month", label: "gold / month", short: "gold", unit: "g/mo", dir: "under" },
    { key: "complexity", label: "complexity", short: "cx", unit: "", dir: "under" },
    { key: "quality", label: "quality", short: "qual", unit: "", dir: "over" }
  ];

  /* ---------- small helpers (module-private) ---------- */

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function shuffle(list) {
    for (var i = list.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = list[i];
      list[i] = list[j];
      list[j] = tmp;
    }
    return list;
  }

  function fmtNum(n) {
    return Math.round(n).toLocaleString("en-US");
  }

  function fmtDelta(n) {
    var v = Math.round(n);
    if (v > 0) return "+" + fmtNum(v);
    if (v < 0) return "−" + fmtNum(-v);
    return "±0";
  }

  /* Latency values span honest orders of magnitude (a 700 ms cache saving
   * vs a 4-hour batch turnaround), so render them in human units. */
  function fmtMs(n) {
    var v = Math.round(n);
    if (v >= 3600000) return (v / 3600000).toFixed(1).replace(/\.0$/, "") + " h";
    if (v >= 60000) return Math.round(v / 60000) + " min";
    if (v >= 10000) return Math.round(v / 1000) + " s";
    return fmtNum(v) + " ms";
  }

  function fmtVal(meter, n) {
    if (meter.key === "latency_ms") return fmtMs(n);
    return fmtNum(n) + (meter.unit ? " " + meter.unit : "");
  }

  function fmtDeltaVal(meter, n) {
    if (meter.key !== "latency_ms") {
      return fmtDelta(n) + (meter.unit ? " " + meter.unit : "");
    }
    var v = Math.round(n);
    if (v === 0) return "±0 ms";
    return (v > 0 ? "+" : "−") + fmtMs(Math.abs(v));
  }

  function playSfx(name) {
    /* optional dependency only — never required */
    if (window.Game && window.Game.SFX && typeof window.Game.SFX.play === "function") {
      window.Game.SFX.play(name);
    }
  }

  /* ---------- simulation (the honest math) ---------- */

  /* A card's stats for THIS scenario: deck defaults overlaid by the
   * scenario's partial override (context honesty: the same cache is a
   * powerhouse at 70% hit rate and dead weight at 0%). */
  function effectiveStats(card, scenario) {
    var out = {};
    METERS.forEach(function (m) {
      out[m.key] = (card.stats && typeof card.stats[m.key] === "number") ? card.stats[m.key] : 0;
    });
    var o = scenario.overrides && scenario.overrides[card.id];
    if (o && o.stats) {
      METERS.forEach(function (m) {
        if (typeof o.stats[m.key] === "number") out[m.key] = o.stats[m.key];
      });
    }
    return out;
  }

  function cardNote(card, scenario) {
    var o = scenario.overrides && scenario.overrides[card.id];
    return (o && o.note) ? o.note : null;
  }

  /* Apply the played cards' deltas to the scenario baseline, then any pair
   * synergy/conflict effects, clamp to sane ranges, and judge each demand. */
  function resolvePlay(scenario, playedCards) {
    var totals = {};
    METERS.forEach(function (m) { totals[m.key] = scenario.base[m.key]; });
    playedCards.forEach(function (card) {
      var s = effectiveStats(card, scenario);
      METERS.forEach(function (m) { totals[m.key] += s[m.key]; });
    });

    var playedIds = {};
    playedCards.forEach(function (c) { playedIds[c.id] = true; });
    var pairNotes = [];
    (scenario.pairs || []).forEach(function (p) {
      var cards = p.cards || [];
      if (cards.length === 0) return;
      var all = cards.every(function (id) { return playedIds[id]; });
      if (!all) return;
      if (p.delta) {
        METERS.forEach(function (m) {
          if (typeof p.delta[m.key] === "number") totals[m.key] += p.delta[m.key];
        });
      }
      pairNotes.push(p);
    });

    totals.latency_ms = Math.max(LATENCY_FLOOR_MS, totals.latency_ms);
    totals.gold_month = Math.max(0, totals.gold_month);
    totals.complexity = Math.max(0, totals.complexity);
    totals.quality = Math.min(100, Math.max(0, totals.quality));

    var met = {};
    var metCount = 0;
    METERS.forEach(function (m) {
      var ok = (m.dir === "under")
        ? totals[m.key] <= scenario.constraints[m.key]
        : totals[m.key] >= scenario.constraints[m.key];
      met[m.key] = ok;
      if (ok) metCount += 1;
    });
    return { totals: totals, met: met, metCount: metCount, pairNotes: pairNotes };
  }

  function meterLabel(meter, scenario) {
    if (meter.key === "latency_ms" && scenario.latency_label) return scenario.latency_label;
    return meter.label;
  }

  function demandText(meter, scenario) {
    var cap = scenario.constraints[meter.key];
    var sign = (meter.dir === "under") ? "≤ " : "≥ ";
    return sign + fmtVal(meter, cap);
  }

  /* Is this delta good news for the realm on this meter? */
  function deltaTone(meter, value) {
    if (value === 0) return "wc-chip-zero";
    var good = (meter.dir === "under") ? value < 0 : value > 0;
    return good ? "wc-chip-good" : "wc-chip-bad";
  }

  /* ---------- the minigame ---------- */

  function start(overlayEl, config, opts, onComplete) {
    opts = opts || {};
    config = config || {};

    var deck = Array.isArray(config.deck) ? config.deck : [];
    var deckById = {};
    deck.forEach(function (c) { deckById[c.id] = c; });

    var perSession = (Number.isInteger(config.scenarios_per_session) && config.scenarios_per_session > 0)
      ? config.scenarios_per_session : DEFAULT_SCENARIOS_PER_SESSION;
    var handSize = (Number.isInteger(config.hand_size) && config.hand_size > 0)
      ? config.hand_size : DEFAULT_HAND_SIZE;
    var playsRequired = (Number.isInteger(config.plays_required) && config.plays_required > 0)
      ? config.plays_required : DEFAULT_PLAYS_REQUIRED;

    var scenarios = shuffle((Array.isArray(config.scenarios) ? config.scenarios : []).slice())
      .slice(0, perSession);
    var maxScore = scenarios.length * METERS.length;

    var state = {
      phase: "splash",      // splash | select | resolve | debrief | end
      round: 0,
      score: 0,
      recap: [],            // {title, met, won} per scenario, in play order
      selected: [],         // indexes into handCards
      handCards: [],
      cardEls: [],
      countEl: null,
      commitBtn: null,
      outcome: null,
      startedAt: null,
      playSeconds: 0,
      timers: [],
      finished: false
    };

    var root = el("div", "mg-root wc-root");
    overlayEl.appendChild(root);

    function later(fn, ms) {
      var id = setTimeout(fn, ms);
      state.timers.push(id);
      return id;
    }

    function clearTimers() {
      state.timers.forEach(function (id) { clearTimeout(id); });
      state.timers = [];
    }

    function onKeyDown(e) {
      if (state.finished || e.ctrlKey || e.altKey || e.metaKey) return;
      if (state.phase === "select") {
        var n = parseInt(e.key, 10);
        if (!Number.isNaN(n) && n >= 1 && n <= state.cardEls.length) {
          e.preventDefault();
          toggleCard(n - 1);
          return;
        }
      }
      if (e.key === "Enter" || e.key === " ") {
        var btn = root.querySelector(".mg-primary");
        if (btn && !btn.disabled) {
          e.preventDefault();
          btn.click();
        }
      }
    }
    document.addEventListener("keydown", onKeyDown);

    function cleanup() {
      clearTimers();
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
        max: maxScore,
        durationSec: state.playSeconds,
        missedQuestionIds: [],
        correctQuestionIds: []
      };
      cleanup();
      onComplete(result);
    }

    function markTime() {
      if (state.startedAt) {
        state.playSeconds = Math.round((Date.now() - state.startedAt) / 1000);
      }
    }

    function addPracticeRibbon() {
      if (opts.practice) {
        root.appendChild(el("div", "wc-practice", "Practice run — no XP"));
      }
    }

    /* ---------- title splash ---------- */

    function renderSplash() {
      state.phase = "splash";
      root.innerHTML = "";
      addPracticeRibbon();
      var panel = el("div", "mg-panel mg-splash wc-splash");
      panel.appendChild(el("div", "mg-splash-glyph", "⚖"));
      panel.appendChild(el("div", "mg-eyebrow", "Region Trial — The War Council"));
      panel.appendChild(el("h1", "mg-title", config.title || "The Council of Trade-offs"));
      panel.appendChild(el("div", "mg-subtitle", "A Decision-Card Battle"));

      var flavor;
      if (scenarios.length === 0) {
        flavor = "The council chamber stands empty — no scenarios to judge.";
      } else {
        flavor = "The council does not deal in best practices — it deals in trade-offs. " +
          "Each sitting brings a realm in trouble and a hand of " + handSize +
          " Decision Cards: every stat honest, every backfire written on the face. " +
          "Play exactly " + playsRequired + " cards, then answer for the consequences. " +
          scenarios.length + (scenarios.length === 1 ? " scenario awaits." : " scenarios await.");
      }
      panel.appendChild(el("p", "mg-flavor", flavor));

      var btn = el("button", "mg-primary", scenarios.length ? "Take Your Seat" : "Withdraw");
      btn.type = "button";
      btn.addEventListener("click", function () {
        if (state.phase !== "splash") return;
        if (scenarios.length === 0) {
          finish(false);
          return;
        }
        state.startedAt = Date.now();
        renderSelect();
      });
      var actions = el("div", "mg-actions");
      actions.appendChild(btn);
      panel.appendChild(actions);
      root.appendChild(panel);
    }

    /* ---------- card selection (the battle) ---------- */

    function buildCardEl(card, scenario, index) {
      var btn = el("button", "wc-card");
      btn.type = "button";

      var top = el("div", "wc-card-top");
      top.appendChild(el("span", "wc-card-icon", card.icon || "❖"));
      var names = el("div", "wc-card-names");
      names.appendChild(el("div", "wc-card-name", card.name));
      names.appendChild(el("div", "wc-card-real", card.real));
      top.appendChild(names);
      top.appendChild(el("span", "wc-card-key", String(index + 1)));
      btn.appendChild(top);

      btn.appendChild(el("p", "wc-card-what", card.what));

      var stats = effectiveStats(card, scenario);
      var chips = el("div", "wc-card-stats");
      METERS.forEach(function (m) {
        var chip = el("span", "wc-chip " + deltaTone(m, stats[m.key]));
        chip.appendChild(el("span", "wc-chip-label", m.short));
        chip.appendChild(el("span", "wc-chip-val", fmtDeltaVal(m, stats[m.key])));
        chips.appendChild(chip);
      });
      btn.appendChild(chips);

      var note = cardNote(card, scenario);
      if (note) {
        var noteEl = el("div", "wc-card-note");
        noteEl.appendChild(el("span", "wc-card-note-label", "In this council: "));
        noteEl.appendChild(el("span", "", note));
        btn.appendChild(noteEl);
      }

      var back = el("div", "wc-card-backfire");
      back.appendChild(el("span", "wc-card-backfire-label", "Backfires: "));
      back.appendChild(el("span", "", card.backfire));
      btn.appendChild(back);

      btn.addEventListener("click", function () { toggleCard(index); });
      return btn;
    }

    function updateCommitBar() {
      if (state.countEl) {
        state.countEl.textContent =
          "Decrees chosen: " + state.selected.length + " / " + playsRequired;
      }
      if (state.commitBtn) {
        state.commitBtn.disabled = state.selected.length !== playsRequired;
      }
    }

    function toggleCard(index) {
      if (state.phase !== "select") return;
      var cardEl = state.cardEls[index];
      if (!cardEl) return;
      var at = state.selected.indexOf(index);
      if (at >= 0) {
        state.selected.splice(at, 1);
        cardEl.classList.remove("wc-card-selected");
      } else if (state.selected.length < playsRequired) {
        state.selected.push(index);
        cardEl.classList.add("wc-card-selected");
        playSfx("click");
      } else {
        cardEl.classList.remove("wc-card-refuse");
        void cardEl.offsetWidth; /* restart the refuse animation */
        cardEl.classList.add("wc-card-refuse");
        return;
      }
      updateCommitBar();
    }

    function renderSelect() {
      state.phase = "select";
      root.innerHTML = "";
      addPracticeRibbon();
      state.selected = [];
      state.cardEls = [];

      var scenario = scenarios[state.round];
      state.handCards = (scenario.hand || [])
        .map(function (id) { return deckById[id]; })
        .filter(function (c) { return !!c; })
        .slice(0, handSize);

      var stage = el("div", "wc-stage");

      var head = el("div", "wc-head");
      head.appendChild(el("div", "mg-progress",
        "Council Session " + (state.round + 1) + " of " + scenarios.length));
      head.appendChild(el("div", "wc-score",
        "Demands met so far: " + state.score));
      stage.appendChild(head);

      /* -- the scenario brief -- */
      var brief = el("div", "wc-brief");
      brief.appendChild(el("div", "wc-scenario-title", scenario.title));
      brief.appendChild(el("div", "wc-scenario-real", scenario.real));
      brief.appendChild(el("p", "wc-flavor", scenario.flavor));
      if (scenario.load) {
        var load = el("div", "wc-load");
        load.appendChild(el("span", "wc-load-label", "Load: "));
        load.appendChild(el("span", "", scenario.load));
        brief.appendChild(load);
      }
      var ctx = el("ul", "wc-context");
      (scenario.context || []).forEach(function (line) {
        ctx.appendChild(el("li", "", line));
      });
      brief.appendChild(ctx);

      var demands = el("div", "wc-demands");
      METERS.forEach(function (m) {
        var chip = el("div", "wc-demand");
        chip.appendChild(el("div", "wc-demand-label", meterLabel(m, scenario)));
        chip.appendChild(el("div", "wc-demand-val", demandText(m, scenario)));
        demands.appendChild(chip);
      });
      brief.appendChild(demands);

      var baseBits = METERS.map(function (m) {
        return meterLabel(m, scenario) + " " + fmtVal(m, scenario.base[m.key]);
      });
      brief.appendChild(el("div", "wc-base",
        "The realm today: " + baseBits.join(" · ")));
      stage.appendChild(brief);

      /* -- the hand -- */
      stage.appendChild(el("div", "wc-hand-title",
        "Your hand — play exactly " + playsRequired + " decrees"));
      var hand = el("div", "wc-hand");
      state.handCards.forEach(function (card, i) {
        var cardEl = buildCardEl(card, scenario, i);
        hand.appendChild(cardEl);
        state.cardEls.push(cardEl);
      });
      stage.appendChild(hand);

      /* -- commit bar -- */
      var bar = el("div", "wc-commit-bar");
      var count = el("div", "wc-count");
      state.countEl = count;
      bar.appendChild(count);
      var commit = el("button", "mg-primary", "Seal the Decree");
      commit.type = "button";
      commit.disabled = true;
      commit.addEventListener("click", function () {
        if (state.phase !== "select") return;
        if (state.selected.length !== playsRequired) return;
        var played = state.selected.map(function (i) { return state.handCards[i]; });
        renderResolution(played);
      });
      state.commitBtn = commit;
      bar.appendChild(commit);
      stage.appendChild(bar);
      updateCommitBar();

      root.appendChild(stage);
      root.scrollTop = 0;
    }

    /* ---------- resolution: the meters answer ---------- */

    function renderResolution(playedCards) {
      state.phase = "resolve";
      markTime();
      root.innerHTML = "";
      addPracticeRibbon();

      var scenario = scenarios[state.round];
      var outcome = resolvePlay(scenario, playedCards);
      state.outcome = outcome;
      state.score += outcome.metCount;
      state.recap.push({
        title: scenario.title,
        met: outcome.metCount,
        won: outcome.metCount === METERS.length
      });

      var stage = el("div", "wc-stage wc-stage-narrow");
      var head = el("div", "wc-head");
      head.appendChild(el("div", "mg-progress",
        "Council Session " + (state.round + 1) + " of " + scenarios.length));
      head.appendChild(el("div", "wc-score", "The decree is sealed"));
      stage.appendChild(head);

      stage.appendChild(el("div", "wc-scenario-title wc-scenario-title-small", scenario.title));

      /* -- the four meters -- */
      var meters = el("div", "wc-meters");
      var fills = [];
      var valueEls = [];
      var rowEls = [];
      METERS.forEach(function (m) {
        var base = scenario.base[m.key];
        var final = outcome.totals[m.key];
        var cap = scenario.constraints[m.key];
        var scaleMax = (m.key === "quality")
          ? 100
          : Math.max(base, final, cap) * 1.15;
        if (scaleMax <= 0) scaleMax = 1;

        var row = el("div", "wc-meter");
        var headRow = el("div", "wc-meter-head");
        headRow.appendChild(el("span", "wc-meter-label", meterLabel(m, scenario)));
        var value = el("span", "wc-meter-value", fmtVal(m, base));
        headRow.appendChild(value);
        headRow.appendChild(el("span", "wc-meter-target", demandText(m, scenario)));
        row.appendChild(headRow);

        var bar = el("div", "wc-meter-bar");
        var fill = el("div", "wc-meter-fill" + (m.dir === "over" ? " wc-meter-fill-quality" : ""));
        fill.style.width = Math.min(100, (base / scaleMax) * 100) + "%";
        bar.appendChild(fill);
        var tick = el("div", "wc-meter-tick");
        tick.style.left = Math.min(100, (cap / scaleMax) * 100) + "%";
        bar.appendChild(tick);
        row.appendChild(bar);

        meters.appendChild(row);
        fills.push({ fill: fill, pct: Math.min(100, (final / scaleMax) * 100) });
        valueEls.push(value);
        rowEls.push(row);
      });
      stage.appendChild(meters);

      /* -- what the played cards did (revealed with the verdict) -- */
      var reveal = el("div", "wc-reveal");

      var notes = el("div", "wc-notes");
      notes.appendChild(el("div", "wc-notes-title", "What your decrees did"));
      playedCards.forEach(function (card) {
        var row = el("div", "wc-note-row");
        var head2 = el("div", "wc-note-head");
        head2.appendChild(el("span", "wc-card-icon", card.icon || "❖"));
        head2.appendChild(el("span", "wc-note-name", card.name));
        head2.appendChild(el("span", "wc-note-real", card.real));
        row.appendChild(head2);
        var stats = effectiveStats(card, scenario);
        var chips = el("div", "wc-card-stats");
        METERS.forEach(function (m) {
          var chip = el("span", "wc-chip " + deltaTone(m, stats[m.key]));
          chip.appendChild(el("span", "wc-chip-label", m.short));
          chip.appendChild(el("span", "wc-chip-val", fmtDeltaVal(m, stats[m.key])));
          chips.appendChild(chip);
        });
        row.appendChild(chips);
        var note = cardNote(card, scenario);
        row.appendChild(el("div", "wc-note-text", note || card.backfire));
        notes.appendChild(row);
      });
      outcome.pairNotes.forEach(function (p) {
        var row = el("div", "wc-pair-row");
        row.appendChild(el("span", "wc-pair-mark", "⚭"));
        row.appendChild(el("span", "", p.note || "Two decrees intertwine."));
        notes.appendChild(row);
      });
      reveal.appendChild(notes);

      var won = outcome.metCount === METERS.length;
      var verdict = el("div", "wc-verdict " + (won ? "wc-verdict-won" : "wc-verdict-lost"));
      verdict.appendChild(el("div", "wc-verdict-big",
        "The council rules: " + outcome.metCount + " of " + METERS.length + " demands met"));
      verdict.appendChild(el("div", "wc-verdict-sub",
        won ? "The realm holds. Your seal carries weight."
            : "The realm buckles where the meters burn red."));
      reveal.appendChild(verdict);

      var btn = el("button", "mg-primary", "Hear the Council's Verdict");
      btn.type = "button";
      btn.addEventListener("click", function () {
        if (state.phase !== "resolve") return;
        renderDebrief();
      });
      var actions = el("div", "mg-actions wc-reveal-actions");
      actions.appendChild(btn);
      reveal.appendChild(actions);
      stage.appendChild(reveal);

      root.appendChild(stage);
      root.scrollTop = 0;

      /* animate: meters run one after another, then the reveal */
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          fills.forEach(function (f, i) {
            f.fill.style.transitionDelay = (i * METER_STAGGER_MS) + "ms";
            f.fill.style.width = f.pct + "%";
          });
        });
      });
      METERS.forEach(function (m, i) {
        later(function () {
          var ok = state.outcome.met[m.key];
          rowEls[i].classList.add(ok ? "wc-met" : "wc-breach");
          valueEls[i].textContent = fmtVal(m, state.outcome.totals[m.key]);
          playSfx(ok ? "correct" : "wrong");
        }, i * METER_STAGGER_MS + METER_SETTLE_MS);
      });
      later(function () {
        reveal.classList.add("wc-reveal-show");
      }, METERS.length * METER_STAGGER_MS + METER_SETTLE_MS);
    }

    /* ---------- debrief: what this teaches ---------- */

    function renderDebrief() {
      state.phase = "debrief";
      root.innerHTML = "";
      addPracticeRibbon();

      var scenario = scenarios[state.round];
      var outcome = state.outcome;
      var won = outcome.metCount === METERS.length;

      var panel = el("div", "mg-panel wc-debrief");
      panel.appendChild(el("div", "mg-eyebrow", "What This Teaches"));
      panel.appendChild(el("h1", "mg-title wc-debrief-title", "The Council's Verdict"));
      panel.appendChild(el("div", "mg-subtitle", scenario.title));

      panel.appendChild(el("div",
        "wc-debrief-score " + (won ? "wc-debrief-score-won" : "wc-debrief-score-lost"),
        "Demands met: " + outcome.metCount + " of " + METERS.length +
        (won ? " — the realm holds" : " — the realm buckles")));

      var debrief = scenario.debrief || {};
      var bestIds = debrief.best || [];
      if (bestIds.length > 0) {
        var bestWrap = el("div", "wc-best");
        bestWrap.appendChild(el("div", "wc-best-label", "The council's own decree:"));
        var chips = el("div", "wc-best-chips");
        bestIds.forEach(function (id) {
          var card = deckById[id];
          var chip = el("span", "wc-best-chip");
          chip.appendChild(el("span", "wc-card-icon", (card && card.icon) || "❖"));
          chip.appendChild(el("span", "", card ? card.name : id));
          chips.appendChild(chip);
        });
        bestWrap.appendChild(chips);
        panel.appendChild(bestWrap);
      }

      if (debrief.text) {
        panel.appendChild(el("p", "wc-debrief-text", debrief.text));
      }

      var last = state.round + 1 >= scenarios.length;
      var btn = el("button", "mg-primary", last ? "Face the Reckoning" : "Next Session");
      btn.type = "button";
      btn.addEventListener("click", function () {
        if (state.phase !== "debrief") return;
        state.round += 1;
        if (state.round >= scenarios.length) renderEnd();
        else renderSelect();
      });
      var actions = el("div", "mg-actions");
      actions.appendChild(btn);
      panel.appendChild(actions);
      root.appendChild(panel);
      root.scrollTop = 0;
    }

    /* ---------- end screen ---------- */

    function renderEnd() {
      state.phase = "end";
      markTime();
      root.innerHTML = "";
      addPracticeRibbon();

      var panel = el("div", "mg-panel mg-end wc-end");
      panel.appendChild(el("div", "mg-eyebrow", "The Session Ends"));
      panel.appendChild(el("h1", "mg-title", "The Council Adjourns"));

      var wins = state.recap.filter(function (r) { return r.won; }).length;
      var stats = el("div", "mg-stats");
      var s1 = el("div", "mg-stat");
      s1.appendChild(el("div", "mg-stat-big", state.score + " / " + maxScore));
      s1.appendChild(el("div", "mg-stat-label", "demands met"));
      stats.appendChild(s1);
      var s2 = el("div", "mg-stat");
      s2.appendChild(el("div", "mg-stat-big", wins + " / " + state.recap.length));
      s2.appendChild(el("div", "mg-stat-label", "realms held"));
      stats.appendChild(s2);
      panel.appendChild(stats);

      if (state.recap.length > 0) {
        var list = el("div", "mg-recap");
        state.recap.forEach(function (r) {
          var row = el("div", "mg-recap-row " + (r.won ? "mg-recap-good" : "mg-recap-bad"));
          row.appendChild(el("span", "mg-recap-mark", r.won ? "✓" : "✕"));
          var body = el("div", "mg-recap-body");
          body.appendChild(el("div", "mg-recap-prompt", r.title));
          body.appendChild(el("div", "mg-recap-answer",
            "Demands met: " + r.met + " / " + METERS.length));
          row.appendChild(body);
          list.appendChild(row);
        });
        panel.appendChild(list);
      }

      var pct = maxScore > 0 ? state.score / maxScore : 0;
      var tier;
      if (pct >= 1) {
        tier = "A flawless sitting. The realm prospers under your seal — interviewers call this “judgment.”";
      } else if (pct >= 0.75) {
        tier = "The council nods. Most demands held — and the failures taught more than the wins.";
      } else if (pct >= 0.5) {
        tier = "A costly session. Trade-offs were made — some of them backwards. Read the verdicts again.";
      } else {
        tier = "The realm burns politely. Every backfire line on those cards was true — they always are.";
      }
      panel.appendChild(el("p", "mg-flavor", tier));

      if (opts.practice) {
        panel.appendChild(el("p", "wc-practice-note",
          "A practice sitting — the council awards no XP."));
      }

      var btn = el("button", "mg-primary", opts.practice ? "Leave the Chamber" : "Claim Your Reward");
      btn.type = "button";
      btn.addEventListener("click", function () { finish(true); });
      var actions = el("div", "mg-actions");
      actions.appendChild(btn);
      panel.appendChild(actions);
      root.appendChild(panel);
      root.scrollTop = 0;

      playSfx(pct >= 0.75 ? "victory" : "click");
    }

    renderSplash();
  }

  window.Minigames.warCouncil = { start: start };
})();
