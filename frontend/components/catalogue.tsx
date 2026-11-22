'use client';

import {
  Atom,
  BookOpen,
  Brain,
  Calculator,
  Code,
  Dna,
  FlaskConical,
  Globe2,
  GraduationCap,
  Landmark,
  Languages,
  Monitor,
  Users,
  CheckCircle2,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useResource } from '@/hooks/use-resource';
import { scopes } from '@/lib/contracts';
import type { Grade, Subject } from '@/lib/contracts';
import { Empty, Failed, Loading } from './ui';

const icons = {
  atom: Atom,
  book: BookOpen,
  brain: Brain,
  calculator: Calculator,
  code: Code,
  dna: Dna,
  flask: FlaskConical,
  globe: Globe2,
  landmark: Landmark,
  languages: Languages,
  monitor: Monitor,
  users: Users,
};

export function CataloguePicker({
  grade,
  subject,
  changeGrade,
  changeSubject,
}: {
  grade: string;
  subject: Subject | null;
  changeGrade: (grade: string) => void;
  changeSubject: (subject: Subject) => void;
}) {
  const grades = useResource<Grade[]>('/grades');
  const subjects = useResource<Subject[]>(grade ? '/subjects?grade=' + grade : null, true);
  const selection = useRef<HTMLHeadingElement>(null);
  const gradeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (subject) selection.current?.focus({ preventScroll: true });
  }, [subject]);

  return (
    <>
      <section className="panel pad stack grade-picker-panel" aria-labelledby="pick-grade">
        <div className="section-head">
          <h2 id="pick-grade">Клас</h2>
          <p className="muted">Изберете образователната степен за подготовка.</p>
        </div>
        {grades.error ? (
          <Failed error={grades.error} retry={grades.reload} />
        ) : !grades.data ? (
          <Loading />
        ) : (
          <div className="actions grade-actions">
            {grades.data.map(item => {
              const isSelected = grade === String(item.number);
              return (
                <button
                  className={'button grade-button' + (isSelected ? ' primary' : '')}
                  key={item.number}
                  type="button"
                  ref={isSelected ? gradeButton : undefined}
                  aria-pressed={isSelected}
                  onClick={() => {
                    if (grade !== String(item.number)) changeGrade(String(item.number));
                  }}
                >
                  {isSelected ? <CheckCircle2 size={17} aria-hidden="true" /> : <GraduationCap size={17} aria-hidden="true" />}
                  <span>{item.name}</span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {subject ? (
        <section className="panel pad split selected-subject enter">
          <div className="split" style={{ gap: '1rem', alignItems: 'center' }}>
            <span className="subject-icon selected-subject-icon">
              <CheckCircle2 size={22} className="text-primary" aria-hidden="true" />
            </span>
            <div className="section-head">
              <h2 ref={selection} tabIndex={-1}>
                {subject.name}
              </h2>
              <p>
                {scopes[subject.scope]} · Учебни въпроси за упражнение ({subject.active_count} въпроса в {subject.topic_count} теми)
              </p>
            </div>
          </div>
          <button
            className="button"
            type="button"
            onClick={() => {
              changeGrade(grade);
              gradeButton.current?.focus();
            }}
          >
            Смени предмет
          </button>
        </section>
      ) : (
        grade && (
          <section className="stack enter" aria-labelledby="pick-subject">
            <div className="section-head">
              <h2 id="pick-subject">Предмет</h2>
              <p className="muted">Изберете учебен предмет от каталога.</p>
            </div>
            {subjects.error ? (
              <Failed error={subjects.error} retry={subjects.reload} />
            ) : !subjects.data ? (
              <Loading />
            ) : !subjects.data.length ? (
              <Empty title="Няма предмети за този клас">Изберете друг клас.</Empty>
            ) : (
              <div className="subject-grid enter">
                {subjects.data.map(item => {
                  const Icon = icons[item.icon as keyof typeof icons] ?? BookOpen;
                  return (
                    <button
                      key={item.id}
                      className="panel pad subject-card"
                      type="button"
                      onClick={() => changeSubject(item)}
                    >
                      <span className="subject-icon">
                        <Icon size={20} aria-hidden="true" />
                      </span>
                      <strong>{item.name}</strong>
                      <small>{scopes[item.scope]}</small>
                      <span className="subject-counts">
                        <span className="pill">{item.grade}. клас</span>
                        <span className="pill">{item.active_count} въпроса</span>
                        <span className="pill">{item.topic_count} теми</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )
      )}
    </>
  );
}
