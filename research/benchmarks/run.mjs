import { mkdir, writeFile } from 'node:fs/promises';
import { arch, cpus, platform, release } from 'node:os';
import { performance } from 'node:perf_hooks';
import { randomSelection } from '../../backend/src/algorithms/randomSelection.ts';
import { balancedSelection } from '../../backend/src/algorithms/balancedSelection.ts';
import { dataset, seeded, topics } from './datasets.mjs';

const repetitions = 1000;
const warmup = 200;
const count = 20;
const resultsDir = new URL('../results/', import.meta.url);
const chartsDir = new URL('../charts/', import.meta.url);
const algorithms = {
  random: (bank, rng) => randomSelection(bank, count, rng),
  balanced: (bank, rng) => balancedSelection(bank, count, topics, rng).questions,
};
const names = Object.keys(algorithms);
const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;

function statistics(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length / 2;
  const average = mean(sorted);
  return {
    mean: average,
    median: (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(middle)]) / 2,
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
    standard_deviation: Math.sqrt(mean(sorted.map(value => (value - average) ** 2))),
    maximum: sorted.at(-1),
  };
}

function verify(selection) {
  if (selection.length !== count || new Set(selection.map(question => question.id)).size !== count) {
    throw new Error('Selection violated exact count or uniqueness.');
  }
}

const rawPerformance = [];
for (const size of [120, 300, 1000]) {
  const bank = dataset(Array(4).fill(size / 4));
  for (let index = -warmup; index < repetitions; index++) {
    for (const name of index % 2 === 0 ? names : [...names].reverse()) {
      const rng = seeded(14001 + index);
      const start = performance.now();
      const selection = algorithms[name](bank, rng);
      const microseconds = (performance.now() - start) * 1000;
      verify(selection);
      if (index >= 0) rawPerformance.push({ size, name, run: index + 1, microseconds });
    }
  }
}

const rawDistribution = [];
const bank = dataset([50, 35, 25, 10]);
for (let run = 1; run <= repetitions; run++) {
  for (const name of names) {
    const selection = algorithms[name](bank, seeded(91201 + run));
    verify(selection);
    const counts = topics.map(topic => selection.filter(question => question.topic_id === topic).length);
    const deviation = counts.reduce((sum, actual) => sum + Math.abs(actual - 5), 0);
    rawDistribution.push({ name, run, counts, deviation });
  }
}
const timing = [120, 300, 1000].flatMap(size => names.map(algorithm => ({
  size, algorithm, ...statistics(rawPerformance.filter(row => row.size === size && row.name === algorithm).map(row => row.microseconds)),
})));
const distribution = names.map(algorithm => {
  const rows = rawDistribution.filter(row => row.name === algorithm);
  return {
    algorithm, ...statistics(rows.map(row => row.deviation)),
    means_by_topic: topics.map((_, i) => mean(rows.map(row => row.counts[i]))),
  };
});
const metadata = { node: process.version, platform: platform(), release: release(), architecture: arch(), cpu: cpus()[0]?.model,
  repetitions, warmup, count, time_unit: 'microseconds', distribution_target: [5, 5, 5, 5] };
const format = value => Number(value).toFixed(3);

