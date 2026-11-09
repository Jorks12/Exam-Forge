'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useResource } from '@/hooks/use-resource';
import { percent } from '@/lib/contracts';
import type { Attempt, Overview, Page, SubjectPerformance } from '@/lib/contracts';
import { AnswerSheet } from './brand';
import { AttemptRows } from './attempt-rows';
import { Metrics } from './metrics';
import { Empty, Failed, Loading } from './ui';

export function Dashboard() {
  const overview = useResource<Overview>('/analytics/overview');
  const subjects = useResource<SubjectPerformance[]>('/analytics/subjects');
  const history = useResource<Page<Attempt>>('/results?limit=5');
  const best = subjects.data?.[0];
  const lowest = subjects.data && subjects.data.length > 1 ? subjects.data.at(-1) : undefined;
  return <>
    <section className="hero">
      <div className="hero-copy"><p className="eyebrow">Вашето работно пространство</p>
        <h1>Подготовка за изпит</h1>
        <p>Създайте изпит по клас и предмет или от личната си банка. Проследете напредъка си по теми.</p>
        <div className="actions"><Link className="button white" href="/exams/new">Нов изпит <ArrowRight size={16} /></Link>
          <Link className="button white" href="/questions">Банка с въпроси</Link></div>
      </div><AnswerSheet />
    </section>
    {overview.error ? <Failed error={overview.error} retry={overview.reload} /> : !overview.data ? <Loading /> : <Metrics stats={overview.data} />}
    {subjects.error ? <Failed error={subjects.error} retry={subjects.reload} /> : best && <section className="panel pad stack">
      <h2>Резултати по предмети</h2>
      <dl className="item-list"><div className="item-row"><dt>Най-висок среден резултат</dt>
        <dd>{best.name} · {percent(best.average)}</dd></div>
        {lowest && <div className="item-row"><dt>Най-нисък среден резултат</dt>
          <dd>{lowest.name} · {percent(lowest.average)}</dd></div>}
      </dl>
    </section>}
    <section className="stack">
      <div className="split"><div className="section-head"><h2>Последни изпити</h2><p>Започнати и приключени опити.</p></div>
        <Link className="button" href="/history">Цялата история <ArrowRight size={16} /></Link></div>
      {history.error ? <Failed error={history.error} retry={history.reload} /> : !history.data ? <Loading /> :
        history.data.items.length === 0 ? <Empty title="Все още няма изпити">Първият ви изпит ще се появи тук.</Empty>
          : <div className="panel pad"><AttemptRows items={history.data.items} /></div>}
    </section>
  </>;
}
