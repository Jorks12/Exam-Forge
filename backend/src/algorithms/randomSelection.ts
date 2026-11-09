export interface Candidate {
  id: string;
  topic_id: string;
  difficulty: 1 | 2 | 3;
}

export type RandomSource = () => number;

export class SelectionError extends Error {}

export function validateCandidates(questions: readonly Candidate[], count: number) {
  if (!Number.isInteger(count) || count < 0) throw new SelectionError('Invalid question count');
  if (count > questions.length) throw new SelectionError('Insufficient eligible questions');
  if (new Set(questions.map(question => question.id)).size !== questions.length) {
    throw new SelectionError('Duplicate candidate identifiers');
  }
}

export function sample<T>(values: readonly T[], count: number, rng: RandomSource) {
  const copy = [...values];
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(rng() * (copy.length - i));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

export function randomSelection<T extends Candidate>(questions: readonly T[], count: number, rng: RandomSource = Math.random) {
  validateCandidates(questions, count);
  return sample(questions, count, rng);
}
