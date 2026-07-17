/*
 * The Grand Trial — The Dragon (final boss gauntlet, Phase 3)
 *
 * Contract (docs/superpowers/plans/2026-07-18-phase23-contracts.md):
 *   window.Minigames.dragonGauntlet.start(overlayEl, config, opts, onComplete)
 *     overlayEl : empty fullscreen div provided by the engine
 *     config    : parsed game/content/minigames/dragon-gauntlet.json
 *                 {hp, hearts, phase1:{count,timer_sec}, phase2:{count,timer_sec},
 *                  phase3_picks, phase3:[scenario...], dragon_name, title}
 *     opts      : {practice: bool, banks: [ALL loaded quiz-bank objects]}
 *     onComplete: called exactly once with
 *       {completed, score, max, durationSec, missedQuestionIds, correctQuestionIds}
 *       score = damage dealt, max = max damage available this run.
 *       missed/correct question ids come from the quiz phases (1-2) ONLY —
 *       Riddle-of-Scale scenarios never feed the curse system.
 *
 * The fight: three phases sharing one pool of 5 heart-gems.
 *   Phase 1 "Breath of Questions" — 10 questions sampled evenly across all
 *     banks, 20 s each, 1 wound per true answer.
 *   Phase 2 "Wings of Deception"  — 8 bug-type questions, 30 s each, 1 wound.
 *   Phase 3 "The Riddle of Scale" — 3 system-design scenario picks from
 *     config.phase3, untimed, 2 wounds per true answer, debrief after each.
 * Defeat at 0 hearts. Victory the instant HP reaches 0 (damage clamps; any
 * remaining content is skipped). If all content is exhausted with HP > 0 and
 * hearts > 0, the Dragon ENDURES — completed:false, no flawless-run stalemate
 * ambiguity: the outcome screen states exactly how much damage was forfeit.
 *
 * BALANCE MATH (the Phase-1 lesson: never demand a flawless run):
 *   Max damage with full content = 10×1 + 8×1 + 3×2 = 24.
 *   config.hp = 19  →  24 − 19 = 5 points of forgivable (forfeitable) damage.
 *   A missed quiz question forfeits 1 damage + 1 heart; a missed scenario
 *   forfeits 2 damage + 1 heart; 5 hearts, defeat on the 5th miss.
 *   Victory condition  ⇔  misses ≤ 4  AND  quizMisses + 2·riddleMisses ≤ 5:
 *     – up to 4 quiz-phase misses (hearts 5→1) still deal 20 ≥ 19: victory;
 *     – any 3 misses win UNLESS all three are Riddle misses (forfeit 6 > 5);
 *     – 2 Riddle misses survive with at most 1 quiz miss (2·2+1 = 5 ≤ 5);
 *     – 5 misses of any mix = 0 hearts = defeat regardless of HP.
 *   So the HP bar forgives up to 5 forfeited damage while the hearts forgive
 *   up to 4 mistakes — no flawless run required, but Riddles (worth 2) punish
 *   twice as hard, which the Phase-3 intro card says out loud.
 *   If the banks ship less content than configured (e.g. fewer than 8 bug
 *   questions exist today), phases shrink and HP shrinks with them so the
 *   SAME 5-point slack is preserved:
 *     effectiveHp = max(1, actualMaxDamage − (configMaxDamage − config.hp)).
 *
 * This module never touches game state, the network, or engine internals.
 * It cleans up its own DOM (and listeners/timers) before calling onComplete.
 * All dynamic text is inserted via textContent — HTML is always escaped.
 * SFX are optional: window.Game.SFX is used only if the engine shipped it.
 */