function groupedChart(title, unit, groups, yMax, guide) {
  const colors = ['#2859ce', '#108371'];
  const left = 84, right = 710, top = 86, bottom = 355;
  const y = value => bottom - (value / yMax) * (bottom - top);
  const steps = Array.from({ length: 6 }, (_, i) => i * yMax / 5);
  const guides = steps.map(step => `<line x1="${left}" y1="${y(step)}" x2="${right}" y2="${y(step)}" stroke="#dfe5ef"/>
    <text x="${left - 10}" y="${y(step) + 4}" text-anchor="end">${Number(step.toFixed(1))}</text>`).join('');
  const groupWidth = (right - left) / groups.length;
  const bars = groups.map(({ label, values }, i) => {
    const center = left + groupWidth * (i + 0.5);
    return values.map((value, j) => {
      const x = center + (j ? 4 : -42);
      return `<rect x="${x}" y="${y(value)}" width="38" height="${bottom - y(value)}" fill="${colors[j]}"/>
        <text x="${x + 19}" y="${y(value) - 7}" text-anchor="middle">${Number(value.toFixed(2))}</text>`;
    }).join('') + `<text x="${center}" y="378" text-anchor="middle">${label}</text>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title" viewBox="0 0 760 440">
    <title id="title">${title}</title><rect width="760" height="440" fill="white"/>
    <g font-family="Segoe UI, Arial, sans-serif" fill="#172743" font-size="13">
      <text x="36" y="40" font-size="23" font-weight="700">${title}</text><text x="36" y="65">${unit}</text>
      ${guides}${bars}${guide ? `<line x1="${left}" x2="${right}" y1="${y(guide)}" y2="${y(guide)}" stroke="#a44a25" stroke-dasharray="5 4"/>` : ''}
      ${['Случаен подбор', 'Балансиран подбор'].map((label, i) => `<rect x="${175 + 223 * i}" y="406" width="12" height="12" fill="${colors[i]}"/>
      <text x="${194 + 223 * i}" y="417">${label}</text>`).join('')}
    </g></svg>\n`;
}

await Promise.all([mkdir(resultsDir, { recursive: true }), mkdir(chartsDir, { recursive: true })]);
const timingGroups = [120, 300, 1000].map(size => ({
  label: size + ' въпроса', values: timing.filter(row => row.size === size).map(row => row.median),
}));
const timingMax = Math.max(...timing.map(row => row.median));
const tickSize = 10 ** Math.floor(Math.log10(timingMax / 5));
const yMax = 5 * tickSize * Math.ceil(timingMax * 1.2 / (5 * tickSize));
await Promise.all([
  writeFile(new URL('performance.csv', resultsDir), 'bank_size,algorithm,run,microseconds\n' +
    rawPerformance.map(row => [row.size, row.name, row.run, format(row.microseconds)].join(',')).join('\n') + '\n'),
  writeFile(new URL('distribution.csv', resultsDir), 'algorithm,run,A,B,C,D,deviation\n' +
    rawDistribution.map(row => [row.name, row.run, ...row.counts, row.deviation].join(',')).join('\n') + '\n'),
  writeFile(new URL('summary.json', resultsDir), JSON.stringify({ metadata, timing, distribution }, null, 2) + '\n'),
  writeFile(new URL('summary.md', resultsDir), `# Измерени резултати
Среда: ${metadata.node}, ${metadata.platform} ${metadata.release} (${metadata.architecture}), ${metadata.cpu}.

| Банка | Подбор | Средно, µs | Медиана, µs | P95, µs | Ст. откл., µs |
|---:|---|---:|---:|---:|---:|
${timing.map(row => '| ' + [row.size, row.algorithm, ...[row.mean, row.median, row.p95, row.standard_deviation].map(format)].join(' | ') + ' |').join('\n')}

| Подбор | Средно D | Медиана D | Макс. D | Средно A | Средно B | Средно C | Средно D (тема) |
|---|---:|---:|---:|---:|---:|---:|---:|
${distribution.map(row => '| ' + [row.algorithm, ...[row.mean, row.median, row.maximum, ...row.means_by_topic].map(format)].join(' | ') + ' |').join('\n')}
`),
  writeFile(new URL('performance.svg', chartsDir), groupedChart('Време за подбор на 20 въпроса', 'Медиана в микросекунди · 1000 повторения', timingGroups, yMax)),
  writeFile(new URL('distribution.svg', chartsDir), groupedChart('Представяне на темите в изпита', 'Среден брой въпроси · пунктирана линия при цел 5', topics.map((topic, index) => ({
    label: 'Тема ' + topic, values: distribution.map(row => row.means_by_topic[index]),
  })), 10, 5)),
]);
console.log('Recorded', rawPerformance.length, 'timings and', rawDistribution.length, 'distribution samples.');
