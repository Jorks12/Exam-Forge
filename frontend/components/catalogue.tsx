'use client';

import {
  Atom, BookOpen, Brain, Calculator, Code, Dna, FlaskConical, Globe2, Landmark, Languages, Monitor, Users,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useResource } from '@/hooks/use-resource';
import { scopes } from '@/lib/contracts';
import type { Grade, Subject } from '@/lib/contracts';
import { Empty, Failed, Loading } from './ui';

const icons = {
  atom: Atom, book: BookOpen, brain: Brain, calculator: Calculator, code: Code, dna: Dna,
  flask: FlaskConical, globe: Globe2, landmark: Landmark, languages: Languages, monitor: Monitor, users: Users,
};

export function CataloguePicker({ grade, subject, changeGrade, changeSubject }: {
  grade: string; subject: Subject | null;
  changeGrade: (grade: string) => void; changeSubject: (subject: Subject) => void;
}) {
  const grades = useResource<Grade[]>('/grades');
  const subjects = useResource<Subject[]>(grade ? '/subjects?grade=' + grade : null);
  const selection = useRef<HTMLHeadingElement>(null);
  const gradeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (subject) selection.current?.focus({ preventScroll: true });
  }, [subject]);
  return <>
    <section className="panel pad stack" aria-labelledby="pick-grade">
      <h2 id="pick-grade">Клас</h2>
      {grades.error ? <Failed error={grades.error} retry={grades.reload} /> : !grades.data ? <Loading /> :
        <div className="actions">{grades.data.map(item => <button className={'button' + (grade === String(item.number) ? ' primary' : '')}
          key={item.number} type="button" ref={grade === String(item.number) ? gradeButton : undefined}
          aria-pressed={grade === String(item.number)} onClick={() => {
            if (grade !== String(item.number)) changeGrade(String(item.number));
          }}>
          {item.name}
        </button>)}</div>}
    </section>
    {subject ? <section className="panel pad split selected-subject enter">
      <div className="section-head"><h2 ref={selection} tabIndex={-1}>{subject.name}</h2>
        <p>{scopes[subject.scope]} · Учебни въпроси за упражнение</p></div>
      <button className="button" type="button" onClick={() => { changeGrade(grade); gradeButton.current?.focus(); }}>Смени предмет</button>
    </section> : grade && <section className="stack enter" aria-labelledby="pick-subject">
      <h2 id="pick-subject">Предмет</h2>
      {subjects.error ? <Failed error={subjects.error} retry={subjects.reload} /> : !subjects.data ? <Loading /> :
        !subjects.data.length ? <Empty title="Няма предмети за този клас">Изберете друг клас.</Empty> :
        <div className="subject-grid enter">{subjects.data.map(item => {
          const Icon = icons[item.icon as keyof typeof icons] ?? BookOpen;
          return <button key={item.id} className="panel pad subject-card" type="button" onClick={() => changeSubject(item)}>
            <span className="subject-icon"><Icon size={20} aria-hidden="true" /></span>
            <strong>{item.name}</strong><small>{scopes[item.scope]}</small>
            <span className="subject-counts"><span>{item.grade}. клас</span>
              <span>{item.active_count} въпроса</span><span>{item.topic_count} теми</span></span>
          </button>;
        })}</div>}
    </section>}
  </>;
}
