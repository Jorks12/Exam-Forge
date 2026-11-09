import { sample, SelectionError, validateCandidates } from './randomSelection.ts';
import type { Candidate, RandomSource } from './randomSelection.ts';

const difficulties = [1, 2, 3] as const;

export function integerQuotas(count: number, weights: readonly number[]) {
  const total = weights.reduce((a, b) => a + b, 0);
  const exact = weights.map(weight => count * weight / total);
  const quotas = exact.map(Math.floor);
  const remaining = count - quotas.reduce((a, b) => a + b, 0);
  const byRemainder = exact.map((value, index) => ({ index, remainder: value - quotas[index] }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const { index } of byRemainder.slice(0, remaining)) quotas[index]++;
  return quotas;
}

interface Edge {
  to: number;
  capacity: number;
  cost: number;
  reverse: Edge;
}

function connect(graph: Edge[][], from: number, to: number, capacity: number, cost = 0) {
  const forward = { to, capacity, cost } as Edge;
  const reverse = { to: from, capacity: 0, cost: -cost, reverse: forward };
  forward.reverse = reverse;
  graph[from].push(forward);
  graph[to].push(reverse);
  return forward;
}

function allocate(graph: Edge[][], sink: number, count: number) {
  let assigned = 0;
  while (assigned < count) {
    const distance = graph.map(() => Infinity);
    const previous: (Edge | undefined)[] = graph.map(() => undefined);
    distance[0] = 0;

    // Reverse edges can reallocate a previously assigned slot and carry negative costs.
    for (let pass = 1; pass < graph.length; pass++) {
      let changed = false;
      for (let from = 0; from < graph.length; from++) {
        for (const edge of graph[from]) {
          if (edge.capacity > 0 && distance[from] + edge.cost < distance[edge.to]) {
            distance[edge.to] = distance[from] + edge.cost;
            previous[edge.to] = edge;
            changed = true;
          }
        }
      }
      if (!changed) break;
    }

    const path: Edge[] = [];
    for (let node = sink; node !== 0;) {
      const edge = previous[node];
      if (!edge) throw new SelectionError('Insufficient eligible questions');
      path.push(edge);
      node = edge.reverse.to;
    }
    const flow = Math.min(count - assigned, ...path.map(edge => edge.capacity));
    for (const edge of path) {
      edge.capacity -= flow;
      edge.reverse.capacity += flow;
    }
    assigned += flow;
  }
}

export function balancedSelection<T extends Candidate>(
  questions: readonly T[],
  count: number,
  topicIds: readonly string[],
  rng: RandomSource = Math.random,
  weights: readonly [number, number, number] = [30, 50, 20],
) {
  validateCandidates(questions, count);
  const topics = [...new Set(topicIds)].sort();
  const topicIndices = new Map(topics.map((topic, index) => [topic, index]));
  if ((!topics.length && count) || weights.some(weight => !Number.isFinite(weight) || weight < 0)
    || !Number.isFinite(weights.reduce((a, b) => a + b, 0)) || !weights.some(Boolean)) {
    throw new SelectionError('Invalid balancing configuration');
  }

  const topicTargets = integerQuotas(count, topics.map(() => 1));
  const difficultyTargets = integerQuotas(count, weights);
  const groups = topics.map(() => difficulties.map(() => [] as T[]));
  for (const question of questions) {
    const topic = topicIndices.get(question.topic_id);
    if (topic === undefined || !difficulties.includes(question.difficulty)) {
      throw new SelectionError('Candidate outside the configured groups');
    }
    groups[topic][question.difficulty - 1].push(question);
  }

  const difficultyStart = topics.length + 1;
  const sink = difficultyStart + difficulties.length;
  const graph: Edge[][] = Array.from({ length: sink + 1 }, () => []);
  const cells = groups.map((buckets, index) => {
    const node = index + 1;
    connect(graph, 0, node, topicTargets[index]);
    connect(graph, 0, node, count, count + 1);
    return buckets.map((bucket, level) => connect(graph, node, difficultyStart + level, bucket.length));
  });
  difficultyTargets.forEach((target, index) => {
    connect(graph, difficultyStart + index, sink, target);
    connect(graph, difficultyStart + index, sink, count, 1);
  });

  allocate(graph, sink, count);
  const chosen = groups.flatMap((buckets, topic) => buckets.flatMap((bucket, level) =>
    sample(bucket, cells[topic][level].reverse.capacity, rng),
  ));

  return {
    questions: sample(chosen, count, rng),
    topics: topics.map((id, index) => ({
      id,
      target: topicTargets[index],
      actual: cells[index].reduce((sum, edge) => sum + edge.reverse.capacity, 0),
    })),
    difficulties: difficulties.map((difficulty, index) => ({
      difficulty,
      target: difficultyTargets[index],
      actual: cells.reduce((sum, row) => sum + row[index].reverse.capacity, 0),
    })),
  };
}
