'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { algorithms, attemptSubject, date, percent, statuses } from '@/lib/contracts';
import type { Attempt } from '@/lib/contracts';

export function AttemptRows({ items }: { items: Attempt[] }) {
  return <ul className="item-list">{items.map(attempt => <li key={attempt.id} className="item-row">
    <div><h3>{attempt.title}</h3><p className="muted">
      {[date(attempt.started_at), attemptSubject(attempt), algorithms[attempt.algorithm]].filter(Boolean).join(' · ')}
    </p></div>
    <div className="actions">
      <span className={'pill ' + (attempt.status === 'expired' ? 'bad' : 'blue')}>{statuses[attempt.status]}</span>
      {attempt.score !== null && <strong>{percent(100 * attempt.score / attempt.total_questions)}</strong>}
      <Link className="button" href={(attempt.status === 'in_progress' ? '/exams/' : '/results/') + attempt.id}
        aria-label={(attempt.status === 'in_progress' ? 'Продължи ' : 'Преглед на ') + attempt.title}>
        {attempt.status === 'in_progress' ? 'Продължи' : 'Преглед'} <ArrowRight size={15} />
      </Link>
    </div>
  </li>)}</ul>;
}
