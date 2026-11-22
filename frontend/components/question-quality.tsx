'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useResource } from '@/hooks/use-resource';
import { percent } from '@/lib/contracts';
import type { Label, Page } from '@/lib/contracts';
import { MathText } from './math-text';
import { Empty, Failed, Heading, Loading, Pagination } from './ui';

interface QualityItem {
  id: string;
  catalogue: boolean;
  content: string;
  topic_name: string;
  attempts: number;
  correct: number;
  unanswered: number;
  comparable: number;
  discrimination: number | null;
  options: { label: Label; content: string; selected: number; correct: boolean }[];
}

const coefficient = new Intl.NumberFormat('bg-BG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function QuestionQuality() {
  const [page, setPage] = useState(1);
  const quality = useResource<Page<QualityItem> & { minimum_sample: number }>(
    '/analytics/questions?limit=12&page=' + page
  );
  const data = quality.data;

  return (
    <>
      <Heading
        kicker="Банка с въпроси"
        title="Качество на въпросите"
        description="Анализ на последно решаваната версия на всеки въпрос от вашите приключени изпити."
        action={
          <Link href="/questions" className="button">
            <ArrowLeft size={16} />
            <span>Към банката</span>
          </Link>
        }
      />
      {quality.error ? (
        <Failed error={quality.error} retry={quality.reload} />
      ) : !data ? (
        <Loading />
      ) : !data.total ? (
        <Empty
          title="Още няма данни за въпросите"
          action={
            <Link href="/exams/new" className="button primary">
              Нов изпит
            </Link>
          }
        >
          След първия оценен изпит тук ще видите колко често сте отговорили вярно, сгрешили или пропуснали въпрос.
        </Empty>
      ) : (
        <>
          <p className="muted" style={{ lineHeight: 1.6 }}>
            Коефициентът сравнява верния отговор с резултата по останалите въпроси в същия изпит. Изчислява се при поне{' '}
            {data.minimum_sample} сравними опита и разнообразни резултати.
          </p>
          <div className="stack" style={{ gap: '1rem' }}>
            {data.items.map(item => (
              <article key={item.catalogue + ':' + item.id} className="panel pad stack question-card">
                <div className="actions">
                  <span className="pill blue">{item.topic_name}</span>
                  <span className="pill">{item.catalogue ? 'Каталог' : 'Лична банка'}</span>
                  {item.discrimination !== null && item.discrimination < 0 && (
                    <span className="pill bad">За преглед</span>
                  )}
                </div>
                <h2 className="question-text">
                  <MathText text={item.content} />
                </h2>
                <div className="actions quality-stats-bar">
                  <span className="pill">
                    <strong>
                      {item.correct} / {item.attempts}
                    </strong>{' '}
                    верни ({percent((item.correct / item.attempts) * 100)})
                  </span>
                  <span className="pill">
                    <strong>{item.unanswered}</strong> пропуснати
                  </span>
                </div>
                <details>
                  <summary>Разпределение на отговорите</summary>
                  <ul className="question-options">
                    {item.options.map(option => (
                      <li key={option.label}>
                        <strong>{option.label}.</strong> <MathText text={option.content} />
                        {option.correct && ' · верен отговор'} · избран {option.selected} от {item.attempts} пъти
                      </li>
                    ))}
                  </ul>
                </details>
                <p className="muted" style={{ fontSize: '0.86rem', lineHeight: 1.5 }}>
                  {item.discrimination !== null ? (
                    <>
                      Коефициент {coefficient.format(item.discrimination)} ({item.comparable} сравними опита).
                      {item.discrimination < 0 &&
                        ' В тези опити верният отговор е свързан с по-нисък резултат по останалите въпроси.'}
                    </>
                  ) : item.comparable < data.minimum_sample ? (
                    <>
                      Сравними опити {item.comparable} от нужните {data.minimum_sample}.
                    </>
                  ) : (
                    <>Сравними опити {item.comparable}. Резултатите са твърде еднообразни за изчисляване на коефициент.</>
                  )}
                </p>
              </article>
            ))}
          </div>
          <Pagination page={page} limit={data.limit} total={data.total} change={setPage} />
        </>
      )}
    </>
  );
}
