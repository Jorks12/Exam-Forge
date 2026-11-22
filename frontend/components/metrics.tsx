'use client';

import { BarChart3, BookOpen, ClipboardCheck, Target, Trophy } from 'lucide-react';
import { percent } from '@/lib/contracts';
import type { Overview } from '@/lib/contracts';

export function Metrics({ stats }: { stats: Overview }) {
  const entries = [
    { label: 'Предадени изпити', value: stats.completed, Icon: ClipboardCheck, hint: `Оценени опити · ${stats.finalized}` },
    { label: 'Среден резултат', value: stats.finalized ? percent(stats.average) : '—', Icon: BarChart3, hint: 'Успеваемост по точки' },
    { label: 'Най-висок резултат', value: stats.finalized ? percent(stats.highest) : '—', Icon: Trophy, hint: 'Личен рекорд' },
    { label: 'Дадени отговори', value: stats.answered, Icon: BookOpen, hint: `Пропуснати въпроси · ${stats.unanswered}` },
    { label: 'Дял верни отговори', value: stats.answered ? percent(stats.correct_rate) : '—', Icon: Target, hint: 'Точност на отговорите' },
  ] as const;

  return (
    <section className="metrics" aria-label="Обобщени показатели">
      {entries.map(({ label, value, hint, Icon }) => (
        <article className="panel metric" key={label}>
          <div className="metric-header">
            <span className="metric-icon-wrap">
              <Icon className="metric-icon" size={18} aria-hidden="true" />
            </span>
            <h2>{label}</h2>
          </div>
          <strong>{value}</strong>
          <small>{hint}</small>
        </article>
      ))}
    </section>
  );
}
