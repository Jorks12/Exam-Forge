import { describe, expect, it } from 'vitest';
import { balancedSelection, integerQuotas } from '../src/algorithms/balancedSelection.ts';
import { randomSelection } from '../src/algorithms/randomSelection.ts';
import { grade } from '../src/algorithms/grading.ts';
import type { Candidate } from '../src/algorithms/randomSelection.ts';

const levels = [1, 2, 3] as const;
const bank: Candidate[] = ['a', 'b', 'c', 'd'].flatMap(topic_id => Array.from({ length: 15 }, (_, i) => ({
  id: topic_id + i, topic_id, difficulty: levels[i % levels.length],
})));
const topics = ['a', 'b', 'c', 'd'];

function seeded(state: number) {
  return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

describe('selection', () => {
  it('returns reproducible uniform samples without replacement', () => {
    const first = randomSelection(bank, 20, seeded(42));
    expect(first).toEqual(randomSelection(bank, 20, seeded(42)));
    expect(new Set(first.map(question => question.id)).size).toBe(20);
    expect(bank[0].id).toBe('a0');
  });

  it('meets both quotas when feasible and randomizes reproducibly', () => {
    const selection = balancedSelection(bank, 20, topics, seeded(6));
    expect(selection).toEqual(balancedSelection(bank, 20, topics, seeded(6)));
    expect(selection.topics.map(row => row.actual)).toEqual([5, 5, 5, 5]);
    expect(selection.difficulties.map(row => row.actual)).toEqual([6, 10, 4]);
    expect(new Set(selection.questions.map(row => row.id)).size).toBe(20);
  });

  it('fills a missing topic and difficulty from remaining capacity', () => {
    const constrained = bank.filter(q => q.topic_id !== 'a' && q.difficulty !== 3);
    const selected = balancedSelection(constrained, 20, topics);
    expect(selected.topics[0]).toEqual({ id: 'a', target: 5, actual: 0 });
    expect(selected.topics.slice(1).every(topic => topic.actual >= 5)).toBe(true);
    expect(selected.difficulties[2].actual).toBe(0);
    expect(selected.questions).toHaveLength(20);
  });

  it('uses largest remainders with stable ties', () => {
    expect(integerQuotas(7, [1, 1, 1, 1])).toEqual([2, 2, 2, 1]);
    expect(integerQuotas(7, [30, 50, 20])).toEqual([2, 4, 1]);
  });

  it('reallocates prior cells to satisfy both feasible quotas', () => {
    const tiny: Candidate[] = [
      { id: 'a1', topic_id: 'a', difficulty: 1 }, { id: 'a2', topic_id: 'a', difficulty: 2 },
      { id: 'b1', topic_id: 'b', difficulty: 1 },
    ];
    const outcome = balancedSelection(tiny, 2, ['a', 'b'], seeded(5), [1, 1, 0]);
    expect(outcome.questions.map(q => q.id).sort()).toEqual(['a2', 'b1']);
  });

  it('supports zero and rejects invalid size, availability, and duplicate IDs', () => {
    expect(randomSelection([], 0)).toEqual([]);
    expect(balancedSelection([], 0, []).questions).toEqual([]);
    for (const count of [-1, 1.5, Infinity, 61]) {
      expect(() => randomSelection(bank, count)).toThrow();
      expect(() => balancedSelection(bank, count, topics)).toThrow();
    }
    expect(() => randomSelection([bank[0], bank[0]], 1)).toThrow();
  });
});

describe('grading', () => {
  it.each([
    { selected: ['A', 'A', 'A'], expected: [3, 0, 0, 100] },
    { selected: ['B', 'B', 'B'], expected: [0, 3, 0, 0] },
    { selected: [null, null, null], expected: [0, 0, 3, 0] },
    { selected: ['A', null, null], expected: [1, 0, 2, 33.33] },
    { selected: ['A', 'B', null], expected: [1, 1, 1, 33.33] },
  ])('classifies $selected', ({ selected, expected }) => {
    const outcome = grade(selected.map(selected_option_id => ({ selected_option_id, correct_option_id: 'A' })));
    expect([outcome.correct, outcome.incorrect, outcome.unanswered, outcome.percentage]).toEqual(expected);
  });
});
