import crypto from 'node:crypto';
import { HttpError } from './http.js';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 32);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored).split('$');
  if (scheme !== 'scrypt') return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

export function issueSession(store, playerId) {
  const token = crypto.randomBytes(32).toString('hex');
  store.collection('sessions').insert({ id: token, playerId, expiresAt: Date.now() + SESSION_TTL_MS });
  return token;
}

export function tokenFrom(req) {
  const header = req.headers.authorization || '';
  if (/^bearer /i.test(header)) return header.slice(7).trim();
  return req.headers['x-session-token'] || null;
}

export function currentPlayer(store, req) {
  const token = tokenFrom(req);
  if (!token) return null;
  const session = store.collection('sessions').get(token);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    store.collection('sessions').remove(token);
    return null;
  }
  return store.collection('players').get(session.playerId);
}

export function requirePlayer(store, req) {
  const player = currentPlayer(store, req);
  if (!player) throw new HttpError(401, 'Not signed in');
  return player;
}
