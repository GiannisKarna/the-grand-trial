/* state.js — the single owner of all progress.json mutations.
 * Contract rules implemented here:
 *   - XP: drill = 2 per correct answer; boss victory = quest.xp (50); curse cleansed = 25.
 *   - level = floor(sqrt(xp/100)) + 1
 *   - embers = count of distinct days in drills.history (never decreases)
 *   - curses: miss (boss or drill) -> add or increment; correct answer in a REAL drill
 *     -> hits += 1; at hits >= 2 -> cleansed: true (kept in list). A cleansed curse
 *     missed again is re-cursed (cleansed=false, hits=0).
 *   - practice drills (a day that already has a completed drill) mutate nothing
 *     except a zero-XP log entry.
 *   - every mutation ends with a PUT of the full state (optimistic; toast on failure).
 *   - client may set quest status in_progress / awaiting_review; "passed" only for
 *     type:"boss" quests. Code-quest passes belong to the Game Master.
 * Phase 2/3 additions (docs/superpowers/plans/2026-07-18-phase23-contracts.md):
 *   - trials.<region-id> = {last_day, best, history:[{day,score,max,xp}]}.
 *     Region Trial XP = round(10 * score/max), first completed run per region
 *     per day only; later same-day runs are practice (0 XP). `best` = all-time
 *     best percentage (0-100), updated by any completed run, practice included.
 *   - Dragon victory: quests["the-dragon"].status = "passed" + its quests.json
 *     XP, once; repeat victories are practice. Dragon misses become curses
 *     (mapped to their bank); dragon correct answers do NOT cleanse — cleansing
 *     stays a daily-drill rite.
 */
