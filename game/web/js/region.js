/* region.js — region panel (DOM overlay), quest board + quest detail, and the
 * two minigame launchers. This file is the ONLY caller of window.Minigames:
 *   Minigames.runeTrials.start(overlayEl, bank, opts, onComplete)
 *   Minigames.quizBoss.start(overlayEl, bank, opts, onComplete)
 * All state changes from results are delegated to Game.State. */
(() => {
  'use strict';
  window.Game = window.Game || {};

  const DRILL_BANK = 'pf-l1'; // MVP: every region drills the pf-l1 bank for now
  const DRILL_QUESTIONS = 10;
  const BOSS_QUESTIONS = 12;

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
      const boss = s.bossForRegion(meta.id);
      const drillDone = s.drillDoneToday();
      const bossReady = boss && s.requiresMet(boss);
      const bossPassed = boss && s.questStatus(boss.id) === 'passed';

      const drillLabel = drillDone ? 'Practice Drill' : 'Daily Drill';
      const bossLabel = bossPassed ? 'Quiz Boss ✓ (rematch)' : 'Quiz Boss';

      const panel = this._show(
        [
          '<button class="panel-close" type="button">✕</button>',
          `<h2>${esc(meta.name)}</h2>`,
          `<p class="flavor">${esc(meta.flavor)}</p>`,
          '<div class="region-actions">',
          `<button id="rg-drill" class="btn" type="button">${drillLabel}</button>`,
          '<button id="rg-quests" class="btn" type="button">Quest Board</button>',
          `<button id="rg-boss" class="btn btn-danger" type="button">${bossLabel}</button>`,
          '</div>',
          `<p class="action-note" id="rg-note"></p>`,
          '<div id="region-body"></div>',
        ].join('')
      );

      const note = panel.querySelector('#rg-note');
      if (drillDone) {
        note.textContent = 'Today’s drill is done — further runs are practice: no XP, no embers.';
      }

      panel.querySelector('#rg-drill').addEventListener('click', () => this.startDrill());
      panel.querySelector('#rg-quests').addEventListener('click', () => this.showBoard(panel, meta));

      const bossBtn = panel.querySelector('#rg-boss');
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
        parts.push('<p class="submit-note">Challenge the boss from this region’s <strong>Quiz Boss</strong> button once every requirement is passed.</p>');
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

    /* Daily drill (or practice run if today's drill is already done). */
    async startDrill() {
      const wasPractice = Game.State.drillDoneToday();

      let bank;
      try {
        bank = await Game.State.loadBank(DRILL_BANK);
      } catch (err) {
        Game.HUD.toast(err.message, 'error');
        return;
      }
      if (!(window.Minigames && window.Minigames.runeTrials && typeof window.Minigames.runeTrials.start === 'function')) {
        Game.HUD.toast('The Rune Trials failed to materialize (minigame not loaded).', 'error');
        return;
      }

      this.close();
      const overlay = this._openMinigameOverlay();
      if (wasPractice) {
        Game.HUD.toast('Practice drill — no XP, no embers.', 'info');
      }

      const opts = {
        questionCount: DRILL_QUESTIONS,
        curseQuestions: Game.State.activeCurseQuestions(bank),
      };

      window.Minigames.runeTrials.start(overlay, bank, opts, (result) => {
        this._closeMinigameOverlay(overlay);
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
          out.cleansed.forEach((id) => Game.HUD.celebrate(`Curse cleansed (${id}) — +25 XP`));
          if (result.missedQuestionIds && result.missedQuestionIds.length) {
            Game.HUD.toast(
              `${result.missedQuestionIds.length} miss(es) became Curses. They will hunt you in future drills.`,
              'error',
              5600
            );
          }
          if (out.leveledTo) Game.HUD.levelUp(out.leveledTo);
        }
        Game.HUD.render();
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
      if (!(window.Minigames && window.Minigames.quizBoss && typeof window.Minigames.quizBoss.start === 'function')) {
        Game.HUD.toast('The boss failed to materialize (minigame not loaded).', 'error');
        return;
      }

      this.close();
      const overlay = this._openMinigameOverlay();
      if (alreadyPassed) {
        Game.HUD.toast('Rematch — a practice bout. No rewards, no curses.', 'info');
      }

      const opts = { questionCount: BOSS_QUESTIONS, curseQuestions: [] };

      window.Minigames.quizBoss.start(overlay, bank, opts, (result) => {
        this._closeMinigameOverlay(overlay);

        if (!result) {
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
            if (out.newCurses) {
              Game.HUD.toast(
                `Victory, but ${out.newCurses} miss(es) became Curses. Cleanse them in daily drills.`,
                'error',
                5600
              );
            }
            if (out.leveledTo) Game.HUD.levelUp(out.leveledTo);
          } else {
            const curseMsg = out.newCurses ? ` ${out.newCurses} new Curse(s) afflict you.` : '';
            Game.HUD.toast(
              `You were struck down (${result.correct}/${result.total}).${curseMsg} Train, then return.`,
              'error',
              6400
            );
          }
        }
        Game.HUD.render();
      });
    },
  };
})();
