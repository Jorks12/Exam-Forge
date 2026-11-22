'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useLiveResource } from '@/hooks/use-resource';
import { api, ApiError, message, write } from '@/lib/api';
import type { Option } from '@/lib/contracts';
import { MathText } from './math-text';
import { Empty, Failed, Heading, Loading } from './ui';

interface ReviewCard {
  id: string;
  revision: number;
  content: string;
  topic_name: string;
  options: Option[];
  correct_option_id: string;
  explanation: string | null;
}

const ratings = { again: 'Не си спомних', hard: 'Трудно', good: 'Добре', easy: 'Лесно' } as const;
const dateTime = new Intl.DateTimeFormat('bg-BG', { dateStyle: 'medium', timeStyle: 'short' });

export function Review() {
  const queue = useLiveResource<{ card: ReviewCard | null; next_due_at: string | null }>('/review/next');
  const card = queue.data?.card;
  const next = queue.data?.next_due_at;

  return (
    <>
      <Heading
        kicker="Учебна практика"
        title="Преговор"
        description="Упражнявайте грешните и пропуснатите въпроси от приключени изпити. След всеки отговор оценете колко лесно сте си го спомнили."
      />
      {queue.error ? (
        <Failed error={queue.error} retry={queue.reload} />
      ) : !queue.data ? (
        <Loading />
      ) : card ? (
        <Card key={card.id + ':' + card.revision} card={card} refresh={queue.reload} />
      ) : (
        <Empty
          title="Няма въпроси за преговор в момента"
          action={
            <div className="actions">
              {next && (
                <button type="button" className="button" onClick={queue.reload}>
                  Провери отново
                </button>
              )}
              <Link href="/history" className="button">
                Към историята
              </Link>
            </div>
          }
        >
          {next ? (
            <>
              Следващият въпрос е насрочен за <time dateTime={next}>{dateTime.format(new Date(next))}</time>.
            </>
          ) : (
            'Тук ще се появят грешките и пропуските от последния ви опит с всеки въпрос.'
          )}
        </Empty>
      )}
    </>
  );
}

function Card({ card, refresh }: { card: ReviewCard; refresh: () => void }) {
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const question = useRef<HTMLHeadingElement>(null);
  const ratingHeading = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    (revealed ? ratingHeading.current : question.current)?.focus({ preventScroll: true });
  }, [revealed]);

  async function rate(rating: string) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await api('/review/' + card.id, write('POST', { rating, revision: card.revision }));
      refresh();
    } catch (failure) {
      if (failure instanceof ApiError && ['REVIEW_UPDATED', 'NOT_FOUND'].includes(failure.code)) refresh();
      else {
        setError(message(failure));
        setBusy(false);
      }
    }
  }

  return (
    <section className="panel pad stack review-card" aria-labelledby="review-question">
      <div className="actions">
        <span className="pill blue">{card.topic_name}</span>
      </div>
      <h2 id="review-question" className="question-text" tabIndex={-1} ref={question}>
        <MathText text={card.content} />
      </h2>
      <ul className="question-options">
        {card.options.map(option => {
          const correct = revealed && option.id === card.correct_option_id;
          return (
            <li key={option.id} className={correct ? 'correct' : undefined}>
              <strong>{option.label}.</strong> <MathText text={option.content} />
              {correct && ' · верен отговор'}
            </li>
          );
        })}
      </ul>
      {revealed ? (
        <>
          {card.explanation && (
            <p className="question-text" style={{ marginTop: '0.5rem', color: 'var(--muted)' }}>
              <MathText text={card.explanation} />
            </p>
          )}
          <p tabIndex={-1} ref={ratingHeading} id="review-rating" style={{ fontWeight: 650, marginTop: '0.5rem' }}>
            Колко лесно си спомнихте верния отговор?
          </p>
          {error && <Failed error={error} />}
          <div className="actions" role="group" aria-labelledby="review-rating">
            {Object.entries(ratings).map(([rating, label]) => (
              <button
                key={rating}
                type="button"
                className={'button' + (rating === 'good' ? ' primary' : '')}
                disabled={busy}
                onClick={() => void rate(rating)}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="actions">
          <button type="button" className="button primary" onClick={() => setRevealed(true)}>
            Покажи верния отговор
          </button>
        </div>
      )}
    </section>
  );
}