(() => {
  'use strict';
  window.Game = window.Game || {};

  /* Shared UI flag: when any blocking overlay (region panel, minigame, modal)
   * is open the overworld ignores input. */
  Game.ui = { overlayOpen: false };

  /* Region metadata, in unlock order. Flavor lives here so world.js (labels)
   * and region.js (panels) share one source. */
  Game.Meta = {
    REGIONS: [
      {
        id: 'rune-plains',
        name: 'The Rune Plains',
        flavor: 'Wind-bent grass over old standing stones. Every rune you cut here becomes part of your hand. Master the shapes of data — and return each day to drill, for the Plains reward the constant.',
      },
      {
        id: 'gatekeepers-forge',
        name: "The Gatekeeper's Forge",
        flavor: 'Anvils ring behind the sealed gate. Here apprentices temper raw script into services that hold under load — routes, tests, and the discipline of the query.',
      },
      {
        id: 'great-library',
        name: 'The Great Library',
        flavor: 'Endless shelves whisper of embeddings and retrieval. The librarians grade ruthlessly, and a wrong citation is a curse upon your name.',
      },
      {
        id: 'war-council',
        name: 'The War Council',
        flavor: 'Maps, meters, and hard trade-offs. At this table every decision has a cost on every axis, and the silent tiebreaker is forbidden.',
      },
      {
        id: 'dragons-keep',
        name: "The Dragon's Keep",
        flavor: 'The final trial. The Dragon asks its questions in fire, under time, and accepts only your own runes.',
      },
    ],

    regionById(id) {
      return this.REGIONS.find((r) => r.id === id) || null;
    },

    /* Name of the region that must be beaten before `id` opens (previous in order). */
    requirementFor(id) {
      const i = this.REGIONS.findIndex((r) => r.id === id);
      return i > 0 ? this.REGIONS[i - 1].name : null;
    },
  };

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  /* Local fetch helper for the Phase-2 content endpoints (bank listing +
   * minigame configs). Mirrors api.js error style; api.js itself is frozen. */
  async function fetchJson(path) {
    let res;
    try {
      res = await fetch(path);
    } catch (err) {
      throw new Error('The realm server is unreachable. Is game/run.py running?');
    }
    if (!res.ok) {
      throw new Error(`The realm server refused ${path} (HTTP ${res.status}).`);
    }
    try {
      return await res.json();
    } catch (err) {
      throw new Error(`The realm server sent unreadable scrolls from ${path}.`);
    }
  }

  Game.State = {
    data: null, // full progress.json object
    quests: [], // quest catalog from /api/content/quests
    banks: {}, // cache: bankId -> quiz bank
    minigameConfigs: {}, // cache: minigameId -> parsed config JSON
    _bankIds: null, // cache of GET /api/content/quizbanks listing

    /* ---------- time / math helpers ---------- */

    todayStr() {
      const d = new Date();
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    },

    nowISO() {
      return new Date().toISOString();
    },

    levelForXp(xp) {
      return Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1;
    },

    /* XP thresholds for a level: reached at `lo`, next level at `hi`. */
    xpBounds(level) {
      return { lo: 100 * (level - 1) * (level - 1), hi: 100 * level * level };
    },

    /* ---------- content helpers ---------- */

    async loadBank(bankId) {
      if (!this.banks[bankId]) {
        this.banks[bankId] = await Game.API.getQuizbank(bankId);
      }
      return this.banks[bankId];
    },

    /* Sorted list of quiz-bank ids from GET /api/content/quizbanks. */
    async loadBankIds() {
      if (!this._bankIds) {
        const doc = await fetchJson('/api/content/quizbanks');
        this._bankIds = (doc && doc.banks) || [];
      }
      return this._bankIds;
    },

    /* Every quiz bank, loaded (and cached). For the Dragon's opts.banks. */
    async loadAllBanks() {
      const ids = await this.loadBankIds();
      return Promise.all(ids.map((id) => this.loadBank(id)));
    },

    /* Parsed minigame config from GET /api/content/minigames/{id}. */
    async loadMinigameConfig(minigameId) {
      if (!this.minigameConfigs[minigameId]) {
        this.minigameConfigs[minigameId] = await fetchJson(
          `/api/content/minigames/${encodeURIComponent(minigameId)}`
        );
      }
      return this.minigameConfigs[minigameId];
    },

    questsForRegion(regionId) {
      return this.quests.filter((q) => q.region === regionId);
    },

    bossForRegion(regionId) {
      return this.questsForRegion(regionId).find((q) => q.type === 'boss') || null;
    },

    questById(id) {
      return this.quests.find((q) => q.id === id) || null;
    },

    questStatus(questId) {
      const entry = this.data.quests[questId];
      return entry ? entry.status : null;
    },

    requiresMet(quest) {
      return (quest.requires || []).every((id) => this.questStatus(id) === 'passed');
    },

    regionUnlocked(regionId) {
      const r = this.data.regions[regionId];
      return !!(r && r.unlocked);
    },

    drillDoneToday() {
      const today = this.todayStr();
      return this.data.drills.history.some((h) => h.day === today);
    },

    /* ---------- region trials (Phase 2) ---------- */

    /* The trials map, created on demand — back-compat with pre-Phase-2 saves
     * loaded from a server that does not merge the key in yet. */
    _trials() {
      if (!this.data.trials) this.data.trials = {};
      return this.data.trials;
    },

    /* This region's trial record, created on first touch. */
    trialFor(regionId) {
      const trials = this._trials();
      if (!trials[regionId]) {
        trials[regionId] = { last_day: null, best: 0, history: [] };
      }
      return trials[regionId];
    },

    trialDoneToday(regionId) {
      const trials = this._trials();
      const t = trials[regionId];
      return !!(t && t.last_day === this.todayStr());
    },

    /* All-time best percentage (0-100) for a region's trial, 0 if never run. */
    trialBest(regionId) {
      const trials = this._trials();
      const t = trials[regionId];
      return t ? t.best | 0 : 0;
    },

    /* ---------- curse helpers (Phase 2 Codex) ---------- */

    activeCurseCount() {
      return this.data.curses.filter((c) => !c.cleansed).length;
    },

    /* Bank a question id belongs to: search loaded banks first, then fall back
     * to the "<bank-id>-NNN" naming convention (e.g. "pf-l1-001" -> "pf-l1"). */
    bankIdForQuestion(questionId) {
      for (const bankId of Object.keys(this.banks)) {
        const bank = this.banks[bankId];
        if (bank && bank.questions && bank.questions.some((q) => q.id === questionId)) {
          return bankId;
        }
      }
      const m = /^(.+)-[^-]+$/.exec(String(questionId || ''));
      return m ? m[1] : null;
    },

    /* Question objects for this bank's active (non-cleansed) curses, for opts.curseQuestions. */
    activeCurseQuestions(bank) {
      return this.data.curses
        .filter((c) => c.bank === bank.id && !c.cleansed)
        .map((c) => bank.questions.find((q) => q.id === c.question_id))
        .filter(Boolean);
    },

    /* ---------- low-level mutation helpers ---------- */

    addLog(event, xp) {
      this.data.log.push({ ts: this.nowISO(), actor: 'game', event, xp: xp | 0 });
    },

    /* Adds xp, recomputes level. Returns the new level if it increased, else 0. */
    awardXp(amount) {
      const p = this.data.player;
      const before = p.level;
      p.xp += amount;
      p.level = this.levelForXp(p.xp);
      return p.level > before ? p.level : 0;
    },

    _addCurse(questionId, bankId) {
      const c = this.data.curses.find(
        (k) => k.question_id === questionId && k.bank === bankId
      );
      if (!c) {
        this.data.curses.push({
          question_id: questionId,
          bank: bankId,
          misses: 1,
          hits: 0,
          cleansed: false,
        });
        return;
      }
      c.misses += 1;
      if (c.cleansed) {
        // A cleansed weakness that resurfaces is a curse again.
        c.cleansed = false;
        c.hits = 0;
      }
    },

    /* PUT the full state. Optimistic: local state is already mutated; on failure
     * we keep playing and show an error toast. Saves are chained so overlapping
     * mutations can never race each other on the wire (an older snapshot landing
     * after a newer one would silently roll the file back). Each send serializes
     * this.data at send time, so the final PUT always carries the latest state.
     * Returns the save promise. */
    _saveChain: Promise.resolve(),

    save() {
      const send = () =>
        Game.API.putState(this.data).catch((err) => {
          if (Game.HUD) {
            Game.HUD.toast(`Save failed — progress may be lost: ${err.message}`, 'error', 6000);
          }
        });
      this._saveChain = this._saveChain.then(send, send);
      return this._saveChain;
    },

    /* ---------- high-level mutations (each one saves) ---------- */

    setHeroName(name) {
      this.data.player.name = name;
      this.addLog(`The hero takes the name ${name}.`, 0);
      return this.save();
    },

    beginQuest(quest) {
      this.data.quests[quest.id] = { status: 'in_progress', updated: this.todayStr() };
      this.addLog(`Quest begun: ${quest.title}`, 0);
      return this.save();
    },

    markAwaitingReview(quest) {
      this.data.quests[quest.id] = { status: 'awaiting_review', updated: this.todayStr() };
      this.addLog(`Quest submitted for Game Master review: ${quest.title}`, 0);
      return this.save();
    },

    /* Apply a Rune Trials result.
     * Returns {aborted} | {practice:true} | {practice:false, xp, cleansed:[ids], leveledTo}. */
    applyDrillResult(result, bank) {
      if (!result || !result.completed) return { aborted: true };

      if (this.drillDoneToday()) {
        // Practice run: no XP, no ember, no curse changes — log only.
        this.addLog(
          `Practice drill: ${result.correct}/${result.total} correct (practice — no reward)`,
          0
        );
        this.save();
        return { practice: true };
      }

      const today = this.todayStr();
      const xp = 2 * result.correct;
      const d = this.data.drills;

      d.history.push({ day: today, correct: result.correct, total: result.total, xp });
      const distinctDays = new Set(d.history.map((h) => h.day)).size;
      d.embers = Math.max(d.embers, distinctDays); // never decreases
      d.last_day = today;

      (result.missedQuestionIds || []).forEach((id) => this._addCurse(id, bank.id));

      this.addLog(`Daily drill completed: ${result.correct}/${result.total} correct`, xp);
      let leveledTo = this.awardXp(xp);

      const cleansed = [];
      (result.correctQuestionIds || []).forEach((id) => {
        const c = this.data.curses.find(
          (k) => k.question_id === id && k.bank === bank.id && !k.cleansed
        );
        if (!c) return;
        c.hits += 1;
        if (c.hits >= 2) {
          c.cleansed = true;
          cleansed.push(id);
          this.addLog(`Curse cleansed: ${id}`, 25);
          leveledTo = Math.max(leveledTo, this.awardXp(25));
        }
      });

      this.save();
      return { practice: false, xp, cleansed, leveledTo };
    },

    /* Apply a Quiz Boss result for a boss-type quest.
     * Returns {aborted} | {victory, xp, newCurses, leveledTo}. */
    applyBossResult(result, quest) {
      if (!result) return { aborted: true };

      const missed = result.missedQuestionIds || [];
      missed.forEach((id) => this._addCurse(id, quest.bank));

      let xp = 0;
      let leveledTo = 0;
      if (result.completed) {
        this.data.quests[quest.id] = { status: 'passed', updated: this.todayStr() };
        xp = typeof quest.xp === 'number' ? quest.xp : 50;
        this.addLog(`Quiz boss defeated: ${quest.title}`, xp);
        leveledTo = this.awardXp(xp);
      } else {
        this.addLog(`Struck down by ${quest.title}`, 0);
      }

      this.save();
      return { victory: !!result.completed, xp, newCurses: missed.length, leveledTo };
    },

    /* Apply a Region Trial (concept minigame) result.
     * XP = round(10 * score/max), first completed run per region per day only;
     * later same-day runs are practice (0 XP). `best` (all-time %) updates on
     * every completed run, practice included.
     * Returns {aborted} | {practice:true, pct, newBest}
     *       | {practice:false, xp, pct, newBest, leveledTo}. */
    applyTrialResult(result, regionId, trialTitle) {
      if (!result || !result.completed) return { aborted: true };

      const t = this.trialFor(regionId);
      const today = this.todayStr();
      const max = result.max | 0;
      const score = result.score | 0;
      const pct = max > 0 ? Math.round((100 * score) / max) : 0;
      const newBest = pct > (t.best | 0);
      if (newBest) t.best = pct;

      if (t.last_day === today) {
        this.addLog(
          `Practice trial — ${trialTitle}: ${score}/${max} (practice — no reward)`,
          0
        );
        this.save();
        return { practice: true, pct, newBest };
      }

      const xp = max > 0 ? Math.round((10 * score) / max) : 0;
      t.last_day = today;
      t.history.push({ day: today, score, max, xp });
      this.addLog(`Region trial completed — ${trialTitle}: ${score}/${max}`, xp);
      const leveledTo = this.awardXp(xp);

      this.save();
      return { practice: false, xp, pct, newBest, leveledTo };
    },

    /* Apply the Dragon Gauntlet result. Misses become curses whatever the
     * outcome (mapped to their bank via the loaded-bank cache). A victory
     * records the dragons-keep trial (daily XP rule) and, the FIRST time,
     * passes the "the-dragon" quest for its quests.json XP. Repeat victories
     * are practice. Returns {aborted} | {victory:false, newCurses}
     *   | {victory:true, firstVictory, questXp, trialXp, trialPractice,
     *      newCurses, leveledTo}. */
    applyDragonResult(result) {
      if (!result) return { aborted: true };

      const missed = result.missedQuestionIds || [];
      missed.forEach((id) => {
        const bankId = this.bankIdForQuestion(id);
        if (bankId) this._addCurse(id, bankId);
      });

      if (!result.completed) {
        this.addLog(
          `Struck down by the Dragon (${result.score | 0}/${result.max | 0})`,
          0
        );
        this.save();
        return { victory: false, newCurses: missed.length };
      }

      const regionId = 'dragons-keep';
      const t = this.trialFor(regionId);
      const today = this.todayStr();
      const max = result.max | 0;
      const score = result.score | 0;
      const pct = max > 0 ? Math.round((100 * score) / max) : 0;
      if (pct > (t.best | 0)) t.best = pct;

      let trialXp = 0;
      const trialPractice = t.last_day === today;
      if (!trialPractice) {
        trialXp = max > 0 ? Math.round((10 * score) / max) : 0;
        t.last_day = today;
        t.history.push({ day: today, score, max, xp: trialXp });
        this.addLog(`The Dragon's gauntlet survived: ${score}/${max}`, trialXp);
      } else {
        this.addLog(
          `Practice gauntlet against the Dragon: ${score}/${max} (practice — no reward)`,
          0
        );
      }
      let leveledTo = trialXp > 0 ? this.awardXp(trialXp) : 0;

      let questXp = 0;
      let firstVictory = false;
      const quest = this.questById('the-dragon');
      if (quest && this.questStatus('the-dragon') !== 'passed') {
        firstVictory = true;
        this.data.quests['the-dragon'] = { status: 'passed', updated: today };
        questXp = typeof quest.xp === 'number' ? quest.xp : 500;
        this.addLog('THE DRAGON IS SLAIN — the Grand Trial is passed', questXp);
        leveledTo = Math.max(leveledTo, this.awardXp(questXp));
      }

      this.save();
      return {
        victory: true,
        firstVictory,
        questXp,
        trialXp,
        trialPractice,
        newCurses: missed.length,
        leveledTo,
      };
    },
  };
})();
