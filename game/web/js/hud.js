/* hud.js — HUD bar (name/level/XP/embers/daily-drill/curses/mute), toasts,
 * level-up + grand-victory celebrations, the Curse Codex panel, and the
 * first-run hero naming modal. Reads Game.State; never mutates it except
 * through Game.State methods. */
(() => {
  'use strict';
  window.Game = window.Game || {};

  Game.HUD = {
    els: {},

    init() {
      this.els = {
        name: document.getElementById('hud-name'),
        level: document.getElementById('hud-level'),
        xpFill: document.getElementById('xp-fill'),
        xpText: document.getElementById('xp-text'),
        embers: document.getElementById('hud-embers'),
        drillBtn: document.getElementById('btn-daily-drill'),
        cursesBtn: document.getElementById('btn-curses'),
        muteBtn: document.getElementById('btn-mute'),
        toasts: document.getElementById('toasts'),
        modal: document.getElementById('overlay-modal'),
        celebrate: document.getElementById('celebrate-layer'),
      };

      this.els.drillBtn.addEventListener('click', () => {
        if (Game.ui.overlayOpen) return;
        if (Game.SFX) Game.SFX.play('click');
        Game.Region.startDrill();
      });

      this.els.cursesBtn.addEventListener('click', () => {
        if (Game.ui.overlayOpen) return;
        if (Game.SFX) Game.SFX.play('click');
        this.openCurseCodex();
      });

      this.els.muteBtn.addEventListener('click', () => {
        if (!Game.SFX) return;
        const muted = Game.SFX.toggleMute();
        this._renderMute();
        if (!muted) Game.SFX.play('click'); // audible confirmation of unmute
        this.toast(muted ? 'The realm falls silent.' : 'The realm sings again.', 'info', 2200);
      });
      this._renderMute();
    },

    _renderMute() {
      const muted = !!(Game.SFX && Game.SFX.muted);
      this.els.muteBtn.textContent = muted ? '\u{1F507}' : '\u{1F50A}';
      this.els.muteBtn.title = muted ? 'Sound is off — click to unmute' : 'Sound is on — click to mute';
    },

    render() {
      const s = Game.State;
      const p = s.data.player;
      const { lo, hi } = s.xpBounds(p.level);
      const pct = hi > lo ? Math.min(100, Math.round(((p.xp - lo) / (hi - lo)) * 100)) : 100;

      this.els.name.textContent = p.name;
      this.els.level.textContent = `Lv ${p.level}`;
      this.els.xpFill.style.width = `${pct}%`;
      this.els.xpText.textContent = `${p.xp} / ${hi} XP`;
      this.els.embers.textContent = `\u{1F525} ${s.data.drills.embers}`;

      if (s.drillDoneToday()) {
        this.els.drillBtn.disabled = true;
        this.els.drillBtn.textContent = '✓ Drill done today';
      } else {
        this.els.drillBtn.disabled = false;
        this.els.drillBtn.textContent = 'Daily Drill';
      }

      const curseCount = s.activeCurseCount();
      this.els.cursesBtn.textContent = `☠ ${curseCount}`;
      this.els.cursesBtn.classList.toggle('hidden', curseCount === 0);
      this._renderMute();
    },

    /* ---------- toasts ---------- */

    toast(message, type, ms) {
      const el = document.createElement('div');
      el.className = 'toast' + (type === 'error' ? ' toast-error' : type === 'gold' ? ' toast-gold' : '');
      el.textContent = message;
      this.els.toasts.appendChild(el);
      const ttl = ms || 4200;
      setTimeout(() => {
        el.classList.add('toast-out');
        setTimeout(() => el.remove(), 450);
      }, ttl);
    },

    celebrate(message) {
      this.toast(message, 'gold', 5200);
    },

    /* Distinct toast + chime for a cleansed curse. */
    cleanseToast(questionId) {
      const el = document.createElement('div');
      el.className = 'toast toast-cleanse';
      el.textContent = `✦ Curse cleansed (${questionId}) — +25 XP. The wound closes.`;
      this.els.toasts.appendChild(el);
      setTimeout(() => {
        el.classList.add('toast-out');
        setTimeout(() => el.remove(), 450);
      }, 5600);
      if (Game.SFX) Game.SFX.play('cleanse');
    },

    /* Floating ☠ pulse on the HUD curse button when new curses latch on. */
    cursePulse() {
      this.render(); // the button must be visible (count > 0) before pulsing
      const btn = this.els.cursesBtn;
      btn.classList.remove('curse-pop');
      void btn.offsetWidth; /* restart the pop animation */
      btn.classList.add('curse-pop');
      const float = document.createElement('span');
      float.className = 'curse-float';
      float.textContent = '☠';
      btn.appendChild(float);
      setTimeout(() => float.remove(), 1500);
    },

    /* ---------- Curse Codex ---------- */

    openCurseCodex() {
      const modal = this.els.modal;
      modal.innerHTML = '';
      const panel = document.createElement('div');
      panel.className = 'panel codex-panel';

      const closeBtn = document.createElement('button');
      closeBtn.className = 'panel-close';
      closeBtn.type = 'button';
      closeBtn.textContent = '✕';
      panel.appendChild(closeBtn);

      const h2 = document.createElement('h2');
      h2.textContent = 'The Curse Codex';
      panel.appendChild(h2);

      const flavor = document.createElement('p');
      flavor.className = 'flavor';
      flavor.textContent =
        'Every rune you miss is written here in your own blood. Answer a curse ' +
        'correctly in two daily drills and its page burns clean.';
      panel.appendChild(flavor);

      const body = document.createElement('div');
      body.className = 'codex-body';
      body.appendChild(this._codexLoadingRow());
      panel.appendChild(body);

      modal.appendChild(panel);
      modal.classList.remove('hidden');
      Game.ui.overlayOpen = true;

      let closed = false;
      const onKey = (e) => {
        if (e.key === 'Escape') close();
      };
      const onBackdrop = (e) => {
        if (e.target === modal) close();
      };
      const close = () => {
        if (closed) return;
        closed = true;
        document.removeEventListener('keydown', onKey);
        modal.removeEventListener('click', onBackdrop);
        modal.classList.add('hidden');
        modal.innerHTML = '';
        Game.ui.overlayOpen = false;
      };
      closeBtn.addEventListener('click', close);
      modal.addEventListener('click', onBackdrop);
      document.addEventListener('keydown', onKey);

      this._fillCodex(body);
    },

    _codexLoadingRow() {
      const p = document.createElement('p');
      p.className = 'codex-loading';
      p.textContent = 'Consulting the archives…';
      return p;
    },

    /* Fetches each curse's bank to show real question text; falls back to the
     * question id when a bank cannot be read. */
    async _fillCodex(body) {
      const curses = Game.State.data.curses;
      const bankIds = [...new Set(curses.map((c) => c.bank))];
      const prompts = {}; // question_id -> prompt text
      await Promise.all(
        bankIds.map(async (bankId) => {
          try {
            const bank = await Game.State.loadBank(bankId);
            (bank.questions || []).forEach((q) => {
              prompts[q.id] = q.prompt;
            });
          } catch (err) {
            /* bank unreadable — rows fall back to question ids */
          }
        })
      );

      body.innerHTML = '';
      const active = curses.filter((c) => !c.cleansed);
      const cleansed = curses.filter((c) => c.cleansed);

      if (!active.length && !cleansed.length) {
        const p = document.createElement('p');
        p.className = 'codex-empty';
        p.textContent = 'The codex lies empty. No curse holds you — walk proud.';
        body.appendChild(p);
        return;
      }

      if (active.length) {
        const list = document.createElement('div');
        list.className = 'codex-list';
        active.forEach((c) => list.appendChild(this._codexRow(c, prompts, false)));
        body.appendChild(list);
      } else {
        const p = document.createElement('p');
        p.className = 'codex-empty';
        p.textContent = 'No active curses — every open wound has been closed.';
        body.appendChild(p);
      }

      if (cleansed.length) {
        const details = document.createElement('details');
        details.className = 'codex-cleansed';
        const summary = document.createElement('summary');
        summary.textContent = `Cleansed (${cleansed.length})`;
        details.appendChild(summary);
        const list = document.createElement('div');
        list.className = 'codex-list';
        cleansed.forEach((c) => list.appendChild(this._codexRow(c, prompts, true)));
        details.appendChild(list);
        body.appendChild(details);
      }
    },

    _codexRow(curse, prompts, isCleansed) {
      const row = document.createElement('div');
      row.className = 'codex-row' + (isCleansed ? ' codex-row-cleansed' : '');

      const mark = document.createElement('span');
      mark.className = 'codex-mark';
      mark.textContent = isCleansed ? '✓' : '☠';
      row.appendChild(mark);

      const main = document.createElement('div');
      main.className = 'codex-main';

      const prompt = document.createElement('div');
      prompt.className = 'codex-prompt';
      prompt.textContent = prompts[curse.question_id] || curse.question_id;
      prompt.title = prompts[curse.question_id] || curse.question_id;
      main.appendChild(prompt);

      const meta = document.createElement('div');
      meta.className = 'codex-meta';
      const bank = document.createElement('span');
      bank.className = 'codex-bank';
      bank.textContent = curse.bank;
      meta.appendChild(bank);
      const hits = document.createElement('span');
      hits.className = 'codex-hits';
      hits.textContent = isCleansed ? 'cleansed ✓' : `cleansing ${curse.hits}/2`;
      meta.appendChild(hits);
      const misses = document.createElement('span');
      misses.className = 'codex-misses';
      misses.textContent =
        curse.misses === 1 ? 'it has struck you once' : `it has struck you ${curse.misses} times`;
      meta.appendChild(misses);
      main.appendChild(meta);

      if (!isCleansed) {
        const hint = document.createElement('div');
        hint.className = 'codex-flavor';
        hint.textContent =
          curse.hits > 0
            ? 'One more true answer in a daily drill burns this page clean.'
            : 'It will ambush you in your daily drills until answered true twice.';
        main.appendChild(hint);
      }

      row.appendChild(main);
      return row;
    },

    /* ---------- level-up celebration (non-blocking overlay) ---------- */

    levelUp(newLevel) {
      const box = document.createElement('div');
      box.className = 'levelup';
      const title = document.createElement('div');
      title.className = 'lu-title';
      title.textContent = 'LEVEL UP';
      const sub = document.createElement('div');
      sub.className = 'lu-sub';
      sub.textContent = `${Game.State.data.player.name} reaches Level ${newLevel}`;
      box.appendChild(title);
      box.appendChild(sub);
      this.els.celebrate.appendChild(box);
      setTimeout(() => box.remove(), 2700);
      if (Game.SFX) Game.SFX.play('levelup');
    },

    /* ---------- grand victory (the Dragon falls for the first time) ---------- */

    grandVictory() {
      const gv = document.createElement('div');
      gv.className = 'grand-victory';

      const rays = document.createElement('div');
      rays.className = 'gv-rays';
      gv.appendChild(rays);

      for (let i = 0; i < 26; i++) {
        const spark = document.createElement('span');
        spark.className = 'gv-spark';
        spark.style.left = `${Math.random() * 100}%`;
        spark.style.animationDelay = `${(Math.random() * 2.4).toFixed(2)}s`;
        spark.style.animationDuration = `${(2 + Math.random() * 2.5).toFixed(2)}s`;
        gv.appendChild(spark);
      }

      const core = document.createElement('div');
      core.className = 'gv-core';
      const title = document.createElement('div');
      title.className = 'gv-title';
      title.textContent = 'THE TRIAL IS PASSED';
      const sub = document.createElement('div');
      sub.className = 'gv-sub';
      sub.textContent = `${Game.State.data.player.name} has slain the Dragon. The interview holds no more terrors.`;
      core.appendChild(title);
      core.appendChild(sub);
      gv.appendChild(core);

      this.els.celebrate.appendChild(gv);
      setTimeout(() => gv.remove(), 9000);
      if (Game.SFX) Game.SFX.play('victory');
    },

    /* ---------- first-run hero naming ---------- */

    promptHeroName() {
      const modal = this.els.modal;
      modal.innerHTML = '';
      const panel = document.createElement('div');
      panel.className = 'panel';
      panel.innerHTML = [
        '<div class="name-form">',
        '<h2>The Grand Trial</h2>',
        '<p>The Trial stirs, stranger. Somewhere beyond the Plains, a Dragon is',
        ' sharpening its questions. By what name shall the runes know you?</p>',
        '<input id="hero-name-input" maxlength="24" autocomplete="off"',
        ' placeholder="Speak your name…">',
        '<button id="hero-name-seal" class="btn btn-gold" type="button">Seal the Name</button>',
        '<br><button id="hero-name-skip" class="name-skip" type="button">Remain nameless for now</button>',
        '</div>',
      ].join('');
      modal.appendChild(panel);
      modal.classList.remove('hidden');
      Game.ui.overlayOpen = true;

      const input = panel.querySelector('#hero-name-input');
      const close = () => {
        modal.classList.add('hidden');
        modal.innerHTML = '';
        Game.ui.overlayOpen = false;
      };
      const seal = () => {
        const name = input.value.trim();
        if (!name) {
          input.placeholder = 'The runes require a name…';
          input.focus();
          return;
        }
        Game.State.setHeroName(name);
        close();
        this.render();
        this.celebrate(`Welcome to the Trial, ${name}. The Rune Plains await.`);
      };

      panel.querySelector('#hero-name-seal').addEventListener('click', seal);
      panel.querySelector('#hero-name-skip').addEventListener('click', () => {
        close();
        this.toast('The nameless walk the Plains too. You will be asked again.', 'info');
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') seal();
      });
      setTimeout(() => input.focus(), 50);
    },
  };
})();
