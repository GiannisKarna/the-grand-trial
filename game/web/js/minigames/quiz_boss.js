/*
 * The Grand Trial — Quiz Boss (lesson-gate boss fight)
 *
 * Contract (docs/superpowers/plans/2026-07-17-phase1-contracts.md):
 *   window.Minigames.quizBoss.start(overlayEl, bank, opts, onComplete)
 *     overlayEl : empty fullscreen div provided by the engine
 *     bank      : quiz bank {id, title, boss_name, questions:[{id,type,prompt,code,choices,answer,explain}]}
 *     opts      : {questionCount: int, curseQuestions: [questionObj, ...]}  (curses first, marked visually)
 *     onComplete: called exactly once with
 *       {completed, correct, total, missedQuestionIds, correctQuestionIds, durationSec}
 *
 * Rules: boss HP starts at (questions - (MAX_HEARTS - 1)), so surviving all
 * questions with hearts remaining is always enough damage to win (e.g. 12
 * questions -> 10 HP: up to 2 wrong answers still clears the ~83% mastery bar).
 * Each correct answer deals 1 damage; HP 0 = victory, immediately. The player
 * has 3 heart-gems; each wrong answer shatters one; 0 hearts = defeat
 * (completed:false).
 *
 * This module never touches game state, the network, or engine internals.
 * It cleans up its own DOM (and listeners/timers) before calling onComplete.
 * All dynamic text is inserted via textContent — HTML is always escaped.
 */
