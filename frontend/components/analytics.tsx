'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useResource } from '@/hooks/use-resource';
import { date, percent } from '@/lib/contracts';
import type { Grade, Overview, ScorePoint, Subject, SubjectPerformance, TopicPerformance } from '@/lib/contracts';
import { Metrics } from './metrics';
import { Empty, Failed, Heading, Loading } from './ui';

const chartFallback = () => <div className="chart-skeleton" />;
const ScoreChart = dynamic(() => import('./analytics-charts').then(module => module.ScoreChart),
  { ssr: false, loading: chartFallback });
const AnswersChart = dynamic(() => import('./analytics-charts').then(module => module.AnswersChart),
  { ssr: false, loading: chartFallback });

export function Analytics() {
  const [grade, setGrade] = useState('');
  const [subjectId, setSubject] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const grades = useResource<Grade[]>('/grades');
  const subjects = useResource<Subject[]>('/subjects' + (grade ? '?grade=' + grade : ''));
  const distinct = [...new Map(subjects.data?.map(subject => [subject.id, subject])).values()];
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries({ grade, subjectId, from, to })) if (value) query.set(key, value);
  const invalidPeriod = Boolean(from && to && from > to);
  const endpoint = (name: string) => invalidPeriod ? null : '/analytics/' + name + '?' + query;
  const overview = useResource<Overview>(endpoint('overview'));
  const topics = useResource<TopicPerformance[]>(endpoint('topics'));
  const progress = useResource<ScorePoint[]>(endpoint('progress'));
  const performance = useResource<SubjectPerformance[]>(endpoint('subjects'));
  const stats = overview.data;
  const series = progress.data?.map((point, index) => ({ ...point, number: index + 1, displayDate: date(point.submitted_at) }));
  return <>
    <Heading kicker="Представяне" title="Анализи" description="Преглед на оценените изпити, включително тези с изтекло време." />
    <section className="panel pad filters" aria-label="Филтри за анализ">
      <label>Клас<select value={grade} onChange={event => { setGrade(event.target.value); setSubject(''); }}>
        <option value="">Всички класове</option>
        {grades.data?.map(item => <option value={item.number} key={item.number}>{item.name}</option>)}
      </select></label>
      <label>Предмет<select value={subjectId} onChange={event => setSubject(event.target.value)}>
        <option value="">Всички предмети</option>
        {distinct.map(subject => <option value={subject.id} key={subject.id}>{subject.name}</option>)}
      </select></label>
      <label>От дата<input type="date" value={from} max={to || undefined} onChange={event => setFrom(event.target.value)} /></label>
      <label>До дата<input type="date" value={to} min={from || undefined} onChange={event => setTo(event.target.value)} /></label>
    </section>
    {grades.error && <Failed error={grades.error} retry={grades.reload} />}
    {subjects.error && <Failed error={subjects.error} retry={subjects.reload} />}
    {invalidPeriod ? <Failed error="Началната дата трябва да е преди или да съвпада с крайната." /> :
      overview.error ? <Failed error={overview.error} retry={overview.reload} /> : !stats ? <Loading /> :
      stats.finalized === 0 ? <Empty title="Все още няма оценени изпити"
        action={<Link className="button primary" href="/exams/new">Създай изпит</Link>}>
        {query.size ? 'Няма резултати за избраните филтри.' : 'Графиките ще се появят, когато приключите първия си изпит.'}</Empty>
        : <>
          <Metrics stats={stats} />
          <section className="panel pad stack"><div className="section-head">
            <h2>Резултати във времето</h2><p>До 50 последни оценени изпита в хронологичен ред.</p></div>
            {progress.error ? <Failed error={progress.error} retry={progress.reload} /> : !series ? <Loading /> : <>
              <div className="chart enter" aria-hidden="true"><ScoreChart series={series} /></div>
              <details><summary>Таблица с резултатите</summary><div className="table-scroll"><table><thead><tr>
                <th scope="col">Дата</th><th scope="col">Изпит</th><th scope="col">Резултат</th></tr></thead><tbody>
                {series.map(point => <tr key={point.id}><td>{point.displayDate}</td>
                  <td><Link href={'/results/' + point.id}>{point.title}</Link></td><td>{percent(point.percentage)}</td></tr>)}
              </tbody></table></div></details>
            </>}
          </section>
          <section className="panel pad stack"><h2>Представяне по предмети</h2>
            {performance.error ? <Failed error={performance.error} retry={performance.reload} /> : !performance.data ? <Loading /> :
              !performance.data.length ? <p className="muted">Няма оценени изпити с посочен предмет.</p> :
              <ul className="item-list">{performance.data.map(subject => <li className="item-row" key={subject.id}>
                <span>{subject.name} <small>· {subject.total} изпита</small></span>
                <div className="score-bar"><progress max={100} value={subject.average} aria-label={subject.name} />
                  <strong>{percent(subject.average)}</strong></div>
              </li>)}</ul>}
          </section>
          <div className="dual">
            <section className="panel pad stack"><h2>Представяне по теми</h2>
              {topics.error ? <Failed error={topics.error} retry={topics.reload} /> : !topics.data ? <Loading /> :
                <ul className="item-list">{topics.data.map(topic => <li className="item-row" key={topic.topic_id}>
                  <span>{topic.name}<small> · {topic.correct} / {topic.total}</small></span>
                  <div className="score-bar"><progress max={100} value={topic.percentage} aria-label={topic.name} />
                    <strong>{percent(topic.percentage)}</strong></div>
                </li>)}</ul>}
            </section>
            <section className="panel pad stack"><h2>Разпределение на отговорите</h2>
              <div className="chart enter" aria-hidden="true"><AnswersChart stats={stats} /></div>
              <p className="muted">{stats.correct} верни · {stats.incorrect} грешни · {stats.unanswered} пропуснати</p>
            </section>
          </div>
        </>}
  </>;
}
