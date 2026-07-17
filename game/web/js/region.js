/* region.js — region panel (DOM overlay), quest board + quest detail, and the
 * minigame launchers. This file is the ONLY caller of window.Minigames:
 *   Minigames.runeTrials.start(overlayEl, bank, opts, onComplete)
 *   Minigames.quizBoss.start(overlayEl, bank, opts, onComplete)
 *   Minigames.libraryTrial.start(overlayEl, config, opts, onComplete)
 *   Minigames.summoningCircles.start(overlayEl, config, opts, onComplete)
 *   Minigames.warCouncil.start(overlayEl, config, opts, onComplete)
 *   Minigames.forgeTavern.start(overlayEl, config, opts, onComplete)
 *   Minigames.dragonGauntlet.start(overlayEl, config, opts, onComplete)
 *     (opts = {practice:bool}; dragonGauntlet additionally gets opts.banks =
 *      every loaded quiz-bank object)
 * Esc during ANY minigame is engine-owned: an in-world confirm dialog, and on
 * confirm the run is aborted ({completed:false, aborted:true}).
 * All state changes from results are delegated to Game.State. */
(() => {
  'use strict';
  window.Game = window.Game || {};

  const DRILL_QUESTIONS = 10;
  const BOSS_QUESTIONS = 12;

  /* Daily-drill bank per region. All pf-l1 until later lessons ship banks;
   * the bank listing is consulted to prefer "<prefix>-l1" once it exists. */
  const REGION_DRILL_BANK = {
    'rune-plains': 'pf-l1',
    'gatekeepers-forge': 'pf-l1',
    'great-library': 'pf-l1',
    'war-council': 'pf-l1',
    'dragons-keep': 'pf-l1',
  };
  const REGION_BANK_PREFIX = {
    'rune-plains': 'pf',
    'gatekeepers-forge': 'gf',
    'great-library': 'gl',
    'war-council': 'wc',
    'dragons-keep': 'dk',
  };
  const FALLBACK_DRILL_BANK = 'pf-l1';

  /* Region -> Region Trial(s). rune-plains has none (its trial IS the daily
   * drill). The Great Library hosts BOTH of its track's concept games (RAG +
   * agents both live in 03-ai-engineering). dragons-keep's trial is the Dragon
   * itself — it replaces the Quiz Boss button, styled as the region boss. */
  const REGION_TRIALS = {
    'gatekeepers-forge': [
      { api: 'forgeTavern', config: 'forge-tavern', title: 'The Tavern of One Bartender', icon: '\u{1F37A}' },
    ],
    'great-library': [
      { api: 'libraryTrial', config: 'library-trial', title: 'The Sundered Scrolls', icon: '\u{1F4DC}' },
      { api: 'summoningCircles', config: 'summoning-circles', title: 'The Summoning Circles', icon: '✨' },
    ],
    'war-council': [
      { api: 'warCouncil', config: 'war-council', title: 'The Council of Trade-offs', icon: '⚖' },
    ],
    'dragons-keep': [
      { api: 'dragonGauntlet', config: 'dragon-gauntlet', title: 'THE DRAGON', icon: '\u{1F409}', dragon: true },
    ],
  };

  function chipFor(status) {
    switch (status) {
      case 'in_progress':
        return '<span class="chip chip-progress">In progress</span>';
      case 'awaiting_review':
        return '<span class="chip chip-review">Awaiting review</span>';
      case 'passed':
        return '<span class="chip chip-passed">Passed</span>';
      default:
        return '<span class="chip chip-none">Not started</span>';
    }
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = String(s == null ? '' : s);
    return d.innerHTML;
  }

  Game.Region = {
    overlay: null,
    currentRegion: null,

    init() {
      this.overlay = document.getElementById('overlay-region');
      this.overlay.addEventListener('click', (e) => {
        if (e.target === this.overlay) this.close();
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !this.overlay.classList.contains('hidden')) this.close();
      });
    },

    /* ---------- open / close ---------- */

    open(regionId) {
      const meta = Game.Meta.regionById(regionId);
      if (!meta) return;
      this.currentRegion = regionId;

      if (!Game.State.regionUnlocked(regionId)) {
        this.showSealed(meta);
        return;
      }
      this.showPanel(meta);
    },

    close() {
      this.overlay.classList.add('hidden');
      this.overlay.innerHTML = '';
      this.currentRegion = null;
      Game.ui.overlayOpen = false;
    },

    _show(panelHtml) {
      this.overlay.innerHTML = '';
      const panel = document.createElement('div');
      panel.className = 'panel';
      panel.innerHTML = panelHtml;
      this.overlay.appendChild(panel);
      this.overlay.classList.remove('hidden');
      Game.ui.overlayOpen = true;
      panel.querySelector('.panel-close').addEventListener('click', () => this.close());
      return panel;
    },

    showSealed(meta) {
      const req = Game.Meta.requirementFor(meta.id);
      const panel = this._show(
        [
          '<button class="panel-close" type="button">✕</button>',
          '<div class="panel-sealed">',
          `<div class="seal-lock">\u{1F512}</div>`,
          `<h2>${esc(meta.name)}</h2>`,
          `<div class="seal-msg">Sealed — beat ${esc(req || 'the earlier trials')} first</div>`,
          '<p class="flavor">The gate does not answer. The Game Master lifts each seal when the previous region’s trials are passed.</p>',
          '</div>',
        ].join('')
      );
      void panel;
    },

    showPanel(meta) {
      const s = Game.State;
      const isDragonKeep = meta.id === 'dragons-keep';
      const trials = REGION_TRIALS[meta.id] || [];
      const regionTrials = trials.filter((t) => !t.dragon);
      const dragonTrial = trials.find((t) => t.dragon) || null;
      const boss = isDragonKeep ? null : s.bossForRegion(meta.id); // the Dragon replaces the Quiz Boss
      const drillDone = s.drillDoneToday();
      const trialDone = s.trialDoneToday(meta.id);
      const bossReady = boss && s.requiresMet(boss);
      const bossPassed = boss && s.questStatus(boss.id) === 'passed';
      const dragonSlain = dragonTrial && s.questStatus('the-dragon') === 'passed';

      const drillLabel = drillDone ? 'Practice Drill' : 'Daily Drill';
      const bossLabel = bossPassed ? 'Quiz Boss ✓ (rematch)' : 'Quiz Boss';
      const best = s.trialBest(meta.id);

      const trialButtons = regionTrials
        .map((t, i) => {
          const bestLine = best > 0 ? `Region Trial · best ${best}%` : 'Region Trial';
          return [
            `<button class="btn btn-trial" data-trial="${i}" type="button">`,
            `<span class="trial-icon">${esc(t.icon)}</span>`,
            `<span class="trial-name">${esc(t.title)}</span>`,
            `<span class="trial-sub">${esc(bestLine)}</span>`,
            '</button>',
          ].join('');
        })
        .join('');

      const parts = [
        '<button class="panel-close" type="button">✕</button>',
        `<h2>${esc(meta.name)}</h2>`,
        `<p class="flavor">${esc(meta.flavor)}</p>`,
        '<div class="region-actions">',
        `<button id="rg-drill" class="btn" type="button">${drillLabel}</button>`,
        trialButtons,
        '<button id="rg-quests" class="btn" type="button">Quest Board</button>',
      ];
      if (dragonTrial) {
        const dragonSub = dragonSlain
          ? `Slain — rematch for glory${best > 0 ? ` · best ${best}%` : ''}`
          : 'The Final Gauntlet';
        parts.push(
          [
            '<button id="rg-dragon" class="btn btn-danger btn-dragon" type="button">',
            `<span class="dragon-icon">${esc(dragonTrial.icon)}</span>`,
            `<span class="dragon-label">${esc(dragonTrial.title)}${dragonSlain ? ' ✓' : ''}</span>`,
            `<span class="trial-sub">${esc(dragonSub)}</span>`,
            '</button>',
          ].join('')
        );
      } else {
        parts.push(`<button id="rg-boss" class="btn btn-danger" type="button">${bossLabel}</button>`);
      }
      parts.push('</div>');
      parts.push('<p class="action-note" id="rg-note"></p>');
      parts.push('<div id="region-body"></div>');

      const panel = this._show(parts.join(''));

      const note = panel.querySelector('#rg-note');
      if (drillDone) {
        note.textContent = 'Today’s drill is done — further runs are practice: no XP, no embers.';
      } else if (trialDone && trials.length) {
        note.textContent = 'Today’s Region Trial reward is claimed — further trial runs are practice.';
      }

      panel.querySelector('#rg-drill').addEventListener('click', () => this.startDrill(meta.id));
      panel.querySelector('#rg-quests').addEventListener('click', () => this.showBoard(panel, meta));

      panel.querySelectorAll('.btn-trial').forEach((btn) => {
        btn.addEventListener('click', () => {
          const t = regionTrials[parseInt(btn.getAttribute('data-trial'), 10)];
          if (t) this.startTrial(meta.id, t);
        });
      });

      const dragonBtn = panel.querySelector('#rg-dragon');
      if (dragonBtn) {
        dragonBtn.addEventListener('click', () => this.startDragon(meta.id, dragonTrial));
      }

      const bossBtn = panel.querySelector('#rg-boss');
      if (bossBtn) {
        if (!boss) {
          bossBtn.disabled = true;
          bossBtn.title = 'No boss stirs in this region yet.';
        } else if (!bossReady) {
          bossBtn.disabled = true;
          const unmet = (boss.requires || [])
            .filter((id) => s.questStatus(id) !== 'passed')
            .map((id) => {
              const q = s.questById(id);
              return q ? q.title : id;
            });
          bossBtn.title = `The boss will not appear until you pass: ${unmet.join(', ')}`;
          if (!drillDone) note.textContent = `Quiz Boss sealed — pass first: ${unmet.join(', ')}`;
        } else {
          bossBtn.addEventListener('click', () => this.startBoss(boss));
        }
      }

      this.showBoard(panel, meta);
    },

    /* ---------- quest board ---------- */

    showBoard(panel, meta) {
      const body = panel.querySelector('#region-body');
      const quests = Game.State.questsForRegion(meta.id);

      if (!quests.length) {
        body.innerHTML = '<h3>Quest Board</h3><p class="flavor">The board is bare. New notices arrive as the curriculum grows.</p>';
        return;
      }

      const items = quests
        .map((q) => {
          const badge = q.type === 'boss' ? '<span class="badge badge-boss">Boss</span>' : '<span class="badge badge-code">Quest</span>';
          return [
            `<li class="quest-item" data-quest="${esc(q.id)}">`,
            badge,
            `<span class="q-title">${esc(q.title)}</span>`,
            `<span class="q-xp">${q.xp} XP</span>`,
            chipFor(Game.State.questStatus(q.id)),
            '</li>',
          ].join('');
        })
        .join('');

      body.innerHTML = `<h3>Quest Board</h3><ul class="quest-list">${items}</ul>`;
      body.querySelectorAll('.quest-item').forEach((el) => {
        el.addEventListener('click', () => {
          const quest = Game.State.questById(el.getAttribute('data-quest'));
          if (quest) this.showDetail(panel, meta, quest);
        });
      });
    },

    /* ---------- quest detail ---------- */

    showDetail(panel, meta, quest) {
      const body = panel.querySelector('#region-body');
      const status = Game.State.questStatus(quest.id);

      const parts = [
        '<div class="quest-detail">',
        '<button class="back-link" id="qd-back" type="button">&larr; Back to the board</button>',
        `<h3>${esc(quest.title)} ${chipFor(status)}</h3>`,
        `<p class="lesson-line">${esc(quest.lesson)} &middot; ${quest.type === 'boss' ? 'Quiz Boss' : 'Code Quest'} &middot; ${quest.xp} XP</p>`,
        `<p class="q-summary">${esc(quest.summary)}</p>`,
      ];

      if (quest.type === 'boss') {
        const reqs = (quest.requires || []).map((id) => {
          const rq = Game.State.questById(id);
          const met = Game.State.questStatus(id) === 'passed';
          return `<li class="${met ? 'req-met' : 'req-unmet'}">${met ? '✓' : '✗'} ${esc(rq ? rq.title : id)}</li>`;
        });
        parts.push('<h3>Requires</h3>');
        parts.push(`<ul class="req-list">${reqs.join('') || '<li class="req-met">Nothing — it waits for you now.</li>'}</ul>`);
        if (quest.id === 'the-dragon') {
          parts.push('<p class="submit-note">Face it through this region’s <strong>THE DRAGON</strong> button. It asks everything, in fire, under time.</p>');
        } else {
          parts.push('<p class="submit-note">Challenge the boss from this region’s <strong>Quiz Boss</strong> button once every requirement is passed.</p>');
        }
      } else {
        parts.push('<h3>The Brief</h3>');
        parts.push(`<code class="quest-path">${esc(quest.path)}</code>`);
        parts.push(
          '<p class="submit-note">Write your code in the workspace, then ask the Game Master in Claude Code for review. Only the Game Master can mark a code quest passed.</p>'
        );
        if (!status) {
          parts.push('<button id="qd-begin" class="btn btn-gold btn-wide" type="button">Begin Quest</button>');
        } else if (status === 'in_progress') {
          parts.push('<button id="qd-review" class="btn btn-wide" type="button">Summon the Game Master (mark ready for review)</button>');
        } else if (status === 'awaiting_review') {
          parts.push('<p class="action-note">The Game Master is reviewing your runes. Open Claude Code to face the questions.</p>');
        } else if (status === 'passed') {
          parts.push('<p class="action-note">Passed. The runes were your own, and they held.</p>');
        }
      }

      parts.push('</div>');
      body.innerHTML = parts.join('');

      body.querySelector('#qd-back').addEventListener('click', () => this.showBoard(panel, meta));

      const beginBtn = body.querySelector('#qd-begin');
      if (beginBtn) {
        beginBtn.addEventListener('click', () => {
          Game.State.beginQuest(quest);
          Game.HUD.toast(`Quest begun: ${quest.title}. The brief awaits at ${quest.path}`, 'info', 6000);
          this.showDetail(panel, meta, quest);
        });
      }

      const reviewBtn = body.querySelector('#qd-review');
      if (reviewBtn) {
        reviewBtn.addEventListener('click', () => {
          Game.State.markAwaitingReview(quest);
          Game.HUD.toast('The Game Master has been summoned. Ask for review in Claude Code.', 'info', 6000);
          this.showDetail(panel, meta, quest);
        });
      }
    },

    /* ---------- minigame launching ---------- */

    _openMinigameOverlay() {
      const overlay = document.getElementById('overlay-minigame');
      overlay.innerHTML = '';
      overlay.classList.remove('hidden');
      Game.ui.overlayOpen = true;
      return overlay;
    },

    _closeMinigameOverlay(overlay) {
      overlay.classList.add('hidden');
      overlay.innerHTML = ''; // minigames clean up after themselves; belt and braces
      Game.ui.overlayOpen = false;
    },

    _abortDialogOpen: false,

    /* In-world "abandon the trial?" confirm (never window.confirm). Shown on
     * overlay-modal, which sits above the minigame overlay. */
    _confirmAbort(onAbandon) {
      if (this._abortDialogOpen) return;
      this._abortDialogOpen = true;

      const modal = document.getElementById('overlay-modal');
      modal.innerHTML = '';
      const panel = document.createElement('div');
      panel.className = 'panel abort-box';
      panel.innerHTML = [
        '<h2>Abandon the Trial?</h2>',
        '<p class="flavor">Walk away now and nothing is recorded — no XP, no ember,',
        ' no shame either. The trial will wait, as trials do.</p>',
        '<div class="abort-actions">',
        '<button id="abort-stay" class="btn btn-gold" type="button">Keep Fighting</button>',
        '<button id="abort-flee" class="btn btn-danger" type="button">Abandon</button>',
        '</div>',
      ].join('');
      modal.appendChild(panel);
      modal.classList.remove('hidden');

      /* Swallow every key while the dialog is open so the minigame beneath
       * cannot hear them; Esc closes the dialog (= stay). */
      const onKey = (e) => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          e.preventDefault();
          close(false);
        }
      };
      const close = (abandon) => {
        document.removeEventListener('keydown', onKey, true);
        modal.classList.add('hidden');
        modal.innerHTML = '';
        this._abortDialogOpen = false;
        if (abandon) onAbandon();
      };
      document.addEventListener('keydown', onKey, true);
      panel.querySelector('#abort-stay').addEventListener('click', () => close(false));
      panel.querySelector('#abort-flee').addEventListener('click', () => close(true));
      setTimeout(() => {
        const stay = panel.querySelector('#abort-stay');
        if (stay) stay.focus();
      }, 30);
    },

    /* Shared launcher: opens the overlay, runs the minigame, owns Esc.
     * `settle` fires exactly once — either from the minigame's onComplete or
     * from an engine-driven abort ({completed:false, aborted:true}). */
    _launchMinigame(game, payload, opts, onDone) {
      const overlay = this._openMinigameOverlay();
      let settled = false;

      const settle = (result) => {
        if (settled) return; // late onComplete after an abort is swallowed
        settled = true;
        document.removeEventListener('keydown', onEsc, true);
        /* Tell the minigame to tear itself down (timers, document listeners,
         * DOM). On a normal finish it has already cleaned up — the hook is
         * idempotent — but on an engine abort this is what stops the game
         * from running on against detached nodes. */
        overlay.dispatchEvent(new CustomEvent('grandtrial:abort'));
        this._closeMinigameOverlay(overlay);
        onDone(result);
        Game.HUD.render();
      };

      const onEsc = (e) => {
        if (e.key !== 'Escape' || settled || this._abortDialogOpen) return;
        e.preventDefault();
        e.stopPropagation();
        this._confirmAbort(() => {
          settle({
            completed: false,
            aborted: true,
            score: 0,
            max: 0,
            correct: 0,
            total: 0,
            missedQuestionIds: [],
            correctQuestionIds: [],
            durationSec: 0,
          });
        });
      };
      document.addEventListener('keydown', onEsc, true);

      game.start(overlay, payload, opts, settle);
    },

    _minigameReady(name) {
      return window.Minigames &&
        window.Minigames[name] &&
        typeof window.Minigames[name].start === 'function'
        ? window.Minigames[name]
        : null;
    },

    /* Drill bank for a region: prefer "<prefix>-l1" from the bank listing when
     * it exists; fall back to the static map (pf-l1 for all, for now). */
    async _drillBankIdFor(regionId) {
      const fallback = REGION_DRILL_BANK[regionId] || FALLBACK_DRILL_BANK;
      const prefix = REGION_BANK_PREFIX[regionId];
      if (!prefix) return fallback;
      let ids;
      try {
        ids = await Game.State.loadBankIds();
      } catch (err) {
        return fallback; // listing endpoint unavailable — use the static map
      }
      const preferred = `${prefix}-l1`;
      return ids.indexOf(preferred) !== -1 ? preferred : fallback;
    },

    /* Daily drill (or practice run if today's drill is already done). */
    async startDrill(regionId) {
      const wasPractice = Game.State.drillDoneToday();

      let bank;
      try {
        const bankId = await this._drillBankIdFor(regionId || 'rune-plains');
        bank = await Game.State.loadBank(bankId);
      } catch (err) {
        Game.HUD.toast(err.message, 'error');
        return;
      }
      const game = this._minigameReady('runeTrials');
      if (!game) {
        Game.HUD.toast('The Rune Trials failed to materialize (minigame not loaded).', 'error');
        return;
      }

      this.close();
      if (wasPractice) {
        Game.HUD.toast('Practice drill — no XP, no embers.', 'info');
      }

      const opts = {
        questionCount: DRILL_QUESTIONS,
        curseQuestions: Game.State.activeCurseQuestions(bank),
        practice: wasPractice,
      };

      this._launchMinigame(game, bank, opts, (result) => {
        const out = Game.State.applyDrillResult(result, bank);

        if (out.aborted) {
          Game.HUD.toast('The drill was abandoned — no reward, no ember.', 'info');
        } else if (out.practice) {
          Game.HUD.toast(
            `Practice drill: ${result.correct}/${result.total} correct. Practice earns nothing but skill.`,
            'info'
          );
        } else {
          Game.HUD.celebrate(
            `Daily drill complete: ${result.correct}/${result.total} — +${out.xp} XP and an ember \u{1F525}`
          );
          out.cleansed.forEach((id) => Game.HUD.cleanseToast(id));
          if (result.missedQuestionIds && result.missedQuestionIds.length) {
            Game.HUD.toast(
              `${result.missedQuestionIds.length} miss(es) became Curses. They will hunt you in future drills.`,
              'error',
              5600
            );
            Game.HUD.cursePulse();
          }
          if (out.leveledTo) Game.HUD.levelUp(out.leveledTo);
        }
      });
    },

    /* Quiz boss for a boss-type quest. Rematches after a pass are pure practice. */
    async startBoss(quest) {
      if (!Game.State.requiresMet(quest)) return;
      const alreadyPassed = Game.State.questStatus(quest.id) === 'passed';

      let bank;
      try {
        bank = await Game.State.loadBank(quest.bank);
      } catch (err) {
        Game.HUD.toast(err.message, 'error');
        return;
      }
      const game = this._minigameReady('quizBoss');
      if (!game) {
        Game.HUD.toast('The boss failed to materialize (minigame not loaded).', 'error');
        return;
      }

      this.close();
      if (alreadyPassed) {
        Game.HUD.toast('Rematch — a practice bout. No rewards, no curses.', 'info');
      }

      const opts = { questionCount: BOSS_QUESTIONS, curseQuestions: [], practice: alreadyPassed };

      this._launchMinigame(game, bank, opts, (result) => {
        if (!result || result.aborted) {
          Game.HUD.toast('The bout dissolved into mist — nothing recorded.', 'info');
        } else if (alreadyPassed) {
          Game.HUD.toast(
            `Practice bout ${result.completed ? 'won' : 'lost'} (${result.correct}/${result.total}). Nothing recorded.`,
            'info'
          );
        } else {
          const out = Game.State.applyBossResult(result, quest);
          if (out.victory) {
            Game.HUD.celebrate(`${quest.title} falls! +${out.xp} XP`);
            if (Game.SFX) Game.SFX.play('victory');
            if (out.newCurses) {
              Game.HUD.toast(
                `Victory, but ${out.newCurses} miss(es) became Curses. Cleanse them in daily drills.`,
                'error',
                5600
              );
              Game.HUD.cursePulse();
            }
            if (out.leveledTo) Game.HUD.levelUp(out.leveledTo);
          } else {
            const curseMsg = out.newCurses ? ` ${out.newCurses} new Curse(s) afflict you.` : '';
            Game.HUD.toast(
              `You were struck down (${result.correct}/${result.total}).${curseMsg} Train, then return.`,
              'error',
              6400
            );
            if (Game.SFX) Game.SFX.play('defeat');
            if (out.newCurses) Game.HUD.cursePulse();
          }
        }
      });
    },

    /* Region Trial: a concept minigame driven by its JSON config.
     * XP only on the first completed run per region per day; later runs are
     * practice (flagged via opts.practice so the game shows its ribbon). */
    async startTrial(regionId, trial) {
      const practice = Game.State.trialDoneToday(regionId);

      let config;
      try {
        config = await Game.State.loadMinigameConfig(trial.config);
      } catch (err) {
        Game.HUD.toast(err.message, 'error');
        return;
      }
      const game = this._minigameReady(trial.api);
      if (!game) {
        Game.HUD.toast(`${trial.title} failed to materialize (minigame not loaded).`, 'error');
        return;
      }

      this.close();
      if (practice) {
        Game.HUD.toast('Practice run — no XP.', 'info');
      }

      this._launchMinigame(game, config, { practice }, (result) => {
        const out = Game.State.applyTrialResult(result, regionId, trial.title);

        if (out.aborted) {
          Game.HUD.toast('The trial was abandoned — nothing recorded.', 'info');
        } else if (out.practice) {
          Game.HUD.toast(
            `Practice — ${trial.title}: ${result.score}/${result.max}.` +
              (out.newBest ? ` A new personal best: ${out.pct}%!` : ' Practice earns nothing but skill.'),
            'info'
          );
        } else {
          Game.HUD.celebrate(
            `${trial.title} complete: ${result.score}/${result.max} — +${out.xp} XP`
          );
          if (Game.SFX) Game.SFX.play('correct');
          if (out.newBest) {
            Game.HUD.toast(`New best for this trial: ${out.pct}%.`, 'gold', 4200);
          }
          if (out.leveledTo) Game.HUD.levelUp(out.leveledTo);
        }
      });
    },

    /* THE DRAGON — dragons-keep's region trial and the final boss in one.
     * Gets every quiz bank via opts.banks. First victory passes "the-dragon"
     * and triggers the grand celebration; repeat victories are practice. */
    async startDragon(regionId, trial) {
      const practice = Game.State.trialDoneToday(regionId);

      let config;
      let banks;
      try {
        config = await Game.State.loadMinigameConfig(trial.config);
        banks = await Game.State.loadAllBanks();
      } catch (err) {
        Game.HUD.toast(err.message, 'error');
        return;
      }
      const game = this._minigameReady(trial.api);
      if (!game) {
        Game.HUD.toast('The Dragon slumbers still (minigame not loaded).', 'error');
        return;
      }

      this.close();
      if (practice) {
        Game.HUD.toast('Practice gauntlet — no XP.', 'info');
      }

      this._launchMinigame(game, config, { practice, banks }, (result) => {
        if (!result || result.aborted) {
          Game.HUD.toast('You slip out of the Keep — the Dragon pretends not to notice.', 'info');
          return;
        }

        const out = Game.State.applyDragonResult(result);

        if (out.victory) {
          if (out.firstVictory) {
            Game.HUD.grandVictory();
            Game.HUD.celebrate(`THE DRAGON IS SLAIN — +${out.questXp} XP`);
          } else {
            Game.HUD.toast('The Dragon falls again. It is getting used to it.', 'gold', 5200);
            if (Game.SFX) Game.SFX.play('victory');
          }
          if (out.trialXp) {
            Game.HUD.toast(`Gauntlet reward: +${out.trialXp} XP`, 'gold', 4200);
          }
          if (out.leveledTo) Game.HUD.levelUp(out.leveledTo);
        } else {
          Game.HUD.toast(
            `The Dragon prevails (${result.score | 0}/${result.max | 0}). Lick your wounds, cleanse your curses, return.`,
            'error',
            6400
          );
          if (Game.SFX) Game.SFX.play('defeat');
        }
        if (out.newCurses) {
          Game.HUD.toast(
            `${out.newCurses} of its questions left scars — new Curses to cleanse in daily drills.`,
            'error',
            5600
          );
          Game.HUD.cursePulse();
        }
      });
    },
  };
})();
