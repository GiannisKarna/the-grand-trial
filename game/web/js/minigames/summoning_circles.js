/*
 * The Grand Trial — The Summoning Circles (agent-orchestration Region Trial)
 *
 * Contract (docs/superpowers/plans/2026-07-18-phase23-contracts.md):
 *   window.Minigames.summoningCircles.start(overlayEl, config, opts, onComplete)
 *     overlayEl : empty fullscreen div provided by the engine
 *     config    : parsed JSON from /api/content/minigames/summoning-circles
 *     opts      : {practice: bool} — practice runs show a "no XP" ribbon
 *     onComplete: called exactly once with
 *       {completed, score, max, durationSec, missedQuestionIds: [], correctQuestionIds: []}
 *
 * Three rounds, each drawn randomly from config variants:
 *   R1 Choose the Familiar — tool selection (which agent/tool fits the task)
 *   R2 Order the Ritual    — the agent loop / RAG pipeline / multi-agent handoff
 *   R3 Trace the Corruption — find the ROOT-CAUSE step in a broken execution trace
 * Score = round points summed. Every round ends with a "What this teaches" card
 * that requires a click — the teaching moment is never auto-advanced.
 *
 * This module never touches game state, the network, or engine internals.
 * It cleans up its own DOM (and listeners) before calling onComplete.
 * All dynamic text is inserted via textContent — HTML is always escaped.
 */
