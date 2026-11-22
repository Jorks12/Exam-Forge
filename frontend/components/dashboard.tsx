'use client';

import Link from 'next/link';
import { ArrowRight, BookOpen, ChartNoAxesColumnIncreasing, ClipboardPlus } from 'lucide-react';
import { useResource } from '@/hooks/use-resource';
import { percent } from '@/lib/contracts';
import type { AnalyticsSummary, Attempt, Page } from '@/lib/contracts';
import { AnswerSheet } from './brand';
import { AttemptRows } from './attempt-rows';
import { Metrics } from './metrics';
import { Empty, Failed, Loading } from './ui';

export function Dashboard() {
  const report = useResource<AnalyticsSummary>('/analytics/summary');
  const history = useResource<Page<Attempt>>('/results?limit=5');
  const data = report.data;
  const best = data?.subjects[0];
  const lowest = data && data.subjects.length > 1 ? data.subjects.at(-1) : undefined;
  const topics = data?.topics.filter(topic => topic.correct < topic.total)
    .sort((a, b) => a.percentage - b.percentage || b.total - a.total).slice(0, 3);
  const recent = data?.progress.slice(-5);

  return <>
    <section className="hero">
      <div className="hero-copy">
        <p className="eyebrow">Вашето работно пространство</p>
        <h1>Подготовка за изпит</h1>
        <p>Създайте пробен изпит, упражнете материала и проследете напредъка си по теми.</p>
        <div className="actions">
          <Link className="button primary" href="/exams/new"><ClipboardPlus size={17} aria-hidden="true" /> Нов изпит</Link>
          <Link className="button" href="/questions"><BookOpen size={17} aria-hidden="true" /> Банка с въпроси</Link>
        </div>
      </div>
      <AnswerSheet />
    </section>

    {report.error ? <Failed error={report.error} retry={report.reload} /> : !data ? <Loading /> :
      <Metrics stats={data.overview} />}

    <div className="dashboard-grid">
      <section className="panel pad stack dashboard-activity">
        <div className="split">
          <div className="section-head"><h2>Последни изпити</h2><p>Започнати и приключени опити.</p></div>
          <Link className="button" href="/history">Цялата история <ArrowRight size={15} aria-hidden="true" /></Link>
        </div>
        {history.error ? <Failed error={history.error} retry={history.reload} /> : !history.data ? <Loading /> :
          history.data.items.length === 0 ?
            <Empty title="Все още няма изпити">Първият ви изпит ще се появи тук.</Empty> :
            <AttemptRows items={history.data.items} />}
      </section>

      <div className="stack">
        <section className="panel pad stack">
          <div className="section-head">
            <h2>Напредък</h2><p>До пет последни оценени изпита.</p>
          </div>
          {data && (recent?.length ?
            <ul className="dashboard-trend">
              {recent.map(point => <li key={point.id}>
                <Link href={'/results/' + point.id} title={point.title}>{point.title}</Link>
                <progress aria-label={point.title} max={100} value={point.percentage} />
                <strong>{percent(point.percentage)}</strong>
              </li>)}
            </ul> : <p className="muted">Тук ще видите резултатите след първия оценен изпит.</p>)}
          <div><Link href="/analytics" className="button"><ChartNoAxesColumnIncreasing size={17} aria-hidden="true" /> Пълен анализ</Link></div>
        </section>

        {best && <section className="panel pad stack">
          <div className="section-head"><h2>Резултати по предмети</h2><p>Средни оценки по учебни предмети.</p></div>
          <dl className="item-list dashboard-subjects">
            <div className="item-row"><dt>Най-висок среден резултат</dt>
              <dd>{best.name} <span className="pill good">{percent(best.average)}</span></dd></div>
            {lowest && <div className="item-row"><dt>Най-нисък среден резултат</dt>
              <dd>{lowest.name} <span className="pill">{percent(lowest.average)}</span></dd></div>}
          </dl>
        </section>}
      </div>
    </div>

    {Boolean(data?.topics.length) && <section className="panel pad stack">
      <div className="split">
        <div className="section-head"><h2>Теми за преговор</h2><p>Темите с най-нисък дял верни отговори във вашите изпити.</p></div>
        <Link href="/review" className="button">Към преговора <ArrowRight size={15} aria-hidden="true" /></Link>
      </div>
      {topics?.length ? <ul className="item-list">{topics.map(topic => <li key={topic.topic_id} className="item-row">
        <span>{topic.name}</span><strong>{topic.correct} / {topic.total} верни · {percent(topic.percentage)}</strong>
      </li>)}</ul> : <p className="muted">Всички отговори по оценените теми са верни.</p>}
    </section>}
  </>;
}
