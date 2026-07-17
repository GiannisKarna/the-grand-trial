/* sfx.js — Game.SFX: tiny WebAudio oscillator sound kit. No assets, no network.
 *
 * Contract (docs/superpowers/plans/2026-07-18-phase23-contracts.md):
 *   Game.SFX.play(name) for: click, correct, wrong, victory, defeat, levelup, cleanse.
 *   - Mute toggle lives in the HUD; the flag persists in localStorage (NOT save state).
 *   - Resilient to autoplay policy: the AudioContext is created/resumed on the
 *     first user gesture (Game.SFX.init() attaches the unlock listeners).
 *   - Minigames may call `window.Game.SFX && Game.SFX.play('correct')` — this
 *     module must therefore never throw, even before init or without audio.
 */
(() => {
  'use strict';
  window.Game = window.Game || {};

  const LS_KEY = 'grand-trial-muted';

  let ctx = null; // AudioContext, created on the first user gesture
  let inited = false;

  function readMuted() {
    try {
      return window.localStorage.getItem(LS_KEY) === '1';
    } catch (err) {
      return false; // storage blocked — default to sound on, just not persisted
    }
  }

  function writeMuted(muted) {
    try {
      window.localStorage.setItem(LS_KEY, muted ? '1' : '0');
    } catch (err) {
      /* storage blocked — the toggle still works for this session */
    }
  }

  function ensureContext() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
    } catch (err) {
      ctx = null;
    }
    return ctx;
  }

  /* One enveloped oscillator note. `at`/`dur` are seconds relative to now. */
  function note(freq, at, dur, type, peak, glideTo) {
    const t0 = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak || 0.1, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  const SOUNDS = {
    click() {
      note(720, 0, 0.06, 'square', 0.045);
    },
    correct() {
      note(660, 0, 0.12, 'triangle', 0.11);
      note(880, 0.09, 0.16, 'triangle', 0.11);
    },
    wrong() {
      note(220, 0, 0.28, 'sawtooth', 0.085, 110);
    },
    victory() {
      note(523.25, 0, 0.16, 'triangle', 0.12);
      note(659.25, 0.12, 0.16, 'triangle', 0.12);
      note(783.99, 0.24, 0.16, 'triangle', 0.12);
      note(1046.5, 0.36, 0.45, 'triangle', 0.14);
    },
    defeat() {
      note(196, 0, 0.3, 'sawtooth', 0.09);
      note(164.81, 0.26, 0.3, 'sawtooth', 0.09);
      note(130.81, 0.52, 0.55, 'sawtooth', 0.1);
    },
    levelup() {
      note(392, 0, 0.1, 'square', 0.07);
      note(523.25, 0.08, 0.1, 'square', 0.07);
      note(659.25, 0.16, 0.1, 'square', 0.07);
      note(783.99, 0.24, 0.32, 'triangle', 0.12);
      note(1567.98, 0.3, 0.38, 'sine', 0.06);
    },
    cleanse() {
      /* bell: fundamental + soft overtones, long decay */
      note(1046.5, 0, 0.55, 'sine', 0.1);
      note(1568, 0.05, 0.6, 'sine', 0.05);
      note(2093, 0.12, 0.5, 'sine', 0.03);
    },
  };

  Game.SFX = {
    muted: readMuted(),

    /* Call once at boot. Autoplay policy: browsers only allow audio started
     * inside a user gesture, so the context is created/resumed on the first
     * pointer or key event and the unlock listeners then remove themselves. */
    init() {
      if (inited) return;
      inited = true;
      const unlock = () => {
        const c = ensureContext();
        if (c && c.state === 'suspended') c.resume().catch(() => {});
        if (c) {
          document.removeEventListener('pointerdown', unlock, true);
          document.removeEventListener('keydown', unlock, true);
        }
      };
      document.addEventListener('pointerdown', unlock, true);
      document.addEventListener('keydown', unlock, true);
    },

    /* Flips the flag, persists it, returns the new muted state. */
    toggleMute() {
      this.muted = !this.muted;
      writeMuted(this.muted);
      return this.muted;
    },

    play(name) {
      if (this.muted || !ctx) return; // silent until the first gesture arrives
      const fn = SOUNDS[name];
      if (!fn) return;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      try {
        fn();
      } catch (err) {
        /* audio must never break the game */
      }
    },
  };
})();
