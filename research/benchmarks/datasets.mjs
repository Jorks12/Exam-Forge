import { createHash } from 'node:crypto';

export function seeded(seed) {
  seed = createHash('sha256').update(String(seed)).digest().readUInt32LE();
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

export const topics = ['A', 'B', 'C', 'D'];

export function dataset(sizes) {
  return sizes.flatMap((size, topic) =>
    Array.from({ length: size }, (_, index) => ({
      id: topics[topic] + index,
      topic_id: topics[topic],
      difficulty: [1, 2, 3][index % 3],
    })),
  );
}
