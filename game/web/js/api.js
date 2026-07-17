/* api.js — thin fetch wrappers over the Grand Trial server API.
 * All functions return parsed JSON or throw an Error with a human-readable message.
 * Callers are responsible for surfacing failures as toasts. */
(() => {
  'use strict';
  window.Game = window.Game || {};

  async function request(path, options) {
    let res;
    try {
      res = await fetch(path, options);
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

  Game.API = {
    getState() {
      return request('/api/state');
    },

    putState(state) {
      return request('/api/state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state),
      });
    },

    getQuests() {
      return request('/api/content/quests');
    },

    getQuizbank(bankId) {
      return request(`/api/content/quizbanks/${encodeURIComponent(bankId)}`);
    },
  };
})();
