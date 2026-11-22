'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ClipboardList,
  Clock3,
  Layers,
  Play,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { api, ApiError, message, write } from '@/lib/api';
import { algorithms, attemptSubject, difficulties, duration, percent, statuses } from '@/lib/contracts';
import type { Attempt, CatalogueTopic, Exam, ExamResult, Page, Subject, Topic } from '@/lib/contracts';
import { useLiveResource, useResource } from '@/hooks/use-resource';
import { AttemptRows } from './attempt-rows';
import { CataloguePicker } from './catalogue';
import { MathText } from './math-text';
import { Confirm, Empty, Failed, formValues, Heading, Loading, Notice, Pagination, value } from './ui';

function invalidateExamSummaries(cache: QueryClient) {
  void cache.invalidateQueries({ predicate: ({ queryKey: [group] }) => group === 'results' || group === 'analytics' });
}

export function GenerateExam() {
  const [mode, setMode] = useState<'catalogue' | 'shared'>('catalogue');
  const [sharedOpened, setSharedOpened] = useState(false);
  const [grade, setGrade] = useState('');
  const [subject, setSubject] = useState<Subject | null>(null);
  const steps = mode === 'shared' ? ['Източник', 'Настройки'] : ['Източник', 'Клас', 'Предмет', 'Настройки'];
  const currentStep = mode === 'shared' ? 1 : subject ? 3 : grade ? 2 : 1;

  return (
    <>
      <Heading
        kicker="Симулатор"
        title="Нов изпит"
        description="Изберете учебния материал, броя въпроси и времето за работа."
      />
      <ol className="setup-steps" aria-label="Стъпки за създаване на изпит">
        {steps.map((step, index) => <li key={step} aria-current={index === currentStep ? 'step' : undefined}
          data-complete={index < currentStep}>
          <span className="step-index" aria-hidden="true">{index < currentStep ? <Check size={14} /> : index + 1}</span>
          <span>{step}</span>
        </li>)}
      </ol>
      <section className="panel pad stack source-panel" aria-labelledby="exam-source">
      <div className="section-head"><h2 id="exam-source">Източник на въпроси</h2>
        <p>Изберете материал от училищния каталог или от общата банка.</p></div>
      <div className="actions source-toggle" role="group" aria-labelledby="exam-source">
        <button
          type="button"
          className={'button' + (mode === 'catalogue' ? ' primary' : '')}
          aria-pressed={mode === 'catalogue'}
          onClick={() => setMode('catalogue')}
        >
          <BookOpen size={17} aria-hidden="true" />
          <span>Училищен каталог</span>
        </button>
        <button
          type="button"
          className={'button' + (mode === 'shared' ? ' primary' : '')}
          aria-pressed={mode === 'shared'}
          onClick={() => {
            setMode('shared');
            setSharedOpened(true);
          }}
        >
          <Layers size={17} aria-hidden="true" />
          <span>Обща банка</span>
        </button>
      </div>
      </section>

      {mode === 'catalogue' && (
        <CataloguePicker
          grade={grade}
          subject={subject}
          changeGrade={value => {
            setGrade(value);
            setSubject(null);
          }}
          changeSubject={setSubject}
        />
      )}
      {subject && (
        <div hidden={mode !== 'catalogue'}>
          <ExamConfiguration key={subject.subject_grade_id} subject={subject} />
        </div>
      )}
      {sharedOpened && (
        <div hidden={mode !== 'shared'}>
          <ExamConfiguration subject={null} />
        </div>
      )}
    </>
  );
}

