/** Rewards, levelling and the shop catalog. All values are our own. */

export const CATALOG = [
  { id: 'hat-wizard', name: 'Wizard Hat', slot: 'hat', price: 150 },
  { id: 'hat-crown', name: 'Paper Crown', slot: 'hat', price: 300 },
  { id: 'hat-beanie', name: 'Cozy Beanie', slot: 'hat', price: 80 },
  { id: 'outfit-space', name: 'Space Suit', slot: 'outfit', price: 500 },
  { id: 'outfit-pirate', name: 'Pirate Coat', slot: 'outfit', price: 400 },
  { id: 'outfit-hoodie', name: 'Comfy Hoodie', slot: 'outfit', price: 120 },
  { id: 'color-mint', name: 'Mint Color', slot: 'color', price: 60 },
  { id: 'color-sunset', name: 'Sunset Color', slot: 'color', price: 60 },
  { id: 'pet-dragon', name: 'Tiny Dragon', slot: 'pet', price: 1000 },
  { id: 'pet-owl', name: 'Study Owl', slot: 'pet', price: 650 },
  { id: 'emote-dance', name: 'Victory Dance', slot: 'emote', price: 200 },
];

export const findItem = (id) => CATALOG.find((item) => item.id === id) ?? null;

export const XP_PER_CORRECT = 10;

/** Level n needs 50 * n * (n - 1) total XP: 0, 100, 300, 600, 1000... */
export function levelForXp(xp) {
  let level = 1;
  while (50 * (level + 1) * level <= xp) level++;
  return level;
}

/**
 * Applies the result of one answered question to a player and returns the
 * updated player plus what was earned.
 */
export function applyAnswer(player, correct) {
  const streak = correct ? (player.streak ?? 0) + 1 : 0;
  const coins = correct ? 5 + Math.min(streak - 1, 5) : 0;
  const xp = correct ? XP_PER_CORRECT : 0;
  const totalXp = (player.xp ?? 0) + xp;
  const level = levelForXp(totalXp);
  const stats = player.stats ?? { answered: 0, correct: 0 };
  return {
    player: {
      ...player,
      streak,
      coins: (player.coins ?? 0) + coins,
      xp: totalXp,
      level,
      stats: { answered: stats.answered + 1, correct: stats.correct + (correct ? 1 : 0) },
    },
    earned: { coins, xp, leveledUp: level > (player.level ?? 1) },
  };
}
