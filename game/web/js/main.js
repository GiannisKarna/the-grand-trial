/* main.js — boot sequence and game loop. Loads state + quest catalog, wires up
 * the modules (world, HUD, region panel), prompts the first-run hero naming,
 * then runs the requestAnimationFrame loop. */
(() => {
  'use strict';
  window.Game = window.Game || {};

  let loopStarted = false;

  function startLoop() {
    if (loopStarted) return;
    loopStarted = true;
    let last = performance.now();
    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      Game.World.update(dt);
      Game.World.render(now / 1000);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function showFatal(message) {
    const modal = document.getElementById('overlay-modal');
    modal.innerHTML = '';
    const panel = document.createElement('div');
    panel.className = 'panel fatal-box';
    panel.innerHTML = [
      '<h2>The Realm Is Dark</h2>',
      `<div class="fatal-msg"></div>`,
      '<p class="flavor">Start the server with <strong>play.bat</strong> (or',
      ' <code>.venv\\Scripts\\python.exe game\\run.py</code>), then try again.</p>',
      '<button id="fatal-retry" class="btn btn-gold" type="button">Relight the Torches</button>',
    ].join('');
    panel.querySelector('.fatal-msg').textContent = message;
    modal.appendChild(panel);
    modal.classList.remove('hidden');
    Game.ui.overlayOpen = true;
    panel.querySelector('#fatal-retry').addEventListener('click', () => {
      modal.classList.add('hidden');
      modal.innerHTML = '';
      Game.ui.overlayOpen = false;
      boot();
    });
  }

  async function boot() {
    let state;
    let questsDoc;
    try {
      [state, questsDoc] = await Promise.all([Game.API.getState(), Game.API.getQuests()]);
    } catch (err) {
      showFatal(err.message);
      return;
    }

    Game.State.data = state;
    Game.State.quests = (questsDoc && questsDoc.quests) || [];

    const canvas = document.getElementById('world-canvas');
    if (!Game.World.canvas) Game.World.init(canvas);
    Game.HUD.init();
    Game.Region.init();
    Game.HUD.render();
    startLoop();

    if (Game.State.data.player.name === 'Apprentice') {
      Game.HUD.promptHeroName();
    } else {
      Game.HUD.toast(`Welcome back, ${Game.State.data.player.name}. The Trial continues.`, 'info');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
