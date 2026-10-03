import test from 'node:test';
import assert from 'node:assert/strict';
import { SKILLS, generateQuestion, checkAnswer, publicQuestion, skillsForGrade } from '../src/game/questions.js';
import { applyAnswer, levelForXp } from '../src/game/economy.js';

test('every skill produces 4 unique choices including the answer', () => {
  for (const skill of Object.keys(SKILLS)) {
    for (const grade of SKILLS[skill].grades) {
      for (let i = 0; i < 200; i++) {
        const q = generateQuestion({ grade, skill });
        assert.equal(q.choices.length, 4, `${skill}: ${q.choices}`);
        assert.equal(new Set(q.choices).size, 4);
        assert.ok(q.choices.includes(q.answer), `${skill}: ${q.prompt}`);
      }
    }
  }
});

test('every grade K-8 has skills', () => {
  for (let g = 0; g <= 8; g++) assert.ok(skillsForGrade(g).length > 0, `grade ${g}`);
});

test('arithmetic answers are right', () => {
  const q = generateQuestion({ skill: 'multiplication', grade: 3 });
  const [a, b] = q.prompt.match(/\d+/g).map(Number);
  assert.equal(q.answer, String(a * b));
});

test('checkAnswer accepts value or choice index', () => {
  const q = { choices: ['3', '4', '5', '6'], answer: '5' };
  assert.equal(checkAnswer(q, { answer: 5 }), true);
  assert.equal(checkAnswer(q, { answer: ' 5 ' }), true);
  assert.equal(checkAnswer(q, { choiceIndex: 2 }), true);
  assert.equal(checkAnswer(q, { choiceIndex: 0 }), false);
  assert.equal(checkAnswer(q, {}), false);
  assert.equal(checkAnswer({ choices: [], answer: '-3' }, { answer: '−3' }), true);
});

test('publicQuestion hides the answer', () => {
  assert.equal('answer' in publicQuestion(generateQuestion()), false);
});

test('rewards, streaks and levels', () => {
  assert.equal(levelForXp(0), 1);
  assert.equal(levelForXp(99), 1);
  assert.equal(levelForXp(100), 2);
  assert.equal(levelForXp(300), 3);
  let p = { coins: 0, xp: 90, level: 1 };
  ({ player: p } = applyAnswer(p, true));
  assert.equal(p.coins, 5);
  assert.equal(p.level, 2);
  ({ player: p } = applyAnswer(p, true));
  assert.equal(p.coins, 11);
  ({ player: p } = applyAnswer(p, false));
  assert.equal(p.streak, 0);
  assert.deepEqual(p.stats, { answered: 3, correct: 2 });
});
