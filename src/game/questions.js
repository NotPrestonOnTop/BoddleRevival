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
  rounding: {
    grades: [3, 4],
    make(rng) {
      const n = int(rng, 101, 9999);
      const step = rng() < 0.5 ? 10 : 100;
      return { prompt: `Round ${n} to the nearest ${step}.`, answer: Math.round(n / step) * step, step };
    },
  },
  'area-perimeter': {
    grades: [3, 4, 5],
    make(rng) {
      const w = int(rng, 2, 12);
      const h = int(rng, 2, 12);
      return rng() < 0.5
        ? { prompt: `A rectangle is ${w} by ${h}. What is its area?`, answer: w * h }
        : { prompt: `A rectangle is ${w} by ${h}. What is its perimeter?`, answer: 2 * (w + h) };
    },
  },
  'decimal-addition': {
    grades: [4, 5, 6],
    make(rng) {
      const a = int(rng, 1, 99);
      const b = int(rng, 1, 99);
      return { prompt: `${(a / 10).toFixed(1)} + ${(b / 10).toFixed(1)} = ?`, answer: (a + b) / 10, step: 0.1 };
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

const decimalsOf = (step) => (String(step).split('.')[1] ?? '').length;

/** Formats a numeric answer with as many decimals as its step has. */
const formatNumber = (n, step = 1) => (decimalsOf(step) ? n.toFixed(decimalsOf(step)) : String(n));

function makeChoices(rng, answer, step = 1) {
  const choices = new Set([typeof answer === 'number' ? formatNumber(answer, step) : answer]);
  if (typeof answer === 'number') {
    // Work in whole units of `step` so decimals and rounded answers stay tidy.
    const scale = 10 ** decimalsOf(step);
    const base = Math.round(answer * scale);
    const unit = Math.round(step * scale);
    let spread = Math.max(3, Math.ceil(Math.abs(answer / step) * 0.2));
    while (choices.size < 4) {
      const offset = int(rng, -spread, spread);
      const value = (base + offset * unit) / scale;
      if (offset !== 0 && !(answer >= 0 && value < 0)) choices.add(formatNumber(value, step));
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
  const { prompt, answer, step = 1 } = def.make(rng, g);
  return {
    id: crypto.randomUUID(),
    skill: chosen,
    grade: g,
    prompt,
    choices: makeChoices(rng, answer, step),
    answer: typeof answer === 'number' ? formatNumber(answer, step) : answer,
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
