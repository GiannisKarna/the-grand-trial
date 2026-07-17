/*
 * The Grand Trial — Rune Trials (daily drill minigame)
 *
 * Contract (docs/superpowers/plans/2026-07-17-phase1-contracts.md):
 *   window.Minigames.runeTrials.start(overlayEl, bank, opts, onComplete)
 *     overlayEl : empty fullscreen div provided by the engine
 *     bank      : quiz bank {id, title, boss_name, questions:[{id,type,prompt,code,choices,answer,explain}]}
 *     opts      : {questionCount: int, curseQuestions: [questionObj, ...]}  (curses first, marked visually)
 *     onComplete: called exactly once with
 *       {completed, correct, total, missedQuestionIds, correctQuestionIds, durationSec}
 *
 * This module never touches game state, the network, or engine internals.
 * It cleans up its own DOM (and listeners/timers) before calling onComplete.
 * All dynamic text is inserted via textContent — HTML is always escaped.
 */
(function () {
  "use strict";

  window.Minigames = window.Minigames || {};

  var TIMER_SECONDS = 45;
  var DEFAULT_QUESTION_COUNT = 10;

  var TYPE_BADGES = {
    predict: "Foresee the Output",
    bug: "Hunt the Flaw",
    truth: "Truth or Lie"
  };

  var CORRECT_VERDICTS = [
    "The rune ignites!",
    "Struck true!",
    "The glyph yields to you!",
    "A clean strike!"
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

  /*
   * Curse questions come first (flagged), then random non-duplicate bank
   * questions up to `questionCount`. A bank with fewer questions than needed
   * simply yields fewer entries (all of them, shuffled).
   */
  function buildQuestionList(bank, opts, defaultCount) {
    var count = (opts && Number.isInteger(opts.questionCount) && opts.questionCount > 0)
      ? opts.questionCount
      : defaultCount;
    var curses = ((opts && opts.curseQuestions) || []).slice(0, count);
    var curseIds = {};
    curses.forEach(function (q) { curseIds[q.id] = true; });
    var pool = ((bank && bank.questions) || []).filter(function (q) {
      return !curseIds[q.id];
    });
    shuffle(pool);
    var fill = pool.slice(0, Math.max(0, count - curses.length));
    return curses.map(function (q) { return { q: q, curse: true }; })
      .concat(fill.map(function (q) { return { q: q, curse: false }; }));
  }

  /* ---------- the minigame ---------- */

  function start(overlayEl, bank, opts, onComplete) {
    opts = opts || {};
    var questions = buildQuestionList(bank, opts, DEFAULT_QUESTION_COUNT);

    var state = {
      phase: "splash",      // splash | question | feedback | end
      idx: 0,
      correct: 0,
      combo: 0,
      bestCombo: 0,
      missedIds: [],
      correctIds: [],
      recap: [],            // {q, curse, ok} per question, in play order
      startedAt: null,
      playSeconds: 0,
      timerId: null,
      timerFill: null,
      comboEl: null,
      stage: null,
      card: null,
      choiceButtons: [],
      finished: false
    };

    var root = el("div", "mg-root mg-trials");
    overlayEl.appendChild(root);

    function onKeyDown(e) {
      if (state.finished || e.ctrlKey || e.altKey || e.metaKey) return;
      if (state.phase === "question") {
        var n = parseInt(e.key, 10);
        if (!Number.isNaN(n) && n >= 1 && n <= state.choiceButtons.length) {
          e.preventDefault();
          state.choiceButtons[n - 1].click();
        }
      } else if (e.key === "Enter" || e.key === " ") {
        var btn = root.querySelector(".mg-primary");
        if (btn) {
          e.preventDefault();
          btn.click();
        }
      }
    }
    document.addEventListener("keydown", onKeyDown);

    function cleanup() {
      if (state.timerId) {
        clearTimeout(state.timerId);
        state.timerId = null;
      }
      document.removeEventListener("keydown", onKeyDown);
      if (root.parentNode) root.parentNode.removeChild(root);
    }

    function finish(completed) {
      if (state.finished) return;
      state.finished = true;
      var result = {
        completed: completed,
        correct: state.correct,
        total: questions.length,
        missedQuestionIds: state.missedIds.slice(),
        correctQuestionIds: state.correctIds.slice(),
        durationSec: state.playSeconds
      };
      cleanup();
      onComplete(result);
    }

    /* ---------- title splash ---------- */

    function renderSplash() {
      state.phase = "splash";
      root.innerHTML = "";
      var panel = el("div", "mg-panel mg-splash");
      panel.appendChild(el("div", "mg-splash-glyph", "✦"));
      panel.appendChild(el("div", "mg-eyebrow", "Daily Drill"));
      panel.appendChild(el("h1", "mg-title", "The Rune Trials"));
      if (bank && bank.title) panel.appendChild(el("div", "mg-subtitle", bank.title));

      var curseCount = questions.filter(function (entry) { return entry.curse; }).length;
      var flavor;
      if (questions.length === 0) {
        flavor = "The trial grounds lie silent — no runes to face.";
      } else {
        flavor = questions.length + " runes await your judgment. " + TIMER_SECONDS +
          " grains of sand per rune.";
        if (curseCount > 0) {
          flavor += " " + curseCount + (curseCount === 1 ? " curse stirs" : " curses stir") +
            " in the dark — you face them first.";
        }
      }
      panel.appendChild(el("p", "mg-flavor", flavor));

      var btn = el("button", "mg-primary", questions.length ? "Begin the Trial" : "Withdraw");
      btn.type = "button";
      btn.addEventListener("click", function () {
        if (state.phase !== "splash") return;
        if (questions.length === 0) {
          finish(false);
          return;
        }
        state.startedAt = Date.now();
        renderQuestion();
      });
      var actions = el("div", "mg-actions");
      actions.appendChild(btn);
      panel.appendChild(actions);
      root.appendChild(panel);
    }

    /* ---------- one question ---------- */

    function renderQuestion() {
      state.phase = "question";
      root.innerHTML = "";
      state.choiceButtons = [];

      var entry = questions[state.idx];
      var q = entry.q;

      var stage = el("div", "mg-stage");
      state.stage = stage;

      var head = el("div", "mg-head");
      head.appendChild(el("div", "mg-progress",
        "Rune " + (state.idx + 1) + " of " + questions.length));
      var comboEl = el("div", "mg-combo",
        state.combo > 0 ? "Combo ×" + state.combo : "");
      head.appendChild(comboEl);
      state.comboEl = comboEl;
      stage.appendChild(head);

      var timer = el("div", "mg-timer");
      var fill = el("div", "mg-timer-fill");
      fill.style.animation = "mg-timer-drain " + TIMER_SECONDS + "s linear forwards";
      timer.appendChild(fill);
      state.timerFill = fill;
      stage.appendChild(timer);

      if (entry.curse) {
        stage.appendChild(el("div", "mg-curse-banner", "☠ CURSE ATTACK ☠"));
      }

      var card = el("div", "mg-card");
      state.card = card;

      var badges = el("div", "mg-badges");
      badges.appendChild(el("span", "mg-badge", TYPE_BADGES[q.type] || "Trial"));
      if (entry.curse) {
        badges.appendChild(el("span", "mg-badge mg-badge-curse", "An old wound reopens"));
      }
      card.appendChild(badges);

      card.appendChild(el("p", "mg-prompt", q.prompt));
      if (q.code) card.appendChild(el("pre", "mg-code", q.code));

      var choices = el("div",
        "mg-choices" + (q.type === "predict" ? " mg-choices-mono" : ""));
      q.choices.forEach(function (choiceText, i) {
        var btn = el("button", "mg-choice");
        btn.type = "button";
        btn.appendChild(el("span", "mg-choice-key", String(i + 1)));
        btn.appendChild(el("span", "mg-choice-text", choiceText));
        btn.addEventListener("click", function () { handleAnswer(i); });
        choices.appendChild(btn);
        state.choiceButtons.push(btn);
      });
      card.appendChild(choices);

      stage.appendChild(card);
      root.appendChild(stage);

      state.timerId = setTimeout(function () { handleAnswer(-1); }, TIMER_SECONDS * 1000);
    }

    /* ---------- answer + mandatory feedback ---------- */

    function handleAnswer(choiceIdx) {
      if (state.phase !== "question") return;
      state.phase = "feedback";

      if (state.timerId) {
        clearTimeout(state.timerId);
        state.timerId = null;
      }
      if (state.timerFill) state.timerFill.style.animationPlayState = "paused";

      var entry = questions[state.idx];
      var q = entry.q;
      var timedOut = choiceIdx < 0;
      var ok = choiceIdx === q.answer;
      state.playSeconds = Math.round((Date.now() - state.startedAt) / 1000);
      state.recap.push({ q: q, curse: entry.curse, ok: ok });

      var comboBroke = false;
      if (ok) {
        state.correct += 1;
        state.correctIds.push(q.id);
        state.combo += 1;
        if (state.combo > state.bestCombo) state.bestCombo = state.combo;
      } else {
        state.missedIds.push(q.id);
        comboBroke = state.combo >= 2;
        state.combo = 0;
      }

      state.choiceButtons.forEach(function (btn, i) {
        btn.disabled = true;
        if (i === q.answer) btn.classList.add("mg-choice-correct");
        else if (i === choiceIdx) btn.classList.add("mg-choice-wrong");
      });

      if (ok) {
        var flash = el("div", "mg-flash");
        flash.addEventListener("animationend", function () {
          if (flash.parentNode) flash.parentNode.removeChild(flash);
        });
        state.stage.appendChild(flash);
        state.comboEl.textContent = "Combo ×" + state.combo;
        state.comboEl.classList.remove("mg-combo-pop");
        void state.comboEl.offsetWidth; /* restart the pop animation */
        state.comboEl.classList.add("mg-combo-pop");
      } else if (comboBroke) {
        state.comboEl.textContent = "COMBO BROKEN";
        state.comboEl.classList.add("mg-combo-broken");
      } else {
        state.comboEl.textContent = "";
      }

      /* Feedback is the teaching moment: always shown, never auto-advanced. */
      var fb = el("div", "mg-feedback " + (ok ? "mg-fb-good" : "mg-fb-bad"));
      var verdict = ok
        ? CORRECT_VERDICTS[Math.floor(Math.random() * CORRECT_VERDICTS.length)]
        : (timedOut ? "The sands run out — the rune fades." : "The rune shatters.");
      fb.appendChild(el("div", "mg-fb-verdict", verdict));

      if (!ok) {
        var ans = el("div",
          "mg-fb-answer" + (q.type === "predict" ? " mg-mono" : ""));
        ans.appendChild(el("span", "mg-fb-answer-label", "The true rune: "));
        ans.appendChild(el("span", "", q.choices[q.answer]));
        fb.appendChild(ans);
      }
      if (q.explain) fb.appendChild(el("div", "mg-fb-explain", q.explain));

      var cont = el("button", "mg-primary",
        state.idx + 1 >= questions.length ? "See the Verdict" : "Continue");
      cont.type = "button";
      cont.addEventListener("click", advance);
      var actions = el("div", "mg-fb-actions");
      actions.appendChild(cont);
      fb.appendChild(actions);

      state.card.appendChild(fb);
      if (fb.scrollIntoView) fb.scrollIntoView({ block: "nearest" });
    }

    function advance() {
      if (state.phase !== "feedback") return;
      state.idx += 1;
      if (state.idx >= questions.length) renderEnd();
      else renderQuestion();
    }

    /* ---------- end screen ---------- */

    function renderEnd() {
      state.phase = "end";
      root.innerHTML = "";
      var panel = el("div", "mg-panel mg-end");
      panel.appendChild(el("div", "mg-eyebrow", "The Trial Ends"));
      panel.appendChild(el("h1", "mg-title", "Runes Judged"));

      var stats = el("div", "mg-stats");
      var s1 = el("div", "mg-stat");
      s1.appendChild(el("div", "mg-stat-big", state.correct + " / " + questions.length));
      s1.appendChild(el("div", "mg-stat-label", "runes struck true"));
      stats.appendChild(s1);
      var s2 = el("div", "mg-stat");
      s2.appendChild(el("div", "mg-stat-big", "×" + state.bestCombo));
      s2.appendChild(el("div", "mg-stat-label", "best combo"));
      stats.appendChild(s2);
      panel.appendChild(stats);

      if (state.recap.length > 0) {
        var list = el("div", "mg-recap");
        state.recap.forEach(function (r) {
          var row = el("div", "mg-recap-row " + (r.ok ? "mg-recap-good" : "mg-recap-bad"));
          row.appendChild(el("span", "mg-recap-mark", r.ok ? "✓" : "✕"));
          var body = el("div", "mg-recap-body");
          body.appendChild(el("div", "mg-recap-prompt",
            (r.curse ? "[curse] " : "") + r.q.prompt));
          if (!r.ok) {
            body.appendChild(el("div",
              "mg-recap-answer" + (r.q.type === "predict" ? " mg-mono" : ""),
              "Answer: " + r.q.choices[r.q.answer]));
          }
          row.appendChild(body);
          list.appendChild(row);
        });
        panel.appendChild(list);
      }

      var btn = el("button", "mg-primary", "Claim Your Reward");
      btn.type = "button";
      btn.addEventListener("click", function () { finish(true); });
      var actions = el("div", "mg-actions");
      actions.appendChild(btn);
      panel.appendChild(actions);
      root.appendChild(panel);
    }

    renderSplash();
  }

  window.Minigames.runeTrials = { start: start };
})();
