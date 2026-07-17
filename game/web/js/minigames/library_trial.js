/*
 * The Grand Trial — The Sundered Scrolls (Great Library region trial: RAG)
 *
 * Contract (docs/superpowers/plans/2026-07-18-phase23-contracts.md):
 *   window.Minigames.libraryTrial.start(overlayEl, config, opts, onComplete)
 *     overlayEl : empty fullscreen div provided by the engine
 *     config    : parsed game/content/minigames/library-trial.json
 *     opts      : {practice: bool} — shows a "Practice run — no XP" ribbon
 *     onComplete: called exactly once with
 *       {completed, score, max, durationSec, missedQuestionIds: [], correctQuestionIds: []}
 *       (concept minigames always emit empty question-id arrays)
 *
 * Three rounds teaching RAG:
 *   R1 Relevance — pick the 2 truly relevant chunks of 6 (1 pt each, max 2)
 *   R2 Chunking  — pick the best chunking strategy for a scroll (2 pts)
 *   R3 Pipeline  — rebuild chunk→embed→index→retrieve→rerank→generate
 *                  (start with 6 insight; each wrong click costs 1, floor 0)
 * Total max = 10. Every round ends with a "What this teaches" card that
 * requires a click — the teaching moment is never auto-advanced.
 *
 * This module never touches game state, the network, or engine internals.
 * Esc is reserved by the engine and never handled here. It cleans up its
 * own DOM (and listeners) before calling onComplete. All dynamic text is
 * inserted via textContent — HTML is always escaped.
 */