(function () {
  "use strict";

  window.Minigames = window.Minigames || {};

  var DEFAULT_FAMILIAR_TASKS = 3;
  var DEFAULT_TRACE_POINTS = 3;

  var KIND_LABELS = {
    user: "Seeker",
    agent: "The Circle",
    tool: "Familiar"
  };

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

  function sample(list, n) {
    return shuffle(list.slice()).slice(0, n);
  }

  /* Optional SFX — Phase 2 contract: sound is never a hard dependency. */
  function sfx(name) {
    var g = window.Game;
    if (g && g.SFX && typeof g.SFX.play === "function") {
      try { g.SFX.play(name); } catch (err) { /* sound must never break play */ }
    }
  }

  /* ---------- the minigame ---------- */

  function start(overlayEl, config, opts, onComplete) {
    opts = opts || {};
    config = config || {};
    var rounds = config.rounds || {};
    var famCfg = rounds.familiar || {};
    var ritCfg = rounds.ritual || {};
    var corCfg = rounds.corruption || {};

    var roster = famCfg.familiars || [];
    var famCount = (Number.isInteger(famCfg.pick) && famCfg.pick > 0)
      ? famCfg.pick
      : DEFAULT_FAMILIAR_TASKS;
    var famTasks = sample(famCfg.variants || [], famCount);
    var ritual = sample(ritCfg.variants || [], 1)[0] || null;
    var trace = sample(corCfg.variants || [], 1)[0] || null;
    var tracePoints = (Number.isInteger(corCfg.points) && corCfg.points > 0)
      ? corCfg.points
      : DEFAULT_TRACE_POINTS;

    var ritualOk = !!(ritual && ritual.steps && ritual.steps.length > 0);
    var traceOk = !!(trace && trace.steps && trace.steps.length > 0 &&
      Number.isInteger(trace.corrupted) &&
      trace.corrupted >= 0 && trace.corrupted < trace.steps.length);
    var playable = famTasks.length > 0 && roster.length > 0 && ritualOk && traceOk;

    var maxScore = playable
      ? famTasks.length + ritual.steps.length + tracePoints
      : 0;

    var state = {
      phase: "splash",   // splash | intro | familiar | fam-fb | ritual | rit-done
                         // | trace | trace-done | teaches | end
      finished: false,
      startedAt: null,
      playSeconds: 0,
      score: 0,          // settled points from completed rounds
      recap: [],         // {title, score, max} per round, in play order
      famIdx: 0,
      famScore: 0,
      ritNext: 0,
      ritWrong: 0,
      traceWrong: 0,
      scoreEl: null,
      choiceButtons: []
    };

    var root = el("div", "sc-root");
    if (opts.practice) {
      root.appendChild(el("div", "sc-practice", "Practice run — no XP"));
    }
    var content = el("div", "sc-content");
    root.appendChild(content);
    overlayEl.appendChild(root);

    function onKeyDown(e) {
      if (state.finished || e.ctrlKey || e.altKey || e.metaKey) return;
      if (state.phase === "familiar" || state.phase === "ritual" || state.phase === "trace") {
        var n = parseInt(e.key, 10);
        if (!Number.isNaN(n) && n >= 1 && n <= state.choiceButtons.length) {
          e.preventDefault();
          var btn = state.choiceButtons[n - 1];
          if (btn && !btn.disabled) btn.click();
        }
      } else if (e.key === "Enter" || e.key === " ") {
        var primary = root.querySelector(".sc-primary");
        if (primary) {
          e.preventDefault();
          primary.click();
        }
      }
    }
    document.addEventListener("keydown", onKeyDown);

    function cleanup() {
      document.removeEventListener("keydown", onKeyDown);
      if (root.parentNode) root.parentNode.removeChild(root);
    }

    /* Engine-driven abort (Esc → Abandon): the engine settles the result
     * itself and clears the overlay; this hook makes the game tear down its
     * own listeners/DOM instead of running on detached nodes. */
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

    /* Live score = settled rounds + the round in progress. */
    function liveScore() {
      var t = state.score;
      if (state.phase === "familiar" || state.phase === "fam-fb") t += state.famScore;
      else if (state.phase === "ritual") t += Math.max(0, state.ritNext - state.ritWrong);
      return t;
    }

    function refreshScore() {
      if (state.scoreEl) state.scoreEl.textContent = "✦ " + liveScore();
    }

    function stageHead(progressText) {
      var head = el("div", "sc-head");
      head.appendChild(el("div", "sc-progress", progressText));
      var score = el("div", "sc-score", "✦ " + liveScore());
      state.scoreEl = score;
      head.appendChild(score);
      return head;
    }

    function primaryButton(label, handler) {
      var btn = el("button", "sc-primary", label);
      btn.type = "button";
      btn.addEventListener("click", handler);
      return btn;
    }

    /* ---------- title splash ---------- */

    function renderSplash() {
      state.phase = "splash";
      state.choiceButtons = [];
      content.innerHTML = "";
      var panel = el("div", "sc-panel sc-splash");
      panel.appendChild(el("div", "sc-glyph", "◎"));
      panel.appendChild(el("div", "sc-eyebrow", config.eyebrow || "Region Trial"));
      panel.appendChild(el("h1", "sc-title", config.title || "The Summoning Circles"));
      panel.appendChild(el("p", "sc-flavor", playable
        ? (config.flavor || "Three disciplines of the summoner await.")
        : "The chamber is dark — the circles hold no rites tonight."));
      var actions = el("div", "sc-actions");
      actions.appendChild(primaryButton(playable ? "Enter the Circles" : "Withdraw", function () {
        if (state.phase !== "splash") return;
        if (!playable) {
          finish(false);
          return;
        }
        state.startedAt = Date.now();
        renderRoundIntro(1);
      }));
      panel.appendChild(actions);
      content.appendChild(panel);
    }

    /* ---------- round intro card ---------- */

    function renderRoundIntro(roundNum) {
      state.phase = "intro";
      state.choiceButtons = [];
      content.innerHTML = "";
      var titles = { 1: famCfg.title, 2: ritCfg.title, 3: corCfg.title };
      var intros = { 1: famCfg.intro, 2: ritCfg.intro, 3: corCfg.intro };
      var panel = el("div", "sc-panel");
      panel.appendChild(el("div", "sc-eyebrow", "Round " + roundNum + " of 3"));
      panel.appendChild(el("h1", "sc-title", titles[roundNum] || "The Trial"));
      if (roundNum === 2 && ritual.title) {
        panel.appendChild(el("div", "sc-subtitle", ritual.title));
      } else if (roundNum === 3 && trace.title) {
        panel.appendChild(el("div", "sc-subtitle", trace.title));
      }
      if (intros[roundNum]) panel.appendChild(el("p", "sc-flavor", intros[roundNum]));
      var actions = el("div", "sc-actions");
      actions.appendChild(primaryButton("Begin", function () {
        if (state.phase !== "intro") return;
        if (roundNum === 1) renderFamiliar();
        else if (roundNum === 2) renderRitual();
        else renderTrace();
      }));
      panel.appendChild(actions);
      content.appendChild(panel);
    }

    /* ---------- "What this teaches" card (never auto-advanced) ---------- */

    function renderTeaches(roundTitle, text, pts, ptsMax, next) {
      state.phase = "teaches";
      state.choiceButtons = [];
      content.innerHTML = "";
      var panel = el("div", "sc-panel sc-teaches");
      panel.appendChild(el("div", "sc-eyebrow", "What This Teaches"));
      panel.appendChild(el("h1", "sc-title", roundTitle));
      panel.appendChild(el("div", "sc-round-pts", pts + " / " + ptsMax + " essence this round"));
      panel.appendChild(el("p", "sc-teaches-text", text || ""));
      var actions = el("div", "sc-actions");
      actions.appendChild(primaryButton("Continue", function () {
        if (state.phase !== "teaches") return;
        next();
      }));
      panel.appendChild(actions);
      content.appendChild(panel);
    }

    /* ---------- Round 1 — Choose the Familiar ---------- */

    function renderFamiliar() {
      state.phase = "familiar";
      state.choiceButtons = [];
      content.innerHTML = "";

      var task = famTasks[state.famIdx];
      var displayed = shuffle(roster.slice());

      var stage = el("div", "sc-stage");
      stage.appendChild(stageHead("Round 1 of 3 · Summons " +
        (state.famIdx + 1) + " of " + famTasks.length));

      var card = el("div", "sc-card");
      card.appendChild(el("div", "sc-card-label", "The Plea"));
      card.appendChild(el("p", "sc-task", task.task));

      var grid = el("div", "sc-options");
      displayed.forEach(function (fam, i) {
        var btn = el("button", "sc-opt");
        btn.type = "button";
        btn.appendChild(el("span", "sc-opt-key", String(i + 1)));
        btn.appendChild(el("div", "sc-opt-glyph", fam.glyph || "✦"));
        btn.appendChild(el("div", "sc-opt-name", fam.name));
        btn.appendChild(el("div", "sc-opt-tool", fam.tool));
        btn.appendChild(el("div", "sc-opt-desc", fam.desc));
        btn.addEventListener("click", function () {
          handleFamiliarPick(displayed, i, card);
        });
        grid.appendChild(btn);
        state.choiceButtons.push(btn);
      });
      card.appendChild(grid);

      stage.appendChild(card);
      content.appendChild(stage);
    }

    function handleFamiliarPick(displayed, pickIdx, card) {
      if (state.phase !== "familiar") return;
      state.phase = "fam-fb";
      markTime();

      var task = famTasks[state.famIdx];
      var picked = displayed[pickIdx];
      var ok = picked.id === task.answer;
      var correctFam = null;

      if (ok) {
        state.famScore += 1;
        sfx("correct");
      } else {
        sfx("wrong");
      }

      /* Full-honesty reveal: every card shows why it serves or fails here. */
      displayed.forEach(function (fam, i) {
        var btn = state.choiceButtons[i];
        btn.disabled = true;
        if (fam.id === task.answer) {
          correctFam = fam;
          btn.classList.add("sc-opt-correct");
        } else if (i === pickIdx) {
          btn.classList.add("sc-opt-wrong");
        } else {
          btn.classList.add("sc-opt-dim");
        }
        var verdict = task.verdicts && task.verdicts[fam.id];
        if (verdict) btn.appendChild(el("div", "sc-opt-verdict", verdict));
      });
      refreshScore();

      var fb = el("div", "sc-fb " + (ok ? "sc-fb-good" : "sc-fb-bad"));
      fb.appendChild(el("div", "sc-fb-verdict",
        ok ? "The familiar answers the call!" : "The summons fizzles."));
      if (!ok && correctFam) {
        fb.appendChild(el("div", "sc-fb-answer",
          "The true summons: " + correctFam.name + " — " + correctFam.tool));
      }
      var last = state.famIdx + 1 >= famTasks.length;
      var actions = el("div", "sc-fb-actions");
      actions.appendChild(primaryButton(last ? "Close the Circle" : "Next Summons", function () {
        if (state.phase !== "fam-fb") return;
        state.famIdx += 1;
        if (state.famIdx >= famTasks.length) {
          var pts = state.famScore;
          state.score += pts;
          state.recap.push({ title: famCfg.title || "Choose the Familiar", score: pts, max: famTasks.length });
          renderTeaches(famCfg.title || "Choose the Familiar", famCfg.teaches,
            pts, famTasks.length, function () { renderRoundIntro(2); });
        } else {
          renderFamiliar();
        }
      }));
      fb.appendChild(actions);
      card.appendChild(fb);
      if (fb.scrollIntoView) fb.scrollIntoView({ block: "nearest" });
    }

    /* ---------- Round 2 — Order the Ritual ---------- */

    function renderRitual() {
      state.phase = "ritual";
      state.choiceButtons = [];
      content.innerHTML = "";

      var steps = ritual.steps;

      var stage = el("div", "sc-stage");
      stage.appendChild(stageHead("Round 2 of 3 · " + (ritCfg.title || "Order the Ritual")));

      var card = el("div", "sc-card");
      card.appendChild(el("div", "sc-card-label", ritual.title || "The Rite"));
      card.appendChild(el("p", "sc-scenario", ritual.scenario || ""));

      /* The cast sequence: empty slots filled as tiles are clicked in order. */
      var track = el("div", "sc-track");
      var slotEls = [];
      steps.forEach(function (_, i) {
        var slot = el("div", "sc-slot");
        slot.appendChild(el("span", "sc-slot-num", String(i + 1)));
        var label = el("span", "sc-slot-label", "");
        slot.appendChild(label);
        slotEls.push(slot);
        track.appendChild(slot);
      });
      card.appendChild(track);

      /* Shuffled tiles — never presented already in true order. */
      var order = steps.map(function (_, i) { return i; });
      shuffle(order);
      if (order.length > 1) {
        var alreadySorted = order.every(function (v, i) { return v === i; });
        if (alreadySorted) {
          var t = order[0];
          order[0] = order[1];
          order[1] = t;
        }
      }

      var scorchEl = el("div", "sc-status", "Scorches: 0");
      var tiles = el("div", "sc-tiles");
      order.forEach(function (stepIdx, pos) {
        var step = steps[stepIdx];
        var btn = el("button", "sc-tile");
        btn.type = "button";
        btn.appendChild(el("span", "sc-tile-key", String(pos + 1)));
        btn.appendChild(el("span", "sc-tile-label", step.label));
        btn.addEventListener("click", function () {
          handleRitualTile(stepIdx, btn, slotEls, scorchEl, card);
        });
        tiles.appendChild(btn);
        state.choiceButtons.push(btn);
      });
      card.appendChild(tiles);
      card.appendChild(scorchEl);

      stage.appendChild(card);
      content.appendChild(stage);
    }

    function handleRitualTile(stepIdx, btn, slotEls, scorchEl, card) {
      if (state.phase !== "ritual") return;
      var steps = ritual.steps;
      if (stepIdx === state.ritNext) {
        btn.disabled = true;
        btn.classList.add("sc-tile-done");
        var slot = slotEls[state.ritNext];
        slot.classList.add("sc-slot-filled");
        slot.querySelector(".sc-slot-label").textContent = steps[stepIdx].label;
        state.ritNext += 1;
        sfx("correct");
        refreshScore();
        if (state.ritNext >= steps.length) ritualComplete(card);
      } else {
        state.ritWrong += 1;
        sfx("wrong");
        scorchEl.textContent = "Scorches: " + state.ritWrong;
        scorchEl.classList.add("sc-status-hot");
        btn.classList.remove("sc-tile-wrong");
        void btn.offsetWidth; /* restart the jitter animation */
        btn.classList.add("sc-tile-wrong");
        refreshScore();
      }
    }

    function ritualComplete(card) {
      state.phase = "rit-done";
      state.choiceButtons = [];
      markTime();

      var steps = ritual.steps;
      var pts = Math.max(0, steps.length - state.ritWrong);

      /* The rite read true: every step with its production meaning. */
      var read = el("div", "sc-rite-read");
      read.appendChild(el("div", "sc-rite-read-title", "The rite, read true:"));
      steps.forEach(function (step, i) {
        var row = el("div", "sc-step-row");
        row.appendChild(el("span", "sc-step-num", String(i + 1)));
        var body = el("div", "sc-step-body");
        body.appendChild(el("div", "sc-step-label", step.label));
        if (step.detail) body.appendChild(el("div", "sc-step-detail", step.detail));
        row.appendChild(body);
        read.appendChild(row);
      });
      var actions = el("div", "sc-fb-actions");
      actions.appendChild(primaryButton("Seal the Rite", function () {
        if (state.phase !== "rit-done") return;
        state.score += pts;
        state.recap.push({ title: ritCfg.title || "Order the Ritual", score: pts, max: steps.length });
        renderTeaches(ritCfg.title || "Order the Ritual", ritual.teaches,
          pts, steps.length, function () { renderRoundIntro(3); });
      }));
      read.appendChild(actions);
      card.appendChild(read);
      if (read.scrollIntoView) read.scrollIntoView({ block: "nearest" });
    }

    /* ---------- Round 3 — Trace the Corruption ---------- */

    function renderTrace() {
      state.phase = "trace";
      state.choiceButtons = [];
      content.innerHTML = "";

      var stage = el("div", "sc-stage");
      stage.appendChild(stageHead("Round 3 of 3 · " + (corCfg.title || "Trace the Corruption")));

      var card = el("div", "sc-card");
      card.appendChild(el("div", "sc-card-label", trace.title || "The Trace"));
      card.appendChild(el("p", "sc-scenario", trace.scenario || ""));

      var statusEl = el("div", "sc-status", "False accusations: 0");
      var log = el("div", "sc-trace");
      trace.steps.forEach(function (step, i) {
        var row = el("button", "sc-row");
        row.type = "button";
        row.appendChild(el("span", "sc-row-num", String(i + 1)));
        var body = el("div", "sc-row-body");
        var kindClass = "sc-kind-" + (KIND_LABELS[step.kind] ? step.kind : "agent");
        body.appendChild(el("span", "sc-row-kind " + kindClass,
          KIND_LABELS[step.kind] || KIND_LABELS.agent));
        body.appendChild(el("div", "sc-row-text", step.text));
        if (step.detail) body.appendChild(el("pre", "sc-row-detail", step.detail));
        row.appendChild(body);
        row.addEventListener("click", function () {
          handleTraceRow(i, row, body, statusEl, card, log);
        });
        log.appendChild(row);
        state.choiceButtons.push(row);
      });
      card.appendChild(log);
      card.appendChild(statusEl);

      stage.appendChild(card);
      content.appendChild(stage);
    }

    function handleTraceRow(idx, row, body, statusEl, card, log) {
      if (state.phase !== "trace") return;
      if (idx === trace.corrupted) {
        state.phase = "trace-done";
        markTime();
        var pts = Math.max(0, tracePoints - state.traceWrong);
        state.score += pts;
        state.recap.push({ title: corCfg.title || "Trace the Corruption", score: pts, max: tracePoints });
        sfx(pts > 0 ? "correct" : "wrong");
        state.choiceButtons.forEach(function (b) { b.disabled = true; });
        state.choiceButtons = [];
        row.classList.add("sc-row-corrupt");
        refreshScore();

        var why = el("div", "sc-why");
        why.appendChild(el("div", "sc-why-title", "The Corruption Named"));
        why.appendChild(el("p", "sc-why-text", trace.why || ""));
        var actions = el("div", "sc-fb-actions");
        actions.appendChild(primaryButton("Cleanse the Circle", function () {
          if (state.phase !== "trace-done") return;
          renderTeaches(corCfg.title || "Trace the Corruption", trace.teaches,
            pts, tracePoints, renderEnd);
        }));
        why.appendChild(actions);
        card.appendChild(why);
        if (why.scrollIntoView) why.scrollIntoView({ block: "nearest" });
      } else {
        state.traceWrong += 1;
        sfx("wrong");
        row.disabled = true;
        row.classList.add("sc-row-sound");
        var step = trace.steps[idx];
        var note = el("div", "sc-row-note");
        note.appendChild(el("span", "sc-row-note-mark", "✓ This step holds. "));
        note.appendChild(el("span", "", step.note || "The rot does not begin here."));
        body.appendChild(note);
        statusEl.textContent = "False accusations: " + state.traceWrong;
        statusEl.classList.add("sc-status-hot");
        refreshScore();
      }
    }

    /* ---------- end screen ---------- */

    function renderEnd() {
      state.phase = "end";
      state.choiceButtons = [];
      markTime();
      content.innerHTML = "";

      var panel = el("div", "sc-panel sc-end");
      panel.appendChild(el("div", "sc-eyebrow", "The Trial Ends"));
      panel.appendChild(el("h1", "sc-title", "The Circles Judge"));

      var pct = maxScore > 0 ? Math.round((state.score / maxScore) * 100) : 0;
      var stats = el("div", "sc-stats");
      var s1 = el("div", "sc-stat");
      s1.appendChild(el("div", "sc-stat-big", state.score + " / " + maxScore));
      s1.appendChild(el("div", "sc-stat-label", "essence gathered"));
      stats.appendChild(s1);
      var s2 = el("div", "sc-stat");
      s2.appendChild(el("div", "sc-stat-big", pct + "%"));
      s2.appendChild(el("div", "sc-stat-label", "mastery"));
      stats.appendChild(s2);
      panel.appendChild(stats);

      if (state.recap.length > 0) {
        var recap = el("div", "sc-recap");
        state.recap.forEach(function (r) {
          var row = el("div", "sc-recap-row");
          row.appendChild(el("span", "sc-recap-title", r.title));
          row.appendChild(el("span", "sc-recap-pts", r.score + " / " + r.max));
          recap.appendChild(row);
        });
        panel.appendChild(recap);
      }

      var tiers = (config.tiers || []).slice().sort(function (a, b) {
        return (b.min || 0) - (a.min || 0);
      });
      for (var i = 0; i < tiers.length; i++) {
        if (pct >= (tiers[i].min || 0)) {
          if (tiers[i].line) panel.appendChild(el("p", "sc-tier", tiers[i].line));
          break;
        }
      }

      sfx("victory");
      var actions = el("div", "sc-actions");
      actions.appendChild(primaryButton("Leave the Chamber", function () {
        if (state.phase !== "end") return;
        finish(true);
      }));
      panel.appendChild(actions);
      content.appendChild(panel);
    }

    renderSplash();
  }

  window.Minigames.summoningCircles = { start: start };
})();
