'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { algorithms, attemptSubject, date, percent, statuses } from '@/lib/contracts';
import type { Attempt } from '@/lib/contracts';

export function AttemptRows({ items }: { items: Attempt[] }) {
  return (
    <ul className="item-list">
      {items.map(attempt => {
        const isInProgress = attempt.status === 'in_progress';
        const isExpired = attempt.status === 'expired';
        const scorePct = attempt.score !== null ? 100 * attempt.score / attempt.total_questions : null;

        return (
          <li key={attempt.id} className="item-row attempt-row">
            <div className="attempt-info">
              <h3>{attempt.title}</h3>
              <p className="muted">
                {[date(attempt.started_at), attemptSubject(attempt), algorithms[attempt.algorithm]]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
            <div className="actions attempt-actions">
              <span className={'pill ' + (isExpired ? 'bad' : isInProgress ? 'blue' : 'good')}>
                <span className="pill-dot" aria-hidden="true" />
                {statuses[attempt.status]}
              </span>
              {scorePct !== null && (
                <span className="attempt-score">
                  <strong>{percent(scorePct)}</strong>
                </span>
              )}
              <Link
                className={'button' + (isInProgress ? ' primary' : '')}
                href={(isInProgress ? '/exams/' : '/results/') + attempt.id}
                aria-label={(isInProgress ? 'Продължи ' : 'Преглед на ') + attempt.title}
              >
                <span>{isInProgress ? 'Продължи' : 'Преглед'}</span>
                <ArrowRight size={15} />
              </Link>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