(function () {
  "use strict";

  window.Minigames = window.Minigames || {};

  var R1_MAX = 2;   /* relevance: 1 pt per truly relevant scroll picked   */
  var R2_MAX = 2;   /* chunking: 2 pts for choosing the librarian's cut   */
  var R3_MAX = 6;   /* pipeline: 6 insight to keep; wrong stone costs 1   */
  var MAX_SCORE = R1_MAX + R2_MAX + R3_MAX;

  var ROUND_NAMES = {
    relevance: "The Test of Relevance",
    chunking: "The Test of the Cut",
    pipeline: "The Test of Order"
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

  function pickRandom(list) {
    if (!Array.isArray(list) || list.length === 0) return null;
    return list[Math.floor(Math.random() * list.length)];
  }

  function sameOrder(a, b) {
    for (var i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  /* Shuffle a copy; guarantee the result differs from the given order. */
  function shuffledDifferent(list) {
    var out = list.slice();
    if (list.length < 2) return out;
    for (var attempt = 0; attempt < 12; attempt++) {
      shuffle(out);
      if (!sameOrder(out, list)) return out;
    }
    return list.slice(1).concat(list.slice(0, 1));
  }

  /* Optional SFX — soft dependency on the engine; sound must never break play. */
  function sfx(name) {
    try {
      if (window.Game && window.Game.SFX && typeof window.Game.SFX.play === "function") {
        window.Game.SFX.play(name);
      }
    } catch (err) { /* ignore */ }
  }

  /* ---------- the trial ---------- */

  function start(overlayEl, config, opts, onComplete) {
    opts = opts || {};

    var title = (config && config.title) || "The Sundered Scrolls";
    var rounds = (config && config.rounds) || {};
    var relVariant = pickRandom(rounds.relevance);
    var chunkVariant = pickRandom(rounds.chunking);
    var pipeline = rounds.pipeline || {};
    var pipeStages = Array.isArray(pipeline.stages) ? pipeline.stages : [];
    var pipeVariant = pickRandom(pipeline.variants);
    var ready = !!(relVariant && chunkVariant && pipeVariant && pipeStages.length > 0);

    var state = {
      phase: "splash",   /* splash | r1-pick | r1-reveal | r2-pick | r2-reveal
                            | r3-play | r3-done | end */
      score: 0,
      roundResults: [],  /* {name, score, max} in play order */
      startedAt: null,
      playSeconds: 0,
      choiceButtons: [],
      finished: false
    };

    var root = el("div", "mg-root lib-root");
    if (ready) {
      root.setAttribute("data-lib-variants",
        relVariant.id + " " + chunkVariant.id + " " + pipeVariant.id);
    }
    overlayEl.appendChild(root);

    function onKeyDown(e) {
      if (state.finished || e.ctrlKey || e.altKey || e.metaKey) return;
      var picking = state.phase === "r1-pick" || state.phase === "r2-pick" ||
        state.phase === "r3-play";
      if (picking) {
        var n = parseInt(e.key, 10);
        if (!Number.isNaN(n) && n >= 1 && n <= state.choiceButtons.length) {
          e.preventDefault();
          state.choiceButtons[n - 1].click();
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
      if (state.startedAt) {
        state.playSeconds = Math.round((Date.now() - state.startedAt) / 1000);
      }
      var result = {
        completed: completed,
        score: state.score,
        max: MAX_SCORE,
        durationSec: state.playSeconds,
        missedQuestionIds: [],
        correctQuestionIds: []
      };
      cleanup();
      onComplete(result);
    }

    /* ---------- shared render pieces ---------- */

    function resetRoot() {
      root.innerHTML = "";
      if (opts.practice) {
        root.appendChild(el("div", "lib-ribbon", "Practice run — no XP"));
      }
    }

    /* Restartable shake (transform-only keyframes, so no styles linger). */
    function bump(node) {
      node.classList.remove("lib-shake");
      void node.offsetWidth;
      node.classList.add("lib-shake");
    }

    function roundHead(stage, roundNo, key, rightEl) {
      var head = el("div", "lib-roundhead");
      head.appendChild(el("div", "mg-progress",
        "Round " + roundNo + " of 3 · " + ROUND_NAMES[key]));
      if (rightEl) head.appendChild(rightEl);
      stage.appendChild(head);
    }

    function queryCard(labelText, mainText, subText) {
      var card = el("div", "lib-query");
      card.appendChild(el("div", "lib-query-label", labelText));
      card.appendChild(el("p", "lib-query-text", mainText));
      if (subText) card.appendChild(el("div", "lib-corpus", subText));
      return card;
    }

    function banner(kind, text) {
      return el("div", "lib-banner lib-banner-" + kind, text);
    }

    function tagChip(kind, text) {
      return el("span", "lib-tag lib-tag-" + kind, text);
    }

    /* The round-closing teaching card. Never auto-advances. */
    function appendTeaches(container, text, btnLabel, next) {
      var card = el("div", "lib-teach");
      card.appendChild(el("div", "lib-teach-head", "✦ What This Teaches"));
      card.appendChild(el("p", "lib-teach-body", text));
      var btn = el("button", "mg-primary", btnLabel);
      btn.type = "button";
      btn.addEventListener("click", function () {
        if (btn.disabled) return;
        btn.disabled = true;
        next();
      });
      var actions = el("div", "lib-teach-actions");
      actions.appendChild(btn);
      card.appendChild(actions);
      container.appendChild(card);
      if (card.scrollIntoView) card.scrollIntoView({ block: "nearest" });
    }

    /* One recall/precision bar; fills to its value on the next frame. */
    function barRow(label, value, fillClass) {
      var row = el("div", "lib-bar-row");
      row.appendChild(el("span", "lib-bar-label", label));
      var track = el("div", "lib-bar-track");
      var fill = el("div", "lib-bar-fill " + fillClass);
      track.appendChild(fill);
      row.appendChild(track);
      var v = Math.max(0, Math.min(100, Number(value) || 0));
      row.appendChild(el("span", "lib-bar-val", String(v)));
      if (window.requestAnimationFrame) {
        window.requestAnimationFrame(function () { fill.style.width = v + "%"; });
      } else {
        fill.style.width = v + "%";
      }
      return row;
    }

    /* ---------- title splash ---------- */

    function renderSplash() {
      state.phase = "splash";
      resetRoot();
      var panel = el("div", "mg-panel mg-splash");
      panel.appendChild(el("div", "mg-splash-glyph", "✦"));
      panel.appendChild(el("div", "mg-eyebrow", "Region Trial · The Great Library"));
      panel.appendChild(el("h1", "mg-title", title));
      panel.appendChild(el("div", "mg-subtitle", "Three Tests of Retrieval"));
      if (!ready) {
        panel.appendChild(el("p", "mg-flavor",
          "The stacks lie silent — this trial's scrolls have not been penned."));
      } else {
        panel.appendChild(el("p", "mg-flavor",
          "The Library's great index lies sundered: ten thousand scrolls, and no way " +
          "to find the one that answers. Prove you understand the art the index was " +
          "built on. Judge what is truly relevant. Choose how a scroll is cut. " +
          "Rebuild the retrieval rite in its true order."));
        panel.appendChild(el("p", "mg-flavor",
          "Ten insight await — two for relevance, two for the cut, six for the rite."));
      }
      var btn = el("button", "mg-primary", ready ? "Begin the Trial" : "Withdraw");
      btn.type = "button";
      btn.addEventListener("click", function () {
        if (state.phase !== "splash") return;
        if (!ready) {
          finish(false);
          return;
        }
        state.startedAt = Date.now();
        renderRelevance();
      });
      var actions = el("div", "mg-actions");
      actions.appendChild(btn);
      panel.appendChild(actions);
      root.appendChild(panel);
    }

    /* ---------- round 1: relevance ---------- */

    function renderRelevance() {
      state.phase = "r1-pick";
      resetRoot();
      state.choiceButtons = [];

      var chunks = shuffle(relVariant.chunks.slice());
      var picked = [];
      var chunkButtons = [];

      var stage = el("div", "mg-stage lib-stage");
      roundHead(stage, 1, "relevance", el("div", "lib-domain", relVariant.domain));
      stage.appendChild(queryCard("A seeker asks", relVariant.query, relVariant.corpus));
      stage.appendChild(el("p", "lib-instruction",
        "The index surfaced six scrolls. Only two truly answer. " +
        "Choose the two you would hand the seeker."));

      var counter = el("div", "lib-counter", "Chosen 0 of 2");
      stage.appendChild(counter);

      var grid = el("div", "lib-chunks");
      chunks.forEach(function (chunk, i) {
        var btn = el("button", "lib-chunk");
        btn.type = "button";
        btn.setAttribute("aria-pressed", "false");
        var top = el("div", "lib-chunk-top");
        top.appendChild(el("span", "mg-choice-key", String(i + 1)));
        top.appendChild(el("span", "lib-chunk-source", chunk.source));
        btn.appendChild(top);
        btn.appendChild(el("div", "lib-chunk-text", chunk.text));
        btn.addEventListener("click", function () { toggleChunk(i); });
        grid.appendChild(btn);
        chunkButtons.push(btn);
        state.choiceButtons.push(btn);
      });
      stage.appendChild(grid);

      var sealBtn = el("button", "mg-primary", "Hand Over the Scrolls");
      sealBtn.type = "button";
      sealBtn.disabled = true;
      sealBtn.addEventListener("click", reveal);
      var actions = el("div", "mg-actions lib-seal");
      actions.appendChild(sealBtn);
      stage.appendChild(actions);
      root.appendChild(stage);

      function toggleChunk(i) {
        if (state.phase !== "r1-pick") return;
        var btn = chunkButtons[i];
        var pos = picked.indexOf(i);
        if (pos >= 0) {
          picked.splice(pos, 1);
          btn.classList.remove("lib-chunk-picked");
          btn.setAttribute("aria-pressed", "false");
        } else if (picked.length >= 2) {
          bump(btn);  /* hands are full — two scrolls only */
          return;
        } else {
          picked.push(i);
          btn.classList.add("lib-chunk-picked");
          btn.setAttribute("aria-pressed", "true");
          sfx("click");
        }
        counter.textContent = "Chosen " + picked.length + " of 2";
        sealBtn.disabled = picked.length !== 2;
      }

      function reveal() {
        if (state.phase !== "r1-pick" || picked.length !== 2) return;
        state.phase = "r1-reveal";

        var got = 0;
        chunks.forEach(function (chunk, i) {
          var btn = chunkButtons[i];
          btn.disabled = true;
          var pickedIt = picked.indexOf(i) >= 0;
          var tagRow = el("div", "lib-tagrow");
          if (chunk.relevant && pickedIt) {
            got += 1;
            btn.classList.add("lib-chunk-good");
            tagRow.appendChild(tagChip("good", "✦ Truly relevant — you found it"));
          } else if (chunk.relevant) {
            btn.classList.add("lib-chunk-missed");
            tagRow.appendChild(tagChip("missed", "✦ Truly relevant — you missed it"));
          } else if (pickedIt) {
            btn.classList.add("lib-chunk-trap");
            tagRow.appendChild(tagChip("trap", "✕ A retrieval trap — it caught you"));
          } else {
            btn.classList.add("lib-chunk-dim");
            tagRow.appendChild(tagChip("dim", "A retrieval trap — avoided"));
          }
          btn.appendChild(tagRow);
          btn.appendChild(el("div",
            "lib-why " + (chunk.relevant ? "lib-why-good" : "lib-why-trap"),
            chunk.why));
        });

        state.score += got;
        state.roundResults.push({ name: ROUND_NAMES.relevance, score: got, max: R1_MAX });
        sfx(got === R1_MAX ? "correct" : "wrong");

        if (actions.parentNode) actions.parentNode.removeChild(actions);
        var verdictText;
        if (got === 2) {
          verdictText = "Both true scrolls found — the seeker leaves with the whole answer.";
        } else if (got === 1) {
          verdictText = "One true scroll, one trap — half an answer can be worse than none.";
        } else {
          verdictText = "The traps claimed both picks — the seeker leaves confidently misinformed.";
        }
        stage.appendChild(banner(got === 2 ? "good" : (got === 1 ? "mixed" : "bad"),
          verdictText));
        appendTeaches(stage, relVariant.teaches, "Continue to the Second Test",
          renderChunking);
      }
    }

    /* ---------- round 2: chunking ---------- */

    function renderChunking() {
      state.phase = "r2-pick";
      resetRoot();
      state.choiceButtons = [];

      var strategies = shuffle(chunkVariant.strategies.slice());
      var stratButtons = [];

      var stage = el("div", "mg-stage lib-stage");
      roundHead(stage, 2, "chunking", el("div", "lib-domain", chunkVariant.domain));
      stage.appendChild(queryCard("The scroll to be sundered", chunkVariant.scroll, null));
      stage.appendChild(el("p", "lib-instruction",
        "Before any question can be answered, the scroll must be cut into shards " +
        "for the index. Every cut has a price. Choose the one you would trust " +
        "for this scroll."));

      var wrap = el("div", "lib-strategies");
      strategies.forEach(function (strat, i) {
        var btn = el("button", "lib-strategy");
        btn.type = "button";
        var top = el("div", "lib-strategy-top");
        top.appendChild(el("span", "mg-choice-key", String(i + 1)));
        top.appendChild(el("span", "lib-strategy-name", strat.name));
        btn.appendChild(top);
        btn.appendChild(el("p", "lib-strategy-tradeoff", strat.tradeoff));
        btn.addEventListener("click", function () { revealChunking(i); });
        wrap.appendChild(btn);
        stratButtons.push(btn);
        state.choiceButtons.push(btn);
      });
      stage.appendChild(wrap);
      root.appendChild(stage);

      function revealChunking(chosenIdx) {
        if (state.phase !== "r2-pick") return;
        state.phase = "r2-reveal";

        var ok = !!strategies[chosenIdx].best;
        var got = ok ? R2_MAX : 0;
        state.score += got;
        state.roundResults.push({ name: ROUND_NAMES.chunking, score: got, max: R2_MAX });
        sfx(ok ? "correct" : "wrong");

        strategies.forEach(function (strat, i) {
          var btn = stratButtons[i];
          btn.disabled = true;
          var tagRow = el("div", "lib-tagrow");
          if (strat.best) {
            btn.classList.add("lib-strategy-best");
            tagRow.appendChild(tagChip("good", "✦ The librarian's cut"));
          } else if (i === chosenIdx) {
            btn.classList.add("lib-strategy-wrongpick");
            tagRow.appendChild(tagChip("trap", "✕ Your cut — it fails this scroll"));
          } else {
            btn.classList.add("lib-strategy-dim");
          }
          if (tagRow.childNodes.length > 0) btn.appendChild(tagRow);
          var bars = el("div", "lib-bars");
          bars.appendChild(barRow("Context recall", strat.recall, "lib-bar-recall"));
          bars.appendChild(barRow("Context precision", strat.precision, "lib-bar-precision"));
          btn.appendChild(bars);
          btn.appendChild(el("div", "lib-strategy-verdict", strat.verdict));
        });

        stage.appendChild(el("div", "lib-bar-note",
          "The bars are an illustrative retrieval eval for this scroll — " +
          "trust the direction, not the exact digits."));
        stage.appendChild(banner(ok ? "good" : "bad", ok
          ? "A clean cut. Retrieval will inherit the scroll's own logic."
          : "The cut fights the scroll. Read the bars — they show the price."));
        appendTeaches(stage, chunkVariant.teaches, "Continue to the Third Test",
          renderPipeline);
      }
    }

    /* ---------- round 3: pipeline ---------- */

    function renderPipeline() {
      state.phase = "r3-play";
      resetRoot();
      state.choiceButtons = [];

      var order = pipeStages;
      var pile = shuffledDifferent(order);
      var nextIdx = 0;
      var insight = R3_MAX;
      var wrongClicks = 0;

      var stage = el("div", "mg-stage lib-stage");
      var pointsEl = el("div", "lib-points", "Insight " + insight + " / " + R3_MAX);
      roundHead(stage, 3, "pipeline", pointsEl);
      stage.appendChild(queryCard("The rite to rebuild", pipeVariant.scenario, null));
      stage.appendChild(el("p", "lib-instruction",
        "Six rune-stones hold the stages of the retrieval rite, scattered out of " +
        "order. Click them in the order the magic must flow. Every false stone " +
        "costs one insight."));

      var pipeWrap = el("div", "lib-pipe");
      var slotsCol = el("div", "lib-slots");
      var slotBodies = [];
      order.forEach(function (stageDef, i) {
        var slot = el("div", "lib-slot");
        slot.appendChild(el("span", "lib-slot-num", String(i + 1)));
        var body = el("div", "lib-slot-body");
        body.appendChild(el("div", "lib-slot-empty", "· · ·"));
        slot.appendChild(body);
        slotsCol.appendChild(slot);
        slotBodies.push({ slot: slot, body: body });
      });
      pipeWrap.appendChild(slotsCol);

      var pileCol = el("div", "lib-pile");
      pileCol.appendChild(el("div", "lib-pile-title", "The Scattered Stones"));
      pile.forEach(function (stageDef, i) {
        var tile = el("button", "lib-tile");
        tile.type = "button";
        var top = el("div", "lib-tile-top");
        top.appendChild(el("span", "mg-choice-key", String(i + 1)));
        top.appendChild(el("span", "lib-tile-name", stageDef.name));
        tile.appendChild(top);
        tile.appendChild(el("div", "lib-tile-desc", stageDef.desc));
        tile.addEventListener("click", function () { clickStone(stageDef, tile); });
        pileCol.appendChild(tile);
        state.choiceButtons.push(tile);
      });
      pipeWrap.appendChild(pileCol);
      stage.appendChild(pipeWrap);
      root.appendChild(stage);

      function clickStone(stageDef, tile) {
        if (state.phase !== "r3-play" || tile.disabled) return;
        if (stageDef.id === order[nextIdx].id) {
          tile.disabled = true;
          tile.classList.add("lib-tile-placed");
          var target = slotBodies[nextIdx];
          target.slot.classList.add("lib-slot-filled");
          target.body.textContent = "";
          var titleRow = el("div", "lib-slot-titlerow");
          titleRow.appendChild(el("span", "lib-slot-name", stageDef.name));
          titleRow.appendChild(el("span",
            "lib-phase-chip lib-phase-" + (stageDef.phase === "build" ? "build" : "query"),
            stageDef.phase === "build" ? "Build-time" : "Query-time"));
          target.body.appendChild(titleRow);
          target.body.appendChild(el("div", "lib-slot-walk",
            (pipeVariant.walkthrough && pipeVariant.walkthrough[stageDef.id]) ||
            stageDef.desc));
          sfx("correct");
          nextIdx += 1;
          if (nextIdx >= order.length) finishPipeline();
        } else {
          wrongClicks += 1;
          if (insight > 0) insight -= 1;
          pointsEl.textContent = "Insight " + insight + " / " + R3_MAX;
          bump(pointsEl);
          bump(tile);
          sfx("wrong");
        }
      }

      function finishPipeline() {
        state.phase = "r3-done";
        state.score += insight;
        state.roundResults.push({ name: ROUND_NAMES.pipeline, score: insight, max: R3_MAX });

        var kind = insight === R3_MAX ? "good" : (insight > 0 ? "mixed" : "bad");
        var text;
        if (insight === R3_MAX) {
          text = "Flawless — the rite flows in one unbroken line.";
        } else {
          text = "The rite stands, but " + wrongClicks +
            (wrongClicks === 1 ? " false stone" : " false stones") +
            " cost you " + (R3_MAX - insight) + " insight.";
        }
        stage.appendChild(banner(kind, text));
        sfx(insight === R3_MAX ? "correct" : "click");
        appendTeaches(stage, pipeVariant.teaches, "Face the Verdict", renderEnd);
      }
    }

    /* ---------- end screen ---------- */

    function renderEnd() {
      state.phase = "end";
      resetRoot();
      var panel = el("div", "mg-panel mg-end lib-end");
      panel.appendChild(el("div", "mg-eyebrow", "The Trial Ends"));
      panel.appendChild(el("h1", "mg-title", "The Index Restored"));

      var swept = state.roundResults.filter(function (r) {
        return r.score === r.max;
      }).length;

      var stats = el("div", "mg-stats");
      var s1 = el("div", "mg-stat");
      s1.appendChild(el("div", "mg-stat-big", state.score + " / " + MAX_SCORE));
      s1.appendChild(el("div", "mg-stat-label", "insight earned"));
      stats.appendChild(s1);
      var s2 = el("div", "mg-stat");
      s2.appendChild(el("div", "mg-stat-big", swept + " / 3"));
      s2.appendChild(el("div", "mg-stat-label", "tests swept"));
      stats.appendChild(s2);
      panel.appendChild(stats);

      var recap = el("div", "lib-recap");
      state.roundResults.forEach(function (r) {
        var row = el("div", "lib-recap-row");
        row.appendChild(el("span", "lib-recap-name", r.name));
        row.appendChild(el("span", "lib-recap-score", r.score + " / " + r.max));
        recap.appendChild(row);
      });
      panel.appendChild(recap);

      var pct = state.score / MAX_SCORE;
      var tier;
      if (pct >= 1) {
        tier = "Master of the Stacks — the Library itself will come asking YOU where things are.";
      } else if (pct >= 0.75) {
        tier = "Senior Archivist — the shelves part before you; only the deepest traps still bite.";
      } else if (pct >= 0.5) {
        tier = "Apprentice of the Stacks — you can find a scroll, if it wants to be found.";
      } else {
        tier = "The stacks resist you yet. Study the traps that caught you, and return.";
      }
      panel.appendChild(el("p", "mg-menace", tier));

      var btn = el("button", "mg-primary", "Leave the Library");
      btn.type = "button";
      btn.addEventListener("click", function () { finish(true); });
      var actions = el("div", "mg-actions");
      actions.appendChild(btn);
      panel.appendChild(actions);
      root.appendChild(panel);
    }

    renderSplash();
  }

  window.Minigames.libraryTrial = { start: start };
})();