function ExamConfiguration({ subject }: { subject: Subject | null }) {
  const cache = useQueryClient();
  const topics = useResource<(Topic | CatalogueTopic)[]>(
    subject ? '/subjects/' + subject.id + '/topics?grade=' + subject.grade : '/topics/shared', true
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const countKey = difficulty === '1' ? 'easy' : difficulty === '2' ? 'medium' : 'hard';
  const visibleTopics = topics.data ?? [];
  const allTopics = subject && selected.length === 0;
  const topicCount = (topic: Topic | CatalogueTopic) =>
    difficulty && 'easy' in topic ? topic[countKey] : topic.active_count;
  const available = visibleTopics
    .filter(topic => allTopics || selected.includes(topic.id))
    .reduce((sum, topic) => sum + topicCount(topic), 0);

  return (
    <>
      {topics.error ? (
        <Failed error={topics.error} retry={topics.reload} />
      ) : !topics.data ? (
        <Loading />
      ) : !topics.data.some(topic => topic.active_count > 0) ? (
        subject ? (
          <Empty title="Няма активни въпроси за този предмет">
            Можете да изберете друг предмет или тема от общата банка.
          </Empty>
        ) : (
          <Empty
            title="Нужни са активни въпроси"
            action={
              <Link className="button primary" href="/questions">
                Към банката с въпроси
              </Link>
            }
          >
            Изберете предмет от училищния каталог, докато в общата банка се появят активни въпроси.
          </Empty>
        )
      ) : (
        <div className="dual exam-configuration enter">
          <form
            className="panel pad form-stack exam-config-form"
            noValidate
            onSubmit={async event => {
              const data = formValues(event, setError);
              if (!data || busy) return;
              const title = value(data, 'title');
              const questionCount = Number(data.get('count'));
              const timeLimitMinutes = Number(data.get('time'));
              if (
                !title ||
                (!subject && !selected.length) ||
                selected.length > 30 ||
                questionCount < 1 ||
                questionCount > 100 ||
                questionCount > available ||
                timeLimitMinutes < 1 ||
                timeLimitMinutes > 180
              ) {
                if (questionCount > 100 || questionCount < 1) {
                  setError('Броят въпроси трябва да е между 1 и 100.');
                  return;
                }
                if (timeLimitMinutes > 180 || timeLimitMinutes < 1) {
                  setError('Времето за работа трябва да е между 1 и 180 минути.');
                  return;
                }
                setError('Въведете заглавие и брой в рамките на наличните въпроси. Можете да изберете до 30 теми.');
                return;
              }
              setBusy(true);
              setError('');
              try {
                const attempt = await api<Attempt>(
                  '/exams/generate',
                  write('POST', {
                    title,
                    topicIds: selected.length ? selected : undefined,
                    questionCount,
                    algorithm: value(data, 'algorithm'),
                    grade: subject?.grade,
                    subjectId: subject?.id,
                    shared: subject ? undefined : true,
                    difficulty: difficulty ? Number(difficulty) : undefined,
                    timeLimitMinutes,
                  })
                );
                void cache.invalidateQueries({ queryKey: ['results'] });
                router.push('/exams/' + attempt.id);
              } catch (failure) {
                setError(message(failure));
                setBusy(false);
              }
            }}
          >
            {error && <Failed error={error} />}

            <div className="section-head">
              <h2>Настройки на изпита</h2>
              <p className="muted">Персонализирайте темите, обема и условията за симулацията.</p>
            </div>

            <label>
              Заглавие
              <input
                name="title"
                maxLength={120}
                required
                defaultValue={subject ? `${subject.name} · ${subject.grade}. клас` : ''}
                placeholder="Напр. Програмиране — преговор"
              />
            </label>

            <fieldset>
              <legend>{subject ? 'Теми по избор' : 'Теми'}</legend>
              {subject && <p className="muted" style={{ marginBottom: '0.5rem' }}>При празен избор изпитът включва всички теми.</p>}
              <div className="choices topics-choice-list">
                {topics.data.map(topic => (
                  <label className="choice" key={topic.id}>
                    <input
                      type="checkbox"
                      checked={selected.includes(topic.id)}
                      disabled={!topic.active_count}
                      onChange={event =>
                        setSelected(current =>
                          event.target.checked ? [...current, topic.id] : current.filter(id => id !== topic.id)
                        )
                      }
                    />
                    <span className="choice-body">
                      <strong>{topic.name}</strong>
                      <small>{topicCount(topic)} налични въпроса</small>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="form-grid">
              <label>
                Брой въпроси <small>(до 100)</small>
                <input
                  type="number"
                  name="count"
                  min={1}
                  max={Math.max(1, Math.min(100, available))}
                  defaultValue={Math.min(20, Math.min(100, subject?.active_count ?? 20))}
                  required
                />
              </label>
              <label>
                Време в минути <small>(до 180 мин.)</small>
                <input type="number" name="time" min={1} max={180} defaultValue={30} required />
              </label>
            </div>

            {subject && (
              <label>
                Трудност
                <select value={difficulty} onChange={event => setDifficulty(event.target.value)}>
                  <option value="">Всички нива</option>
                  {Object.entries(difficulties).map(([level, label]) => (
                    <option key={level} value={level}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <fieldset>
              <legend>Алгоритъм за подбор</legend>
              <div className="choices">
                <label className="choice">
                  <input name="algorithm" type="radio" value="balanced" defaultChecked />
                  <span className="choice-body">
                    <strong>Балансиран подбор</strong>
                    <small>
                      {difficulty
                        ? 'Равномерно по теми на избраното ниво.'
                        : 'Равномерно по теми, с цел 30% лесни, 50% средни и 20% трудни.'}
                    </small>
                  </span>
                </label>
                <label className="choice">
                  <input name="algorithm" type="radio" value="random" />
                  <span className="choice-body">
                    <strong>Случаен подбор</strong>
                    <small>Всеки активен въпрос от избраните теми има еднакъв шанс.</small>
                  </span>
                </label>
              </div>
            </fieldset>

            <div className="actions">
              <button className="button primary" disabled={busy || available === 0}>
                <Play size={16} />
                <span>{busy ? 'Генериране…' : 'Започни изпита'}</span>
              </button>
            </div>
          </form>

          <aside className="panel pad stack sidebar-card exam-summary-card">
            <div className="summary-header">
              <span className="summary-icon-wrap">
                <ClipboardList size={22} className="text-primary" aria-hidden="true" />
              </span>
              <div className="section-head">
                <h2 aria-live="polite">{available} налични въпроса</h2>
                <p>
                  {allTopics ? 'Всички теми' : selected.length + ' избрани теми'}. Таймерът започва след генериране.
                </p>
              </div>
            </div>
            <div className="summary-details">
              <div className="item-row">
                <span>Обхват</span>
                <strong>{subject ? `${subject.grade}. клас · ${subject.name}` : 'Обща банка'}</strong>
              </div>
              <div className="item-row">
                <span>Избрани теми</span>
                <strong>{allTopics ? 'Всички (' + visibleTopics.length + ')' : selected.length}</strong>
              </div>
            </div>
            <p className="muted" style={{ fontSize: '0.85rem', lineHeight: 1.5 }}>
              Можете да продължите започнат изпит от „История“, докато има оставащо време.
            </p>
          </aside>
        </div>
      )}
    </>
  );
}

export function ExamPage() {
  const { id } = useParams<{ id: string }>();
  const cache = useQueryClient();
  const exam = useLiveResource<Exam>('/exams/' + id);
  const status = exam.data?.attempt.status;

  useEffect(() => {
    if (status && status !== 'in_progress') invalidateExamSummaries(cache);
  }, [cache, status, id]);

  if (exam.error) return <Failed error={exam.error} retry={exam.reload} />;
  if (!exam.data) return <Loading />;
  if (exam.data.attempt.status !== 'in_progress')
    return (
      <Empty
        title="Изпитът е приключил"
        action={
          <Link href={'/results/' + id} className="button primary">
            Виж резултата
          </Link>
        }
      >
        Резултатът е запазен в историята ви.
      </Empty>
    );

  return <Simulator key={id} exam={exam.data} />;
}

function ExamClock({ deadline, onExpire }: { deadline: number; onExpire: (expired: boolean) => void }) {
  const remaining = () => Math.max(0, Math.ceil((deadline - performance.now()) / 1000));
  const [seconds, setSeconds] = useState(remaining);
  const expired = seconds === 0;

  useEffect(() => {
    if (expired) {
      onExpire(true);
      return;
    }
    const timer = setInterval(() => setSeconds(Math.max(0, Math.ceil((deadline - performance.now()) / 1000))), 250);
    return () => clearInterval(timer);
  }, [deadline, onExpire, expired]);

  return (
    <span className={'exam-clock' + (seconds <= 60 ? ' urgent' : '')} aria-label={'Оставащо време ' + duration(seconds)}>
      <Clock3 size={19} aria-hidden="true" />
      <span>{duration(seconds)}</span>
    </span>
  );
}

type AnswerChange = { optionId: string | null; error?: string };

function Simulator({ exam }: { exam: Exam }) {
  const router = useRouter();
  const cache = useQueryClient();
  const { attempt } = exam;
  const [items, setItems] = useState(exam.items);
  const [position, setPosition] = useState(0);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [changes, setChanges] = useState(() => new Map<string, AnswerChange>());
  const latestChanges = useRef(changes);
  const saveQueue = useRef(Promise.resolve());
  const finalized = useRef(false);
  const [confirm, setConfirm] = useState(false);
  const [deadline] = useState(() => performance.now() + Date.parse(attempt.expires_at) - Date.parse(exam.server_now));
  const [expired, setExpired] = useState(() => deadline <= performance.now());
  const [autoTried, setAutoTried] = useState(false);
  const questionHeading = useRef<HTMLHeadingElement>(null);
  const endpoint = '/exams/' + attempt.id;
  const item = items[position];
  const failed = [...changes].filter(([, change]) => change.error !== undefined);
  const saving = changes.size > failed.length;

  function displayedAnswer(row: Exam['items'][number]) {
    const change = changes.get(row.id);
    return change ? change.optionId : row.selected_option_id;
  }
  const selected = displayedAnswer(item);
  const answered = items.filter(row => displayedAnswer(row) !== null).length;

  useEffect(() => {
    questionHeading.current?.focus({ preventScroll: true });
  }, [position]);

  useEffect(() => {
    if (!expired || submitting || saving || autoTried || finalized.current) return;
    const timer = setTimeout(async () => {
      setAutoTried(true);
      setConfirm(false);
      setSubmitting(true);
      setError('');
      try {
        const result = await api<ExamResult>(endpoint + '/submit', write('POST'));
        invalidateExamSummaries(cache);
        cache.setQueryData(['results', '/results/' + attempt.id], result);
        router.replace('/results/' + attempt.id);
      } catch (failure) {
        setError(message(failure));
        setSubmitting(false);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [expired, submitting, saving, autoTried, endpoint, router, attempt.id, cache]);

  function updateChange(itemId: string, change?: AnswerChange) {
    const next = new Map(latestChanges.current);
    if (change) next.set(itemId, change);
    else next.delete(itemId);
    latestChanges.current = next;
    setChanges(next);
  }

  function save(itemId: string, optionId: string | null) {
    if (submitting || deadline <= performance.now() || finalized.current) return;
    const change = { optionId };
    updateChange(itemId, change);

    saveQueue.current = saveQueue.current.then(async () => {
      if (latestChanges.current.get(itemId) !== change) return;
      try {
        if (finalized.current) return;
        await api(endpoint + '/answers', write('PATCH', { itemId, optionId }));
        setItems(current => current.map(row => (row.id === itemId ? { ...row, selected_option_id: optionId } : row)));
      } catch (failure) {
        if (failure instanceof ApiError && ['EXAM_EXPIRED', 'EXAM_FINALIZED'].includes(failure.code)) {
          finalized.current = true;
          setAutoTried(true);
          invalidateExamSummaries(cache);
          router.replace('/results/' + attempt.id);
        } else if (latestChanges.current.get(itemId) === change) {
          updateChange(itemId, { optionId, error: message(failure) });
        }
      } finally {
        if (latestChanges.current.get(itemId) === change) updateChange(itemId);
      }
    });
  }

  async function submit() {
    if (submitting || saving || (!expired && latestChanges.current.size) || finalized.current) return;
    if (expired) setAutoTried(true);
    setSubmitting(true);
    setError('');
    try {
      const result = await api<ExamResult>(endpoint + '/submit', write('POST'));
      invalidateExamSummaries(cache);
      cache.setQueryData(['results', '/results/' + attempt.id], result);
      router.replace('/results/' + attempt.id);
    } catch (failure) {
      setError(message(failure));
      setConfirm(false);
      setSubmitting(false);
    }
  }

  return (
    <>
      <Heading
        kicker={attemptSubject(attempt) || algorithms[attempt.algorithm]}
        title={attempt.title}
        description="Отговорите се запазват при всяка промяна."
        action={<ExamClock deadline={deadline} onExpire={setExpired} />}
      />
      {error && <Failed error={error} />}
      {failed.length > 0 && (
        <Failed
          error={
            (failed.length === 1 ? 'Има 1 непотвърден отговор. ' : `Има ${failed.length} непотвърдени отговора. `) +
            (expired
              ? 'Резултатът ще включи отговорите, които са достигнали до сървъра навреме.'
              : failed[0][1].error)
          }
          retry={
            expired
              ? undefined
              : () => {
                  for (const [id, change] of latestChanges.current) if (change.error) save(id, change.optionId);
                }
          }
        />
      )}
      {expired && (
        <Notice tone="info">
          Времето изтече. {submitting ? 'Изчисляваме резултата…' : 'Можете да отворите резултата.'}
        </Notice>
      )}

      <div className="exam-shell">
        <section className="panel pad stack exam-simulator-main" aria-labelledby="current-question">
          <div className="actions">
            <span className="pill blue">{item.topic_name}</span>
            <span className="pill">{difficulties[item.difficulty]}</span>
          </div>
          <div className="section-head">
            <p className="eyebrow">
              Въпрос {item.position} от {items.length}
            </p>
            <h2 key={item.id} tabIndex={-1} ref={questionHeading} id="current-question" className="question-text enter">
              <MathText text={item.content} />
            </h2>
          </div>

          <fieldset className="choices" disabled={submitting || expired}>
            <legend>Изберете един отговор</legend>
            {item.options.map(option => (
              <label className="choice simulator-choice" key={option.id}>
                <input
                  type="radio"
                  name={'option-' + item.id}
                  checked={selected === option.id}
                  onChange={() => save(item.id, option.id)}
                />
                <span className="option-letter">{option.label}.</span>
                <span className="option-text">
                  <MathText text={option.content} />
                </span>
              </label>
            ))}
          </fieldset>

          <div className="split simulator-status-bar">
            <span role="status" className="muted status-text">
              {changes.get(item.id)?.error
                ? 'Записът не е потвърден.'
                : changes.has(item.id)
                ? 'Запазване…'
                : selected
                ? 'Отговорът е запазен.'
                : 'Няма избран отговор.'}
            </span>
            {selected && (
              <button
                type="button"
                className="text-button"
                disabled={submitting || expired}
                onClick={() => save(item.id, null)}
              >
                Изчисти отговора
              </button>
            )}
          </div>

          <div className="split simulator-nav-buttons">
            <button
              type="button"
              className="button"
              disabled={position === 0 || submitting}
              onClick={() => setPosition(position - 1)}
            >
              <ArrowLeft size={16} />
              <span>Предишен</span>
            </button>
            <button
              type="button"
              className="button"
              disabled={position === items.length - 1 || submitting}
              onClick={() => setPosition(position + 1)}
            >
              <span>Следващ</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </section>

        <aside className="panel pad stack sidebar-card exam-navigator-sidebar">
          <div className="section-head">
            <h2>Лист с отговори</h2>
            <p>
              {answered} от {items.length} отговорени
            </p>
          </div>

          <div
            className="exam-progress"
            role="progressbar"
            aria-label="Отговорени въпроси"
            aria-valuemin={0}
            aria-valuemax={items.length}
            aria-valuenow={answered}
          >
            <span style={{ transform: `scaleX(${items.length ? answered / items.length : 0})` }} />
          </div>

          <nav className="positions" aria-label="Навигация по въпроси">
            {items.map((row, index) => (
              <button
                type="button"
                className={
                  'button position' +
                  (displayedAnswer(row) ? ' answered' : '') +
                  (position === index ? ' current' : '')
                }
                key={row.id}
                aria-current={position === index ? 'step' : undefined}
                disabled={submitting}
                aria-label={`Въпрос ${index + 1}, ${displayedAnswer(row) ? 'отговорен' : 'без отговор'}`}
                onClick={() => setPosition(index)}
              >
                {String(index + 1).padStart(2, '0')}
              </button>
            ))}
          </nav>

          <button
            className="button primary submit-exam-button"
            type="button"
            disabled={submitting || saving || (!expired && failed.length > 0)}
            onClick={() => (expired ? void submit() : setConfirm(true))}
          >
            <Check size={16} />
            <span>{submitting ? 'Предаване…' : saving ? 'Запазване…' : expired ? 'Виж резултата' : 'Предай изпита'}</span>
          </button>
        </aside>
      </div>

      {confirm && (
        <Confirm
          title="Предаване на изпита"
          description={`Отговорени са ${answered} от ${items.length} въпроса. След предаване отговорите се оценяват.`}
          action="Предай"
          pending={submitting}
          onCancel={() => setConfirm(false)}
          onConfirm={() => void submit()}
        />
      )}
    </>
  );
}

export function HistoryPage() {
  const [page, setPage] = useState(1);
  const history = useResource<Page<Attempt>>('/results?limit=12&page=' + page);

  return (
    <>
      <Heading
        kicker="Архив"
        title="История на изпитите"
        description="Продължете започнат изпит или прегледайте оценяването на приключените."
        action={
          <Link href="/exams/new" className="button primary">
            <span>Нов изпит</span>
            <ArrowRight size={16} />
          </Link>
        }
      />
      {history.error ? (
        <Failed error={history.error} retry={history.reload} />
      ) : !history.data ? (
        <Loading />
      ) : history.data.total === 0 ? (
        <Empty title="Все още няма изпити">След като създадете изпит, ще го намерите тук.</Empty>
      ) : (
        <>
          <section className="panel pad">
            <AttemptRows items={history.data.items} />
          </section>
          <Pagination page={page} total={history.data.total} limit={history.data.limit} change={setPage} />
        </>
      )}
    </>
  );
}

export function ResultPage() {
  const { id } = useParams<{ id: string }>();
  const outcome = useResource<ExamResult>('/results/' + id);

  if (outcome.error)
    return (
      <>
        <Failed error={outcome.error} retry={outcome.reload} />
        <div className="actions">
          <Link className="button" href={'/exams/' + id}>
            Към изпита
          </Link>
          <Link className="button" href="/history">
            История
          </Link>
        </div>
      </>
    );

  if (!outcome.data) return <Loading />;
  const { attempt, summary, topics, items } = outcome.data;

  return (
    <>
      <Heading
        kicker={statuses[attempt.status]}
        title={attempt.title}
        description={[attemptSubject(attempt), algorithms[attempt.algorithm]].filter(Boolean).join(' · ')}
        action={
          <div className="actions">
            <Link className="button" href="/history">
              <ArrowLeft size={16} />
              <span>История</span>
            </Link>
            {(summary.incorrect > 0 || summary.unanswered > 0) && (
              <Link className="button primary" href="/review">
                <span>Към преговора</span>
              </Link>
            )}
          </div>
        }
      />

      <section className="panel pad stack result-hero-panel" aria-label="Общ резултат">
        <div className="split">
          <div>
            <p className="eyebrow">Краен резултат</p>
            <strong className="score">{percent(summary.percentage)}</strong>
          </div>
          <p className="pill blue">
            <Clock3 size={16} /> {duration(summary.duration_seconds)} мин.
          </p>
        </div>
        <progress aria-label="Дял верни отговори от всички въпроси" max={100} value={summary.percentage} />
        <div className="metrics result-metrics">
          <div className="metric result-correct">
            <strong>{summary.correct}</strong>
            <small>Верни</small>
          </div>
          <div className="metric result-incorrect">
            <strong>{summary.incorrect}</strong>
            <small>Грешни</small>
          </div>
          <div className="metric">
            <strong>{summary.unanswered}</strong>
            <small>Без отговор</small>
          </div>
          <div className="metric">
            <strong>{attempt.total_questions}</strong>
            <small>Общо</small>
          </div>
        </div>
      </section>

      <div className="dual">
        <section className="panel pad stack">
          <div className="section-head">
            <h2>Представяне по теми</h2>
            <p className="muted">Успеваемост по всяка включена тема в изпита.</p>
          </div>
          <ul className="item-list">
            {topics.map(topic => (
              <li className="item-row" key={topic.id}>
                <span>{topic.name}</span>
                <strong className="pill">
                  {topic.correct} / {topic.total}
                </strong>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel pad stack">
          <div className="section-head">
            <h2>Подбор на въпросите</h2>
            <p className="muted">
              {attempt.algorithm === 'balanced'
                ? 'Действителен брой спрямо целта.'
                : 'Действителен брой по теми и трудност.'}
            </p>
          </div>
          <ul className="item-list">
            {[
              ...attempt.allocation.topics,
              ...attempt.allocation.difficulties.map(row => ({
                id: String(row.difficulty),
                name: difficulties[row.difficulty],
                actual: row.actual,
                target: row.target,
              })),
            ].map(row => (
              <li className="item-row" key={row.id}>
                <span>{row.name}</span>
                <strong className="pill">
                  {row.actual}
                  {row.target !== null ? ' / ' + row.target : ''}
                </strong>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="section-head" style={{ marginTop: '0.5rem' }}>
        <h2>Преглед на отговорите</h2>
        <p className="muted">Подробен разбор на въпросите, верните ключове и обясненията към тях.</p>
      </div>

      {items.map(item => (
        <article key={item.id} className="panel pad stack review">
          <div className="actions">
            <span className="eyebrow">Въпрос {item.position}</span>
            <span className={'pill ' + (item.is_correct ? 'good' : item.selected_option_id ? 'bad' : '')}>
              <span className="pill-dot" aria-hidden="true" />
              {item.is_correct ? 'Верен' : item.selected_option_id ? 'Грешен' : 'Без отговор'}
            </span>
          </div>
          <h3 className="question-text">
            <MathText text={item.content} />
          </h3>
          <details>
            <summary>Виж отговорите</summary>
            <ul className="question-options">
              {item.options.map(option => {
                const correct = option.id === item.correct_option_id;
                const selected = option.id === item.selected_option_id;
                return (
                  <li key={option.id} className={correct ? 'correct' : selected ? 'incorrect' : ''}>
                    <strong>{option.label}.</strong> <MathText text={option.content} />
                    {correct && ' · верен отговор'}
                    {selected && ' · вашият отговор'}
                  </li>
                );
              })}
            </ul>
            {item.explanation && (
              <p className="question-text" style={{ marginTop: '0.65rem' }}>
                <MathText text={item.explanation} />
              </p>
            )}
          </details>
        </article>
      ))}
    </>
  );
}
