// Files in this folder whose names start with "_" are ignored.
// Copy this to e.g. login.js and adapt it once you know what the real client sends
// (see `npm run analyze`). Paths here are made up for illustration.
import { verifyPassword, issueSession } from '../../auth.js';

export default {
  method: 'POST',
  path: '/example/student/login',
  // host: 'api.example.com',   // uncomment to only match one hostname
  handle({ json, store }) {
    const player = store.collection('players').find((p) => p.username === String(json?.username).toLowerCase());
    if (!player || !verifyPassword(String(json?.password ?? ''), player.passwordHash)) {
      return { status: 401, json: { success: false } };
    }
    // Reshape our player into whatever structure the client expects.
    return {
      success: true,
      token: issueSession(store, player.id),
      user: { id: player.id, name: player.displayName, coins: player.coins },
    };
  },
};
