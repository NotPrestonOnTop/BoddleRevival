import { HttpError } from '../http.js';
import { hashPassword, verifyPassword, issueSession, requirePlayer, tokenFrom } from '../auth.js';
import { generateQuestion, checkAnswer, publicQuestion, SKILLS } from '../game/questions.js';
import { CATALOG, findItem, applyAnswer } from '../game/economy.js';

const PREFIX = '/api/v1';
const QUESTION_TTL_MS = 15 * 60 * 1000;
const USERNAME = /^[a-z0-9_.-]{3,24}$/i;

/** Fields of a player that are safe to send to clients. */
export function publicPlayer(p) {
  const { passwordHash, ...rest } = p;
  return rest;
}

/**
 * The server's own game API. These paths are ours, not Boddle's: map the real
 * client's endpoints onto this logic from handlers in src/routes/custom/.
 */
export function registerApiRoutes(router, { store, config }) {
  const players = store.collection('players');
  const pending = new Map(); // questionId -> { question, playerId, expiresAt }

  const add = (method, path, handler) => router.add(method, PREFIX + path, handler);

  add('GET', '/health', () => ({ ok: true, players: players.all().length }));

  add('POST', '/auth/register', ({ json }) => {
    const { username, password, displayName, grade = 2 } = json ?? {};
    if (!USERNAME.test(username ?? '')) throw new HttpError(400, 'Username must be 3-24 letters, numbers, . _ or -');
    if (typeof password !== 'string' || password.length < 6) throw new HttpError(400, 'Password must be at least 6 characters');
    const lower = username.toLowerCase();
    if (players.find((p) => p.username === lower)) throw new HttpError(409, 'Username taken');
    const player = players.insert({
      username: lower,
      displayName: String(displayName || username).slice(0, 32),
      passwordHash: hashPassword(password),
      grade: Math.max(0, Math.min(8, Number(grade) || 0)),
      coins: config.startingCoins,
      xp: 0,
      level: 1,
      streak: 0,
      stats: { answered: 0, correct: 0 },
      inventory: [],
      avatar: {},
      progress: {},
      createdAt: new Date().toISOString(),
    });
    return { status: 201, json: { token: issueSession(store, player.id), player: publicPlayer(player) } };
  });

  add('POST', '/auth/login', ({ json }) => {
    const { username, password } = json ?? {};
    const player = players.find((p) => p.username === String(username ?? '').toLowerCase());
    if (!player || !verifyPassword(String(password ?? ''), player.passwordHash)) {
      throw new HttpError(401, 'Wrong username or password');
    }
    return { token: issueSession(store, player.id), player: publicPlayer(player) };
  });

  add('POST', '/auth/logout', ({ req }) => {
    const token = tokenFrom(req);
    if (token) store.collection('sessions').remove(token);
    return { ok: true };
  });

  add('GET', '/me', ({ req }) => publicPlayer(requirePlayer(store, req)));

  add('PATCH', '/me', ({ req, json }) => {
    const player = requirePlayer(store, req);
    const patch = {};
    if (json?.displayName) patch.displayName = String(json.displayName).slice(0, 32);
    if (json?.grade !== undefined) patch.grade = Math.max(0, Math.min(8, Number(json.grade) || 0));
    return publicPlayer(players.update(player.id, patch));
  });

  add('PUT', '/me/avatar', ({ req, json }) => {
    const player = requirePlayer(store, req);
    const avatar = {};
    for (const [slot, itemId] of Object.entries(json ?? {})) {
      if (itemId === null) continue;
      const item = findItem(itemId);
      if (!item || item.slot !== slot) throw new HttpError(400, `Invalid item for slot ${slot}`);
      if (!player.inventory.includes(itemId)) throw new HttpError(403, `You do not own ${itemId}`);
      avatar[slot] = itemId;
    }
    return publicPlayer(players.update(player.id, { avatar }));
  });

  add('GET', '/skills', () =>
    Object.entries(SKILLS).map(([id, s]) => ({ id, grades: s.grades })));

  add('GET', '/questions/next', ({ req, query }) => {
    const player = requirePlayer(store, req);
    const skill = query.get('skill');
    if (skill && !SKILLS[skill]) throw new HttpError(400, `Unknown skill ${skill}`);
    const question = generateQuestion({ grade: query.get('grade') ?? player.grade, skill });
    const now = Date.now();
    for (const [id, entry] of pending) if (entry.expiresAt < now) pending.delete(id);
    pending.set(question.id, { question, playerId: player.id, expiresAt: now + QUESTION_TTL_MS });
    return publicQuestion(question);
  });

  add('POST', '/questions/:id/answer', ({ req, params, json }) => {
    const player = requirePlayer(store, req);
    const entry = pending.get(params.id);
    if (!entry || entry.playerId !== player.id) throw new HttpError(404, 'Question not found or expired');
    pending.delete(params.id);
    const correct = checkAnswer(entry.question, json ?? {});
    const { player: updated, earned } = applyAnswer(player, correct);
    players.update(player.id, updated);
    return { correct, correctAnswer: entry.question.answer, earned, player: publicPlayer(updated) };
  });

  add('GET', '/shop', () => CATALOG);

  add('POST', '/shop/buy', ({ req, json }) => {
    const player = requirePlayer(store, req);
    const item = findItem(json?.itemId);
    if (!item) throw new HttpError(404, 'No such item');
    if (player.inventory.includes(item.id)) throw new HttpError(409, 'Already owned');
    if (player.coins < item.price) throw new HttpError(402, 'Not enough coins');
    const updated = players.update(player.id, (p) => ({
      ...p,
      coins: p.coins - item.price,
      inventory: [...p.inventory, item.id],
    }));
    return { item, player: publicPlayer(updated) };
  });

  add('GET', '/progress', ({ req }) => requirePlayer(store, req).progress);

  add('POST', '/progress/:levelId', ({ req, params, json }) => {
    const player = requirePlayer(store, req);
    const stars = Math.max(0, Math.min(3, Number(json?.stars) || 0));
    const prev = player.progress[params.levelId];
    const record = {
      stars: Math.max(stars, prev?.stars ?? 0),
      completedAt: new Date().toISOString(),
      plays: (prev?.plays ?? 0) + 1,
    };
    players.update(player.id, (p) => ({ ...p, progress: { ...p.progress, [params.levelId]: record } }));
    return record;
  });

  add('GET', '/leaderboard', () =>
    players
      .all()
      .sort((a, b) => b.xp - a.xp)
      .slice(0, 50)
      .map((p) => ({ displayName: p.displayName, level: p.level, xp: p.xp })));
}
