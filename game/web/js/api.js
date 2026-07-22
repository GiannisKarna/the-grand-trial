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

    /* Ask the Teacher: POST question context, get a Gemini deep explanation.
     * The endpoint always answers 200 with {ok, explanation?, error?}, so a
     * failed model call surfaces as res.ok === false, not a thrown Error.
     * Only a network/transport failure rejects. */
    explain(payload) {
      return request('/api/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    },
  };
})();
