import crypto from 'node:crypto';

/**
 * Original math question generator. Each skill returns { prompt, answer } and
 * the generator builds multiple-choice options around the answer.
 */

const int = (rng, min, max) => min + Math.floor(rng() * (max - min + 1));
const gcd = (a, b) => (b ? gcd(b, a % b) : a);

export const SKILLS = {
  counting: {
    grades: [0, 1],
    make(rng) {
      const n = int(rng, 1, 10);
      return { prompt: `How many stars? ${'★'.repeat(n)}`, answer: n };
    },
  },
  addition: {
    grades: [0, 1, 2, 3],
    make(rng, grade) {
      const max = [5, 10, 50, 500][Math.min(grade, 3)];
      const a = int(rng, 0, max);
      const b = int(rng, 0, max);
      return { prompt: `${a} + ${b} = ?`, answer: a + b };
    },
  },
  'missing-addend': {
    grades: [1, 2],
    make(rng, grade) {
      const total = int(rng, 5, grade < 2 ? 10 : 20);
      const a = int(rng, 0, total);
      return { prompt: `${a} + ? = ${total}`, answer: total - a };
    },
  },
  subtraction: {
    grades: [1, 2, 3],
    make(rng, grade) {
      const max = [10, 10, 100, 1000][Math.min(grade, 3)];
      const a = int(rng, 0, max);
      const b = int(rng, 0, a);
      return { prompt: `${a} − ${b} = ?`, answer: a - b };
    },
  },
  'place-value': {
    grades: [1, 2, 3],
    make(rng) {
      const n = int(rng, 100, 999);
      const places = [['ones', 1], ['tens', 10], ['hundreds', 100]];
      const [name, size] = places[int(rng, 0, 2)];
      return { prompt: `What digit is in the ${name} place of ${n}?`, answer: Math.floor(n / size) % 10 };
    },
  },
  multiplication: {
    grades: [3, 4, 5],
    make(rng, grade) {
      const a = int(rng, 1, grade < 4 ? 10 : 12);
      const b = int(rng, 1, grade < 5 ? 10 : 25);
      return { prompt: `${a} × ${b} = ?`, answer: a * b };
    },
  },
  division: {
    grades: [3, 4, 5],
    make(rng) {
      const b = int(rng, 1, 12);
      const q = int(rng, 0, 12);
      return { prompt: `${b * q} ÷ ${b} = ?`, answer: q };
    },
  },
  'fraction-simplify': {
    grades: [4, 5, 6],
    make(rng) {
      const d = int(rng, 2, 12);
      const n = int(rng, 1, d - 1);
      const k = int(rng, 2, 5);
      const g = gcd(n, d);
      return { prompt: `Simplify ${n * k}/${d * k}`, answer: `${n / g}/${d / g}` };
    },
  },
  'order-of-operations': {
    grades: [5, 6, 7, 8],
    make(rng) {
      const a = int(rng, 1, 10);
      const b = int(rng, 1, 10);
      const c = int(rng, 1, 10);
      return { prompt: `${a} + ${b} × ${c} = ?`, answer: a + b * c };
    },
  },
  'integer-addition': {
    grades: [6, 7, 8],
    make(rng) {
      const a = int(rng, -20, 20);
      const b = int(rng, -20, 20);
      return { prompt: `(${a}) + (${b}) = ?`, answer: a + b };
    },
  },
  'solve-for-x': {
    grades: [6, 7, 8],
    make(rng) {
      const x = int(rng, -10, 10);
      const a = int(rng, 2, 9);
      const b = int(rng, -20, 20);
      return { prompt: `${a}x ${b < 0 ? '−' : '+'} ${Math.abs(b)} = ${a * x + b}. x = ?`, answer: x };
    },
  },
};

export function skillsForGrade(grade) {
  return Object.keys(SKILLS).filter((s) => SKILLS[s].grades.includes(grade));
}

function makeChoices(rng, answer) {
  const choices = new Set([String(answer)]);
  if (typeof answer === 'number') {
    let spread = Math.max(3, Math.ceil(Math.abs(answer) * 0.2));
    while (choices.size < 4) {
      const offset = int(rng, -spread, spread);
      if (offset !== 0) choices.add(String(answer + offset));
      spread++;
    }
  } else {
    const [n, d] = answer.split('/').map(Number);
    let i = 1;
    while (choices.size < 4) {
      choices.add(`${n + i}/${d}`);
      if (choices.size < 4) choices.add(`${n}/${d + i}`);
      i++;
    }
  }
  const list = [...choices];
  for (let i = list.length - 1; i > 0; i--) {
    const j = int(rng, 0, i);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

export function generateQuestion({ grade = 2, skill = null, rng = Math.random } = {}) {
  const g = Math.max(0, Math.min(8, Number(grade) || 0));
  const pool = skill ? [skill] : skillsForGrade(g);
  const chosen = pool[int(rng, 0, pool.length - 1)];
  const def = SKILLS[chosen];
  if (!def) throw new Error(`Unknown skill: ${skill}`);
  const { prompt, answer } = def.make(rng, g);
  return {
    id: crypto.randomUUID(),
    skill: chosen,
    grade: g,
    prompt,
    choices: makeChoices(rng, answer),
    answer: String(answer),
  };
}

/** Accepts either { answer: <value> } or { choiceIndex: <n> }. */
export function checkAnswer(question, { answer, choiceIndex } = {}) {
  if (Number.isInteger(choiceIndex)) return question.choices[choiceIndex] === question.answer;
  if (answer === undefined || answer === null) return false;
  return String(answer).trim().replace('−', '-') === question.answer;
}

/** Strips the answer before a question is sent to the client. */
export function publicQuestion({ answer, ...rest }) {
  return rest;
}