(function () {
  "use strict";

  window.Minigames = window.Minigames || {};

  var DEFAULTS = {
    hp: 19,
    hearts: 5,
    phase1Count: 10,
    phase1Timer: 20,
    phase2Count: 8,
    phase2Timer: 30,
    phase3Picks: 3
  };

  var NUMERALS = ["I", "II", "III", "IV", "V"];

  var TYPE_BADGES = {
    predict: "Foresee the Output",
    bug: "Hunt the Flaw",
    truth: "Truth or Lie"
  };

  var WOUND_VERDICTS = [
    "Your answer bites through the scale!",
    "The Dragon recoils — a wound opens!",
    "Golden light cracks its hide!",
    "It roars — you have hurt it!"
  ];

  var RIDDLE_WOUND_VERDICTS = [
    "The riddle breaks — your blade goes twice as deep!",
    "It bows its head an inch — two wounds at once!"
  ];

  var DRAGON_ART = [
    "               __====-_    _-====__",
    "        _--^^^########\\    /########^^^--_",
    "      _-^###########\\ (    ) /###########^-_",
    "     -#############\\  |\\^^/|  /#############-",
    "  _/##############\\   (@::@)   /##############\\_",
    " /################((    \\/    ))################\\",
    "-##################\\   (oo)   /##################-",
    " -###################\\ /VV\\ /###################-",
    "    \\#############/\\###\\/\\/###/\\#############/",
    "     \\__#######__/  \\###\\/###/  \\__#######__/",
    "          ~~~~       \\##||##/       ~~~~",
    "                      \\#\\/#/"
  ].join("\n");

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

  function posInt(value, fallback) {
    return (Number.isInteger(value) && value > 0) ? value : fallback;
  }

  function sfx(name) {
    if (window.Game && window.Game.SFX && typeof window.Game.SFX.play === "function") {
      try { window.Game.SFX.play(name); } catch (e) { /* sound is optional */ }
    }
  }

  function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  /*
   * Round-robin draw: one item from each non-empty pool in turn until `count`
   * items are collected or every pool runs dry. Pools arrive pre-shuffled, so
   * this samples evenly across banks without duplicates.
   */
  function roundRobin(pools, count) {
    var active = pools.map(function (p) { return p.slice(); });
    shuffle(active);
    var out = [];
    while (out.length < count) {
      var progressed = false;
      for (var i = 0; i < active.length && out.length < count; i++) {
        if (active[i].length > 0) {
          out.push(active[i].shift());
          progressed = true;
        }
      }
      if (!progressed) break;
    }
    return out;
  }

  /* ---------- the gauntlet ---------- */

  function start(overlayEl, config, opts, onComplete) {
    config = config || {};
    opts = opts || {};

    var cfgP1 = config.phase1 || {};
    var cfgP2 = config.phase2 || {};
    var p1Count = posInt(cfgP1.count, DEFAULTS.phase1Count);
    var p1Timer = posInt(cfgP1.timer_sec, DEFAULTS.phase1Timer);
    var p2Count = posInt(cfgP2.count, DEFAULTS.phase2Count);
    var p2Timer = posInt(cfgP2.timer_sec, DEFAULTS.phase2Timer);
    var p3Picks = posInt(config.phase3_picks, DEFAULTS.phase3Picks);
    var maxHearts = posInt(config.hearts, DEFAULTS.hearts);
    var cfgHp = posInt(config.hp, DEFAULTS.hp);
    var dragonName = config.dragon_name || "The Dragon";

    /* --- sample content: Wings (bug-only) first so Breath never repeats it --- */

    var banks = Array.isArray(opts.banks) ? opts.banks : [];
    var perBank = banks.map(function (b) {
      return shuffle(((b && b.questions) || []).filter(function (q) {
        return q && Array.isArray(q.choices) && Number.isInteger(q.answer);
      }));
    });
    var bugPools = perBank.map(function (pool) {
      return pool.filter(function (q) { return q.type === "bug"; });
    });
    var wings = roundRobin(bugPools, p2Count);
    var usedIds = {};
    wings.forEach(function (q) { usedIds[q.id] = true; });
    var mainPools = perBank.map(function (pool) {
      return pool.filter(function (q) { return !usedIds[q.id]; });
    });
    var breath = roundRobin(mainPools, p1Count);
    var riddles = shuffle((Array.isArray(config.phase3) ? config.phase3 : []).slice())
      .slice(0, p3Picks);

    /* --- balance: preserve the config's damage slack at any content size --- */

    var configMaxDamage = p1Count + p2Count + 2 * p3Picks;      /* 24 as shipped */
    var slack = Math.max(0, configMaxDamage - cfgHp);           /* 5 as shipped  */
    var maxDamage = breath.length + wings.length + 2 * riddles.length;
    var maxHp = Math.max(1, maxDamage - slack);

    var phases = [];
    if (breath.length > 0) {
      phases.push({
        kind: "quiz", name: "Breath of Questions", items: breath, timer: p1Timer,
        hits: 0, misses: 0,
        flavor: "It opens its maw — and the air itself becomes questions. " +
          "Every land you have crossed, every rune you have learned, returns at once.",
        rule: breath.length + " questions · " + p1Timer +
          " grains of sand each · a true answer deals 1 wound"
      });
    }
    if (wings.length > 0) {
      phases.push({
        kind: "quiz", name: "Wings of Deception", items: wings, timer: p2Timer,
        hits: 0, misses: 0,
        flavor: "Its wings blot the sky and scatter broken code across it. " +
          "Every question hides a flaw already woven in. Find each one.",
        rule: wings.length + " flawed runes · " + p2Timer +
          " grains of sand each · a true answer deals 1 wound"
      });
    }
    if (riddles.length > 0) {
      phases.push({
        kind: "riddle", name: "The Riddle of Scale", items: riddles, timer: 0,
        hits: 0, misses: 0,
        flavor: "The Dragon stills, folds its wings, and speaks to you as an equal. " +
          "Riddles of production and scale — no sand runs here. Think. " +
          "But know this: a wrong design cuts you as deep, and a true one cuts twice as deep into IT.",
        rule: riddles.length + " riddles · no timer · a true answer deals 2 wounds"
      });
    }

    var state = {
      phase: "intro",        /* intro | phaseintro | question | feedback | end */
      pIdx: 0,
      idx: 0,
      damage: 0,
      hp: maxHp,
      hearts: maxHearts,
      missedIds: [],
      correctIds: [],
      startedAt: null,
      playSeconds: 0,
      timerId: null,
      timerFill: null,
      screen: null,
      hudEl: null,
      hpFill: null,
      hpText: null,
      gemEls: [],
      card: null,
      choiceButtons: [],
      finished: false
    };

    var root = el("div", "dg-root");
    if (opts.practice) {
      root.appendChild(el("div", "dg-ribbon", "Practice run — no XP"));
    }
    var screen = el("div", "dg-screen");
    state.screen = screen;
    root.appendChild(screen);
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
        var btn = root.querySelector ? root.querySelector(".dg-primary") : null;
        if (btn) {
          e.preventDefault();
          btn.click();
        }
      }
    }
    document.addEventListener("keydown", onKeyDown);

    function stopTimer() {
      if (state.timerId) {
        clearTimeout(state.timerId);
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
        score: state.damage,
        max: maxDamage,
        durationSec: state.playSeconds,
        missedQuestionIds: state.missedIds.slice(),
        correctQuestionIds: state.correctIds.slice()
      };
      cleanup();
      onComplete(result);
    }

    function markTime() {
      if (state.startedAt) {
        state.playSeconds = Math.round((Date.now() - state.startedAt) / 1000);
      }
    }

    /* ---------- shared chrome ---------- */

    function shake() {
      state.screen.classList.remove("dg-shake");
      if (state.screen.offsetWidth !== undefined) { void state.screen.offsetWidth; }
      state.screen.classList.add("dg-shake");
    }

    function buildHud(mini) {
      var hud = el("div", "dg-hud");
      state.hudEl = hud;
      if (mini) hud.appendChild(el("pre", "dg-dragon dg-dragon-mini", DRAGON_ART));
      var row = el("div", "dg-hud-row");
      row.appendChild(el("div", "dg-name", dragonName));
      var hpText = el("div", "dg-hp-text", state.hp + " / " + maxHp + " HP");
      state.hpText = hpText;
      row.appendChild(hpText);
      hud.appendChild(row);
      var bar = el("div", "dg-hpbar");
      var fill = el("div", "dg-hpbar-fill");
      fill.style.width = ((state.hp / maxHp) * 100) + "%";
      state.hpFill = fill;
      bar.appendChild(fill);
      hud.appendChild(bar);
      return hud;
    }

    function buildHearts() {
      var hearts = el("div", "dg-hearts");
      state.gemEls = [];
      for (var g = 0; g < maxHearts; g++) {
        var gem = el("span", "dg-gem" + (g < state.hearts ? "" : " dg-gem-dead"));
        hearts.appendChild(gem);
        state.gemEls.push(gem);
      }
      return hearts;
    }

    /* ---------- the gates of the keep (intro) ---------- */

    function renderIntro() {
      state.phase = "intro";
      screen.innerHTML = "";
      var panel = el("div", "dg-panel dg-splash");
      panel.appendChild(el("div", "dg-eyebrow", "The Final Trial"));
      panel.appendChild(el("h1", "dg-title", "THE DRAGON"));
      panel.appendChild(el("div", "dg-subtitle", dragonName));
      panel.appendChild(el("pre", "dg-dragon", DRAGON_ART));

      if (maxDamage === 0) {
        panel.appendChild(el("p", "dg-flavor",
          "The keep stands silent. The Dragon has no questions for you — " +
          "no banks, no riddles, nothing to face. Return when the realm is stocked."));
        var wd = el("button", "dg-primary", "Withdraw");
        wd.type = "button";
        wd.addEventListener("click", function () { finish(false); });
        var wdRow = el("div", "dg-actions");
        wdRow.appendChild(wd);
        panel.appendChild(wdRow);
        screen.appendChild(panel);
        return;
      }

      panel.appendChild(el("p", "dg-menace",
        "“So. The apprentice climbs my stair at last. Every gate you passed, " +
        "every keeper you broke — they were my breath drawn in. Now I exhale.”"));

      var phaseList = el("div", "dg-phase-list");
      phases.forEach(function (ph, i) {
        var rowEl = el("div", "dg-phase-list-row");
        rowEl.appendChild(el("span", "dg-phase-list-numeral", NUMERALS[i] || String(i + 1)));
        var body = el("span", "dg-phase-list-body");
        body.appendChild(el("span", "dg-phase-list-name", ph.name));
        body.appendChild(el("span", "dg-phase-list-rule", ph.rule));
        rowEl.appendChild(body);
        phaseList.appendChild(rowEl);
      });
      panel.appendChild(phaseList);

      panel.appendChild(el("p", "dg-flavor",
        "Its hide holds " + maxHp + " wounds; your answers are the only blade. " +
        "You carry " + maxHearts + " heart-gems — each false answer shatters one, " +
        "in every phase alike. The gauntlet forgives up to " + slack +
        " forfeited wounds of damage — no more. No flawless run is demanded. Almost none is."));

      var btn = el("button", "dg-primary", "Enter the Keep");
      btn.type = "button";
      btn.addEventListener("click", function () {
        if (state.phase !== "intro") return;
        state.startedAt = Date.now();
        sfx("click");
        renderPhaseIntro(0);
      });
      var actions = el("div", "dg-actions");
      actions.appendChild(btn);
      panel.appendChild(actions);
      screen.appendChild(panel);
    }

    /* ---------- phase intro cards ---------- */

    function renderPhaseIntro(i) {
      state.phase = "phaseintro";
      screen.innerHTML = "";
      var ph = phases[i];
      var panel = el("div", "dg-panel dg-phasecard");
      panel.appendChild(el("div", "dg-eyebrow",
        "Phase " + (NUMERALS[i] || String(i + 1)) + " of " + phases.length));
      panel.appendChild(el("h1", "dg-title dg-phase-title", ph.name));
      panel.appendChild(el("pre", "dg-dragon dg-dragon-small", DRAGON_ART));
      panel.appendChild(el("p", "dg-menace", ph.flavor));
      panel.appendChild(el("div", "dg-phase-rule", ph.rule));

      var status = el("div", "dg-status-strip");
      var s1 = el("span", "dg-status-bit", "Dragon: " + state.hp + " / " + maxHp + " HP");
      status.appendChild(s1);
      status.appendChild(el("span", "dg-status-bit",
        "Heart-gems: " + state.hearts + " / " + maxHearts));
      panel.appendChild(status);

      var btn = el("button", "dg-primary", "Face the " + ph.name);
      btn.type = "button";
      btn.addEventListener("click", function () {
        if (state.phase !== "phaseintro") return;
        sfx("click");
        renderItem();
      });
      var actions = el("div", "dg-actions");
      actions.appendChild(btn);
      panel.appendChild(actions);
      screen.appendChild(panel);
    }

    /* ---------- one item (question or riddle) ---------- */

    function renderItem() {
      var ph = phases[state.pIdx];
      if (ph.kind === "quiz") renderQuestion(ph);
      else renderScenario(ph);
    }

    function buildStageHead(ph) {
      var stage = el("div", "dg-stage");
      stage.appendChild(buildHud(true));
      var subhead = el("div", "dg-subhead");
      subhead.appendChild(el("div", "dg-progress",
        "Phase " + (NUMERALS[state.pIdx] || String(state.pIdx + 1)) + " · " + ph.name +
        " — " + (state.idx + 1) + " of " + ph.items.length));
      subhead.appendChild(buildHearts());
      stage.appendChild(subhead);
      return stage;
    }

    function renderQuestion(ph) {
      state.phase = "question";
      screen.innerHTML = "";
      state.choiceButtons = [];

      var q = ph.items[state.idx];
      var stage = buildStageHead(ph);

      var timer = el("div", "dg-timer");
      var fill = el("div", "dg-timer-fill");
      fill.style.animation = "dg-timer-drain " + ph.timer + "s linear forwards";
      timer.appendChild(fill);
      state.timerFill = fill;
      stage.appendChild(timer);

      var card = el("div", "dg-card");
      state.card = card;

      var badges = el("div", "dg-badges");
      badges.appendChild(el("span", "dg-badge", TYPE_BADGES[q.type] || "Trial"));
      badges.appendChild(el("span", "dg-badge dg-badge-wound", "1 wound"));
      card.appendChild(badges);

      card.appendChild(el("p", "dg-prompt", q.prompt));
      if (q.code) card.appendChild(el("pre", "dg-code", q.code));

      var choices = el("div",
        "dg-choices" + (q.type === "predict" ? " dg-choices-mono" : ""));
      q.choices.forEach(function (choiceText, i) {
        var btn = el("button", "dg-choice");
        btn.type = "button";
        btn.appendChild(el("span", "dg-choice-key", String(i + 1)));
        btn.appendChild(el("span", "dg-choice-text", choiceText));
        btn.addEventListener("click", function () { handleAnswer(i); });
        choices.appendChild(btn);
        state.choiceButtons.push(btn);
      });
      card.appendChild(choices);

      stage.appendChild(card);
      screen.appendChild(stage);

      state.timerId = setTimeout(function () { handleAnswer(-1); }, ph.timer * 1000);
    }

    function renderScenario(ph) {
      state.phase = "question";
      screen.innerHTML = "";
      state.choiceButtons = [];

      var scn = ph.items[state.idx];
      var stage = buildStageHead(ph);

      var card = el("div", "dg-card");
      state.card = card;

      var badges = el("div", "dg-badges");
      badges.appendChild(el("span", "dg-badge", scn.eyebrow || "Riddle of Scale"));
      badges.appendChild(el("span", "dg-badge dg-badge-wound", "2 wounds"));
      card.appendChild(badges);

      card.appendChild(el("h2", "dg-scn-title", scn.title));
      card.appendChild(el("p", "dg-prompt dg-scn-text", scn.scenario));

      var choices = el("div", "dg-choices");
      scn.choices.forEach(function (choice, i) {
        var btn = el("button", "dg-choice dg-choice-scn");
        btn.type = "button";
        btn.appendChild(el("span", "dg-choice-key", String(i + 1)));
        var body = el("span", "dg-choice-text");
        body.appendChild(el("span", "dg-choice-label", choice.label));
        body.appendChild(el("span", "dg-choice-stats", choice.stats));
        btn.appendChild(body);
        btn.addEventListener("click", function () { handleAnswer(i); });
        choices.appendChild(btn);
        state.choiceButtons.push(btn);
      });
      card.appendChild(choices);

      stage.appendChild(card);
      screen.appendChild(stage);
    }

    /* ---------- answer + mandatory feedback (the teaching moment) ---------- */

    function handleAnswer(choiceIdx) {
      if (state.phase !== "question") return;
      state.phase = "feedback";
      stopTimer();
      if (state.timerFill) {
        state.timerFill.style.animationPlayState = "paused";
        state.timerFill = null;
      }

      var ph = phases[state.pIdx];
      var isQuiz = ph.kind === "quiz";
      var item = ph.items[state.idx];
      var timedOut = choiceIdx < 0;
      var ok = choiceIdx === item.answer;
      var wound = isQuiz ? 1 : 2;
      markTime();

      if (ok) {
        ph.hits += 1;
        state.damage += wound;
        state.hp = Math.max(0, state.hp - wound);   /* clamp: never below 0 */
        if (isQuiz) state.correctIds.push(item.id);
        state.hpFill.style.width = ((state.hp / maxHp) * 100) + "%";
        state.hpText.textContent = state.hp + " / " + maxHp + " HP";
        var hud = state.hudEl;
        hud.classList.add("dg-wound");
        setTimeout(function () { hud.classList.remove("dg-wound"); }, 750);
        shake();
        sfx("correct");
      } else {
        ph.misses += 1;
        if (isQuiz) state.missedIds.push(item.id);
        state.hearts -= 1;
        var gem = state.gemEls[state.hearts];
        if (gem) gem.classList.add("dg-gem-lost");
        shake();
        sfx("wrong");
      }

      state.choiceButtons.forEach(function (btn, i) {
        btn.disabled = true;
        if (i === item.answer) btn.classList.add("dg-choice-correct");
        else if (i === choiceIdx) btn.classList.add("dg-choice-wrong");
      });

      var fb = el("div", "dg-feedback " + (ok ? "dg-fb-good" : "dg-fb-bad"));
      var verdict;
      if (ok) {
        verdict = isQuiz ? pick(WOUND_VERDICTS) : pick(RIDDLE_WOUND_VERDICTS);
      } else if (timedOut) {
        verdict = "The sands run out — the Dragon strikes unanswered. A heart-gem shatters.";
      } else if (isQuiz) {
        verdict = "The flame washes over you — a heart-gem shatters.";
      } else {
        verdict = "The Dragon laughs at your design — a heart-gem shatters.";
      }
      fb.appendChild(el("div", "dg-fb-verdict", verdict));

      if (isQuiz) {
        if (!ok) {
          var ans = el("div",
            "dg-fb-answer" + (item.type === "predict" ? " dg-mono" : ""));
          ans.appendChild(el("span", "dg-fb-answer-label", "The true rune: "));
          ans.appendChild(el("span", "", item.choices[item.answer]));
          fb.appendChild(ans);
        }
        if (item.explain) fb.appendChild(el("div", "dg-fb-explain", item.explain));
      } else {
        /* Riddle debrief: the honest-stats teaching moment, always shown. */
        var debrief = item.debrief || {};
        if (debrief.summary) {
          fb.appendChild(el("div", "dg-fb-explain", debrief.summary));
        }
        var verdicts = Array.isArray(debrief.verdicts) ? debrief.verdicts : [];
        if (verdicts.length > 0) {
          var list = el("div", "dg-verdicts");
          item.choices.forEach(function (choice, i) {
            var row = el("div", "dg-verdict-row" +
              (i === item.answer ? " dg-verdict-best" : "") +
              (i === choiceIdx && !ok ? " dg-verdict-chosen" : ""));
            row.appendChild(el("span", "dg-verdict-mark", i === item.answer ? "✦" : "✕"));
            var body = el("div", "dg-verdict-body");
            body.appendChild(el("div", "dg-verdict-label", choice.label));
            if (verdicts[i]) body.appendChild(el("div", "dg-verdict-text", verdicts[i]));
            row.appendChild(body);
            list.appendChild(row);
          });
          fb.appendChild(list);
        }
      }

      var ending = state.hp <= 0 || state.hearts <= 0;
      var lastItem = state.idx + 1 >= ph.items.length && state.pIdx + 1 >= phases.length;
      var cont = el("button", "dg-primary",
        ending ? "Face the Outcome" : (lastItem ? "The Trial Concludes" : "Continue"));
      cont.type = "button";
      cont.addEventListener("click", advance);
      var actions = el("div", "dg-fb-actions");
      actions.appendChild(cont);
      fb.appendChild(actions);

      state.card.appendChild(fb);
      if (fb.scrollIntoView) fb.scrollIntoView({ block: "nearest" });
    }

    function advance() {
      if (state.phase !== "feedback") return;
      if (state.hp <= 0) {        /* victory the instant HP dies — skip the rest */
        renderVictory();
        return;
      }
      if (state.hearts <= 0) {    /* death mid-phase */
        renderDefeat();
        return;
      }
      state.idx += 1;
      var ph = phases[state.pIdx];
      if (state.idx >= ph.items.length) {
        state.pIdx += 1;
        state.idx = 0;
        if (state.pIdx >= phases.length) {
          renderEndures();        /* content exhausted, HP > 0, hearts > 0 */
          return;
        }
        renderPhaseIntro(state.pIdx);
        return;
      }
      renderItem();
    }

    /* ---------- outcomes ---------- */

    function appendStats(parent) {
      var stats = el("div", "dg-stats");
      var s1 = el("div", "dg-stat");
      s1.appendChild(el("div", "dg-stat-big", state.damage + " / " + maxDamage));
      s1.appendChild(el("div", "dg-stat-label", "wounds dealt"));
      stats.appendChild(s1);
      var s2 = el("div", "dg-stat");
      s2.appendChild(el("div", "dg-stat-big", String(state.hearts)));
      s2.appendChild(el("div", "dg-stat-label", "heart-gems left"));
      stats.appendChild(s2);
      parent.appendChild(stats);

      var recap = el("div", "dg-phase-recap");
      phases.forEach(function (ph, i) {
        var answered = ph.hits + ph.misses;
        if (answered === 0) return;
        recap.appendChild(el("div", "dg-phase-recap-row",
          (NUMERALS[i] || String(i + 1)) + " · " + ph.name + " — " +
          ph.hits + " of " + answered + " answered true"));
      });
      parent.appendChild(recap);
    }

    function renderVictory() {
      state.phase = "end";
      markTime();
      screen.innerHTML = "";
      sfx("victory");
      var panel = el("div", "dg-panel dg-victory");
      var rays = el("div", "dg-rays");
      panel.appendChild(rays);
      var inner = el("div", "dg-victory-inner");
      inner.appendChild(el("div", "dg-eyebrow", "The Dragon Falls"));
      inner.appendChild(el("h1", "dg-title dg-victory-title", "THE TRIAL IS PASSED"));
      inner.appendChild(el("pre", "dg-dragon dg-dragon-small dg-dragon-fallen", DRAGON_ART));
      inner.appendChild(el("p", "dg-menace",
        "“…Well struck, master. Not flawless — I never asked for flawless. " +
        "True, under fire, again and again. That is the only rune that matters.” " +
        dragonName + " lowers its head to the stone, and the keep falls silent."));
      inner.appendChild(el("p", "dg-flavor",
        "The Grand Trial is complete. Walk out of the keep the way you came in — " +
        "but nothing about you is the same."));
      appendStats(inner);
      if (opts.practice) {
        inner.appendChild(el("p", "dg-practice-note",
          "A practice victory — the Dragon remembers, but the ledger does not."));
      }
      var btn = el("button", "dg-primary", "Stand Among the Masters");
      btn.type = "button";
      btn.addEventListener("click", function () { finish(true); });
      var actions = el("div", "dg-actions");
      actions.appendChild(btn);
      inner.appendChild(actions);
      panel.appendChild(inner);
      screen.appendChild(panel);
    }

    function renderDefeat() {
      state.phase = "end";
      markTime();
      screen.innerHTML = "";
      sfx("defeat");
      var panel = el("div", "dg-panel dg-defeat");
      panel.appendChild(el("div", "dg-eyebrow", "Defeat"));
      panel.appendChild(el("h1", "dg-title dg-defeat-title", "The Flame Takes You"));
      panel.appendChild(el("p", "dg-menace",
        "“Down the stair, apprentice. Cleanse your curses, sharpen your runes — " +
        "my hide can bear " + state.hp + " more " +
        (state.hp === 1 ? "wound" : "wounds") + ", and I am patient.”"));
      if (state.missedIds.length > 0) {
        panel.appendChild(el("p", "dg-curse-note",
          state.missedIds.length === 1
            ? "1 curse has latched onto you."
            : state.missedIds.length + " curses have latched onto you."));
      }
      appendStats(panel);
      var btn = el("button", "dg-primary", "Retreat — For Now");
      btn.type = "button";
      btn.addEventListener("click", function () { finish(false); });
      var actions = el("div", "dg-actions");
      actions.appendChild(btn);
      panel.appendChild(actions);
      screen.appendChild(panel);
    }

    function renderEndures() {
      state.phase = "end";
      markTime();
      screen.innerHTML = "";
      sfx("defeat");
      var panel = el("div", "dg-panel dg-defeat");
      panel.appendChild(el("div", "dg-eyebrow", "The Dragon Endures"));
      panel.appendChild(el("h1", "dg-title dg-defeat-title", "Its Heart Still Beats"));
      panel.appendChild(el("p", "dg-menace",
        "“Close. Truly. But my hide holds " + state.hp +
        (state.hp === 1 ? " wound" : " wounds") + " yet, and your questions are spent.”"));
      panel.appendChild(el("p", "dg-flavor",
        "The gauntlet forgives up to " + slack + " forfeited wounds of damage — " +
        "you forfeited " + (maxDamage - state.damage) + ". Riddles of Scale cost 2 each; " +
        "that is where deep cuts are won and lost. Study, return, and finish it."));
      if (state.missedIds.length > 0) {
        panel.appendChild(el("p", "dg-curse-note",
          state.missedIds.length === 1
            ? "1 curse has latched onto you."
            : state.missedIds.length + " curses have latched onto you."));
      }
      appendStats(panel);
      var btn = el("button", "dg-primary", "Withdraw — It Will Wait");
      btn.type = "button";
      btn.addEventListener("click", function () { finish(false); });
      var actions = el("div", "dg-actions");
      actions.appendChild(btn);
      panel.appendChild(actions);
      screen.appendChild(panel);
    }

    renderIntro();
  }

  window.Minigames.dragonGauntlet = { start: start };
})();
