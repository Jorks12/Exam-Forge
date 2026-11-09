'use client';

import { BarChart3, BookOpen, ClipboardCheck, Target, Trophy } from 'lucide-react';
import { percent } from '@/lib/contracts';
import type { Overview } from '@/lib/contracts';

export function Metrics({ stats }: { stats: Overview }) {
  const entries = [
    ['Предадени изпити', stats.completed, ClipboardCheck],
    ['Среден резултат', stats.finalized ? percent(stats.average) : '—', BarChart3],
    ['Най-висок резултат', stats.finalized ? percent(stats.highest) : '—', Trophy],
    ['Дадени отговори', stats.answered, BookOpen],
    ['Дял верни отговори', stats.answered ? percent(stats.correct_rate) : '—', Target],
  ] as const;
  return <section className="metrics" aria-label="Обобщени показатели">{entries.map(([label, value, Icon]) =>
    <article className="panel metric" key={label}><Icon className="metric-icon" size={19} aria-hidden="true" />
      <strong>{value}</strong><small>{label}</small></article>)}</section>;
}