(function () {
  "use strict";

  window.Minigames = window.Minigames || {};

  var DEFAULT_QUESTION_COUNT = 12;
  var MAX_HEARTS = 3;

  var TYPE_BADGES = {
    predict: "Foresee the Output",
    bug: "Hunt the Flaw",
    truth: "Truth or Lie"
  };

  var HIT_VERDICTS = [
    "Your rune strikes its heart!",
    "The boss reels from the blow!",
    "A crack splits its armor!",
    "The glyph burns it deep!"
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

  /* ---------- the boss fight ---------- */

  function start(overlayEl, bank, opts, onComplete) {
    opts = opts || {};
    var questions = buildQuestionList(bank, opts, DEFAULT_QUESTION_COUNT);
    var bossName = (bank && bank.boss_name) || "The Nameless Gatekeeper";
    var maxHp = Math.max(1, questions.length - (MAX_HEARTS - 1));

    var state = {
      phase: "intro",        // intro | question | feedback | end
      idx: 0,
      correct: 0,
      hearts: MAX_HEARTS,
      hp: maxHp,
      missedIds: [],
      correctIds: [],
      startedAt: null,
      playSeconds: 0,
      stage: null,
      card: null,
      hudEl: null,
      hpFill: null,
      hpText: null,
      gemEls: [],
      choiceButtons: [],
      finished: false
    };

    var root = el("div", "mg-root mg-boss");
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

    /* ---------- boss intro ---------- */

    function renderIntro() {
      state.phase = "intro";
      root.innerHTML = "";
      var panel = el("div", "mg-panel mg-splash mg-boss-intro");
      panel.appendChild(el("div", "mg-eyebrow", "Quiz Boss"));
      panel.appendChild(el("h1", "mg-title mg-boss-title", bossName));
      if (bank && bank.title) {
        panel.appendChild(el("div", "mg-subtitle", "Guardian of " + bank.title));
      }
      panel.appendChild(el("p", "mg-menace",
        "“None pass while I draw breath. Show me your runes, apprentice — " +
        "and I will show you their flaws.”"));

      if (questions.length === 0) {
        panel.appendChild(el("p", "mg-flavor",
          "Yet the chamber is empty — the boss has no runes to defend."));
      } else {
        var curseCount = questions.filter(function (entry) { return entry.curse; }).length;
        var terms = "It will test you with " + questions.length +
          (questions.length === 1 ? " rune" : " runes") +
          ", but its heart is bound by only " + maxHp +
          ". Each true answer breaks one — break them all and it falls. You carry " + MAX_HEARTS +
          " heart-gems — each false answer shatters one. Lose them all and the trial ends.";
        if (curseCount > 0) {
          terms += " It strikes first with " + curseCount +
            (curseCount === 1 ? " curse" : " curses") + " it remembers.";
        }
        panel.appendChild(el("p", "mg-flavor", terms));
      }

      var btn = el("button", "mg-primary",
        questions.length ? "Face the Boss" : "Withdraw");
      btn.type = "button";
      btn.addEventListener("click", function () {
        if (state.phase !== "intro") return;
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

    /* ---------- battle screen ---------- */

    function renderQuestion() {
      state.phase = "question";
      root.innerHTML = "";
      state.choiceButtons = [];

      var entry = questions[state.idx];
      var q = entry.q;

      var stage = el("div", "mg-stage");
      state.stage = stage;

      var hud = el("div", "mg-bosshud");
      state.hudEl = hud;
      var hudRow = el("div", "mg-bosshud-row");
      hudRow.appendChild(el("div", "mg-boss-name", bossName));
      var hpText = el("div", "mg-hp-text", state.hp + " / " + maxHp + " HP");
      state.hpText = hpText;
      hudRow.appendChild(hpText);
      hud.appendChild(hudRow);
      var hpBar = el("div", "mg-hpbar");
      var hpFill = el("div", "mg-hpbar-fill");
      hpFill.style.width = ((state.hp / maxHp) * 100) + "%";
      state.hpFill = hpFill;
      hpBar.appendChild(hpFill);
      hud.appendChild(hpBar);
      stage.appendChild(hud);

      var subhead = el("div", "mg-subhead");
      subhead.appendChild(el("div", "mg-progress",
        "Rune " + (state.idx + 1) + " of " + questions.length));
      var hearts = el("div", "mg-hearts");
      state.gemEls = [];
      for (var g = 0; g < MAX_HEARTS; g++) {
        var gem = el("span", "mg-gem" + (g < state.hearts ? "" : " mg-gem-dead"));
        hearts.appendChild(gem);
        state.gemEls.push(gem);
      }
      subhead.appendChild(hearts);
      stage.appendChild(subhead);

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
    }

    /* ---------- answer + mandatory feedback ---------- */

    function handleAnswer(choiceIdx) {
      if (state.phase !== "question") return;
      state.phase = "feedback";

      var entry = questions[state.idx];
      var q = entry.q;
      var ok = choiceIdx === q.answer;
      state.playSeconds = Math.round((Date.now() - state.startedAt) / 1000);

      if (ok) {
        state.correct += 1;
        state.correctIds.push(q.id);
        state.hp = Math.max(0, state.hp - 1);
        state.hpFill.style.width = ((state.hp / maxHp) * 100) + "%";
        state.hpText.textContent = state.hp + " / " + maxHp + " HP";
        var hud = state.hudEl;
        hud.classList.add("mg-hit");
        setTimeout(function () { hud.classList.remove("mg-hit"); }, 700);
      } else {
        state.missedIds.push(q.id);
        state.hearts -= 1;
        var gem = state.gemEls[state.hearts];
        if (gem) gem.classList.add("mg-gem-lost");
        root.classList.add("mg-shake");
        setTimeout(function () { root.classList.remove("mg-shake"); }, 600);
      }

      state.choiceButtons.forEach(function (btn, i) {
        btn.disabled = true;
        if (i === q.answer) btn.classList.add("mg-choice-correct");
        else if (i === choiceIdx) btn.classList.add("mg-choice-wrong");
      });

      /* Feedback is the teaching moment: always shown, never auto-advanced. */
      var fb = el("div", "mg-feedback " + (ok ? "mg-fb-good" : "mg-fb-bad"));
      var verdict = ok
        ? HIT_VERDICTS[Math.floor(Math.random() * HIT_VERDICTS.length)]
        : "Your rune misfires — a heart-gem shatters.";
      fb.appendChild(el("div", "mg-fb-verdict", verdict));

      if (!ok) {
        var ans = el("div",
          "mg-fb-answer" + (q.type === "predict" ? " mg-mono" : ""));
        ans.appendChild(el("span", "mg-fb-answer-label", "The true rune: "));
        ans.appendChild(el("span", "", q.choices[q.answer]));
        fb.appendChild(ans);
      }
      if (q.explain) fb.appendChild(el("div", "mg-fb-explain", q.explain));

      var last = state.hearts <= 0 || state.hp <= 0 || state.idx + 1 >= questions.length;
      var cont = el("button", "mg-primary", last ? "Face the Outcome" : "Continue");
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
      if (state.hp <= 0) {
        renderVictory();
        return;
      }
      if (state.hearts <= 0) {
        renderDefeat(false);
        return;
      }
      state.idx += 1;
      if (state.idx >= questions.length) {
        renderDefeat(true);
        return;
      }
      renderQuestion();
    }

    /* ---------- outcomes ---------- */

    function appendStats(panel) {
      var stats = el("div", "mg-stats");
      var s1 = el("div", "mg-stat");
      s1.appendChild(el("div", "mg-stat-big", state.correct + " / " + questions.length));
      s1.appendChild(el("div", "mg-stat-label", "runes struck true"));
      stats.appendChild(s1);
      var s2 = el("div", "mg-stat");
      s2.appendChild(el("div", "mg-stat-big", String(state.hearts)));
      s2.appendChild(el("div", "mg-stat-label", "heart-gems left"));
      stats.appendChild(s2);
      panel.appendChild(stats);
    }

    function renderVictory() {
      state.phase = "end";
      root.innerHTML = "";
      var panel = el("div", "mg-panel mg-victory");
      var rays = el("div", "mg-rays");
      panel.appendChild(rays);
      var inner = el("div", "mg-victory-inner");
      inner.appendChild(el("div", "mg-eyebrow", "Victory"));
      inner.appendChild(el("h1", "mg-title mg-victory-title", "The Boss Falls"));
      inner.appendChild(el("p", "mg-flavor",
        bossName + " shatters into motes of golden light. The way beyond lies open."));
      appendStats(inner);
      var btn = el("button", "mg-primary", "Return in Glory");
      btn.type = "button";
      btn.addEventListener("click", function () { finish(true); });
      var actions = el("div", "mg-actions");
      actions.appendChild(btn);
      inner.appendChild(actions);
      panel.appendChild(inner);
      root.appendChild(panel);
    }

    function renderDefeat(endures) {
      state.phase = "end";
      root.innerHTML = "";
      var panel = el("div", "mg-panel mg-defeat");
      if (endures) {
        panel.appendChild(el("div", "mg-eyebrow", "The Boss Endures"));
        panel.appendChild(el("h1", "mg-title mg-defeat-title", "Its Heart Still Beats"));
        panel.appendChild(el("p", "mg-menace",
          "“Close, apprentice… but close feeds no dragons.” " +
          bossName + "'s heart still holds " + state.hp +
          (state.hp === 1 ? " unbroken rune." : " unbroken runes.")));
        panel.appendChild(el("p", "mg-flavor",
          "Only a flawless assault fells a boss — every rune must be struck true. " +
          "Study what broke against its armor, then return. It can be done."));
      } else {
        panel.appendChild(el("div", "mg-eyebrow", "Defeat"));
        panel.appendChild(el("h1", "mg-title mg-defeat-title", "Your Gems Lie Shattered"));
        panel.appendChild(el("p", "mg-menace",
          bossName + " looms over you: “Is that all, apprentice? " +
          "Crawl back to your scrolls.”"));
        panel.appendChild(el("p", "mg-flavor",
          "Every master has fallen in this chamber. Cleanse your curses in the " +
          "daily drills, sharpen your runes, and its heart WILL break."));
      }
      if (state.missedIds.length > 0) {
        panel.appendChild(el("p", "mg-curse-note",
          state.missedIds.length === 1
            ? "1 curse has latched onto you."
            : state.missedIds.length + " curses have latched onto you."));
      }
      appendStats(panel);
      var btn = el("button", "mg-primary", "Retreat — For Now");
      btn.type = "button";
      btn.addEventListener("click", function () { finish(false); });
      var actions = el("div", "mg-actions");
      actions.appendChild(btn);
      panel.appendChild(actions);
      root.appendChild(panel);
    }

    renderIntro();
  }

  window.Minigames.quizBoss = { start: start };
})();
