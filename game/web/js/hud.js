/* hud.js — HUD bar (name/level/XP/embers/daily-drill), toasts, level-up
 * celebration, and the first-run hero naming modal. Reads Game.State; never
 * mutates it except through Game.State methods. */
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
        toasts: document.getElementById('toasts'),
        modal: document.getElementById('overlay-modal'),
        celebrate: document.getElementById('celebrate-layer'),
      };

      this.els.drillBtn.addEventListener('click', () => {
        if (Game.ui.overlayOpen) return;
        Game.Region.startDrill();
      });
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
