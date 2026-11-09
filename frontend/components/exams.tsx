'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ClipboardList, Clock3, Play } from 'lucide-react';
import { api, ApiError, message, write } from '@/lib/api';
import { algorithms, attemptSubject, difficulties, duration, percent, statuses } from '@/lib/contracts';
import type { Attempt, CatalogueTopic, Exam, ExamResult, Page, Subject, Topic } from '@/lib/contracts';
import { useResource } from '@/hooks/use-resource';
import { AttemptRows } from './attempt-rows';
import { CataloguePicker } from './catalogue';
import { Confirm, Empty, Failed, formValues, Heading, Loading, Notice, Pagination, value } from './ui';

export function GenerateExam() {
  const [mode, setMode] = useState<'catalogue' | 'private'>('catalogue');
  const [personalOpened, setPersonalOpened] = useState(false);
  const [grade, setGrade] = useState('');
  const [subject, setSubject] = useState<Subject | null>(null);
  return <>
    <Heading kicker="Симулатор" title="Нов изпит" description="Изберете учебния материал, броя въпроси и времето за работа." />
    <div className="actions" aria-label="Източник на въпроси">
      <button type="button" className={'button' + (mode === 'catalogue' ? ' primary' : '')}
        aria-pressed={mode === 'catalogue'} onClick={() => setMode('catalogue')}>Училищен каталог</button>
      <button type="button" className={'button' + (mode === 'private' ? ' primary' : '')}
        aria-pressed={mode === 'private'} onClick={() => { setMode('private'); setPersonalOpened(true); }}>Лични теми</button>
    </div>
    {mode === 'catalogue' && <CataloguePicker grade={grade} subject={subject}
      changeGrade={value => { setGrade(value); setSubject(null); }} changeSubject={setSubject} />}
    {subject && <div hidden={mode !== 'catalogue'}><ExamConfiguration key={subject.subject_grade_id} subject={subject} /></div>}
    {personalOpened && <div hidden={mode !== 'private'}><ExamConfiguration subject={null} /></div>}
  </>;
}

function ExamConfiguration({ subject }: { subject: Subject | null }) {
  const topics = useResource<(Topic | CatalogueTopic)[]>(subject
    ? '/subjects/' + subject.id + '/topics?grade=' + subject.grade : '/topics');
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
  const available = visibleTopics.filter(topic => allTopics || selected.includes(topic.id))
    .reduce((sum, topic) => sum + topicCount(topic), 0);

  return <>
    {topics.error ? <Failed error={topics.error} retry={topics.reload} /> : !topics.data ? <Loading /> :
      !topics.data.some(topic => topic.active_count > 0) ? subject ?
        <Empty title="Няма активни въпроси за този предмет">Можете да изберете друг предмет или лична тема.</Empty> :
        <Empty title="Нужни са активни въпроси"
        action={<Link className="button primary" href="/questions">Към банката с въпроси</Link>}>
        Добавете поне един активен въпрос към тема, за да създадете изпит.</Empty> :
      <div className="dual enter">
        <form className="panel pad form-stack" noValidate onSubmit={async event => {
          const data = formValues(event, setError);
          if (!data || busy) return;
          const title = value(data, 'title');
          const questionCount = Number(data.get('count'));
          if (!title || (!subject && !selected.length) || selected.length > 30 || questionCount > available) {
            setError('Въведете заглавие и брой в рамките на наличните въпроси. Можете да изберете до 30 теми.');
            return;
          }
          setBusy(true); setError('');
          try {
            const attempt = await api<Attempt>('/exams/generate', write('POST', {
              title, topicIds: selected.length ? selected : undefined, questionCount, algorithm: value(data, 'algorithm'),
              grade: subject?.grade, subjectId: subject?.id, difficulty: difficulty ? Number(difficulty) : undefined,
              timeLimitMinutes: Number(data.get('time')),
            }));
            router.push('/exams/' + attempt.id);
          } catch (failure) { setError(message(failure)); setBusy(false); }
        }}>
          {error && <Failed error={error} />}
          <label>Заглавие<input name="title" maxLength={120} required defaultValue={subject ? `${subject.name} · ${subject.grade}. клас` : ''}
            placeholder="Напр. Програмиране — преговор" /></label>
          <fieldset><legend>{subject ? 'Теми по избор' : 'Теми'}</legend>
            {subject && <p className="muted">При празен избор изпитът включва всички теми.</p>}
            <div className="choices">{topics.data.map(topic => <label className="choice" key={topic.id}>
            <input type="checkbox" checked={selected.includes(topic.id)} disabled={!topic.active_count} onChange={event =>
              setSelected(current => event.target.checked ? [...current, topic.id] : current.filter(id => id !== topic.id))} />
            <span><strong>{topic.name}</strong><small>{topicCount(topic)} налични въпроса</small></span>
          </label>)}</div></fieldset>
          <div className="form-grid">
            <label>Брой въпроси<input type="number" name="count" min={1} max={Math.max(1, Math.min(100, available))}
              defaultValue={Math.min(20, subject?.active_count ?? 20)} required /></label>
            <label>Време в минути<input type="number" name="time" min={1} max={180} defaultValue={30} required /></label>
          </div>
          {subject && <label>Трудност<select value={difficulty} onChange={event => setDifficulty(event.target.value)}>
            <option value="">Всички нива</option>
            {Object.entries(difficulties).map(([level, label]) => <option key={level} value={level}>{label}</option>)}
          </select></label>}
          <fieldset><legend>Алгоритъм за подбор</legend><div className="choices">
            <label className="choice"><input name="algorithm" type="radio" value="balanced" defaultChecked />
              <span><strong>Балансиран подбор</strong><small>{difficulty ? 'Равномерно по теми на избраното ниво.'
                : 'Равномерно по теми, с цел 30% лесни, 50% средни и 20% трудни.'}</small></span></label>
            <label className="choice"><input name="algorithm" type="radio" value="random" />
              <span><strong>Случаен подбор</strong><small>Всеки активен въпрос от избраните теми има еднакъв шанс.</small></span></label>
          </div></fieldset>
          <div className="actions"><button className="button primary" disabled={busy || available === 0}>
            <Play size={16} /> {busy ? 'Генериране…' : 'Започни изпита'}</button></div>
        </form>
        <aside className="panel pad stack sidebar-card"><ClipboardList size={26} /><div className="section-head">
          <h2 aria-live="polite">{available} налични въпроса</h2><p>{allTopics ? 'Всички теми' : selected.length + ' избрани теми'}. Таймерът започва след генериране.</p>
        </div><p className="muted">Можете да продължите започнат изпит от „История“, докато има оставащо време.</p></aside>
      </div>}
  </>;
}

export function ExamPage() {
  const { id } = useParams<{ id: string }>();
  const exam = useResource<Exam>('/exams/' + id);
  if (exam.error) return <Failed error={exam.error} retry={exam.reload} />;
  if (!exam.data) return <Loading />;
  if (exam.data.attempt.status !== 'in_progress') return <Empty title="Изпитът е приключил"
    action={<Link href={'/results/' + id} className="button primary">Виж резултата</Link>}>Резултатът е запазен в историята ви.</Empty>;
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

  return <span className={'exam-clock' + (seconds <= 60 ? ' urgent' : '')} aria-label={'Оставащо време ' + duration(seconds)}>
    <Clock3 size={22} />{duration(seconds)}</span>;
}

function Simulator({ exam }: { exam: Exam }) {
  const router = useRouter();
  const { attempt } = exam;
  const [items, setItems] = useState(exam.items);
  const [position, setPosition] = useState(0);
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState<{ itemId: string; message: string }>();
  const [submitting, setSubmitting] = useState(false);
  const [pendingAnswers, setPendingAnswers] = useState(() => new Map<string, { optionId: string | null }>());
  const pending = useRef(pendingAnswers);
  const saveQueue = useRef(Promise.resolve());
  const finalized = useRef(false);
  const [confirm, setConfirm] = useState(false);
  const [deadline] = useState(() => performance.now() + Date.parse(attempt.expires_at) - Date.parse(exam.server_now));
  const [expired, setExpired] = useState(() => deadline <= performance.now());
  const [autoTried, setAutoTried] = useState(false);
  const questionHeading = useRef<HTMLHeadingElement>(null);
  const endpoint = '/exams/' + attempt.id;
  const item = items[position];
  function displayedAnswer(row: Exam['items'][number]) {
    const change = pendingAnswers.get(row.id);
    return change ? change.optionId : row.selected_option_id;
  }
  const selected = displayedAnswer(item);
  const answered = items.filter(row => displayedAnswer(row) !== null).length;

  useEffect(() => { questionHeading.current?.focus({ preventScroll: true }); }, [position]);

  useEffect(() => {
    if (!expired || submitting || pendingAnswers.size || autoTried) return;
    // Defer the mutation so the effect can clean up before it fires during a remount.
    const timer = setTimeout(async () => {
      setAutoTried(true); setConfirm(false); setSubmitting(true); setError('');
      try {
        await api(endpoint + '/submit', write('POST'));
        router.replace('/results/' + attempt.id);
      } catch (failure) { setError(message(failure)); setSubmitting(false); }
    }, 0);
    return () => clearTimeout(timer);
  }, [expired, submitting, pendingAnswers.size, autoTried, endpoint, router, attempt.id]);

  function updatePending(itemId: string, change?: { optionId: string | null }) {
    const next = new Map(pending.current);
    if (change) next.set(itemId, change);
    else next.delete(itemId);
    pending.current = next;
    setPendingAnswers(next);
  }

  function save(optionId: string | null) {
    if (submitting || expired || finalized.current) return;
    const itemId = item.id;
    const change = { optionId };
    updatePending(itemId, change);
    setSaveError(current => current?.itemId === itemId ? undefined : current);

    // Keep writes ordered and skip superseded choices that have yet to be sent.
    saveQueue.current = saveQueue.current.then(async () => {
      if (pending.current.get(itemId) !== change) return;
      try {
        if (finalized.current) return;
        await api(endpoint + '/answers', write('PATCH', { itemId, optionId }));
        setItems(current => current.map(row => row.id === itemId ? { ...row, selected_option_id: optionId } : row));
      } catch (failure) {
        if (failure instanceof ApiError && ['EXAM_EXPIRED', 'EXAM_FINALIZED'].includes(failure.code)) {
          finalized.current = true;
          setAutoTried(true);
          router.replace('/results/' + attempt.id);
        } else if (pending.current.get(itemId) === change) {
          setSaveError({ itemId, message: `Записът на въпрос ${item.position} не е потвърден. ${message(failure)}` });
        }
      } finally {
        if (pending.current.get(itemId) === change) updatePending(itemId);
      }
    });
  }

  async function submit() {
    if (submitting || pending.current.size || finalized.current) return;
    setSubmitting(true); setError('');
    try {
      await api(endpoint + '/submit', write('POST'));
      router.replace('/results/' + attempt.id);
    } catch (failure) { setError(message(failure)); setConfirm(false); setSubmitting(false); }
  }

  return <>
    <Heading kicker={attemptSubject(attempt) || algorithms[attempt.algorithm]} title={attempt.title}
      description="Отговорите се запазват при всяка промяна."
      action={<ExamClock deadline={deadline} onExpire={setExpired} />} />
    {error && <Failed error={error} />}
    {saveError && <Failed error={saveError.message} />}
    {expired && <Notice tone="info">Времето изтече. {submitting ? 'Изчисляваме резултата…' : 'Отворете резултата чрез бутона за предаване.'}</Notice>}
    <div className="exam-shell">
      <section className="panel pad stack" aria-labelledby="current-question">
        <div className="actions"><span className="pill blue">{item.topic_name}</span><span className="pill">{difficulties[item.difficulty]}</span></div>
        <div className="section-head"><p className="eyebrow">Въпрос {item.position} от {items.length}</p>
          <h2 key={item.id} tabIndex={-1} ref={questionHeading} id="current-question" className="question-text enter">{item.content}</h2></div>
        <fieldset className="choices" disabled={submitting || expired}><legend>Изберете един отговор</legend>
          {item.options.map(option => <label className="choice" key={option.id}>
            <input type="radio" name={'option-' + item.id} checked={selected === option.id} onChange={() => save(option.id)} />
            <span className="option-letter">{option.label}.</span><span className="option-text">{option.content}</span>
          </label>)}
        </fieldset>
        <div className="split">
          <span role="status" className="muted">{pendingAnswers.has(item.id) ? 'Запазване…' : selected ? 'Отговорът е запазен.' : 'Няма избран отговор.'}</span>
          {selected && <button type="button" className="text-button" disabled={submitting || expired}
            onClick={() => save(null)}>Изчисти отговора</button>}
        </div>
        <div className="split">
          <button type="button" className="button" disabled={position === 0 || submitting} onClick={() => setPosition(position - 1)}>
            <ArrowLeft size={16} /> Предишен</button>
          <button type="button" className="button" disabled={position === items.length - 1 || submitting} onClick={() => setPosition(position + 1)}>
            Следващ <ArrowRight size={16} /></button>
        </div>
      </section>
      <aside className="panel pad stack sidebar-card">
        <div className="section-head"><h2>Лист с отговори</h2><p>{answered} от {items.length} отговорени</p></div>
        <div className="exam-progress" role="progressbar" aria-label="Отговорени въпроси"
          aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={answered}>
          <span style={{ transform: `scaleX(${answered / items.length})` }} />
        </div>
        <nav className="positions" aria-label="Навигация по въпроси">{items.map((row, index) => <button type="button"
          className={'button position' + (displayedAnswer(row) ? ' answered' : '') + (position === index ? ' current' : '')}
          key={row.id} aria-current={position === index ? 'step' : undefined} disabled={submitting}
          aria-label={`Въпрос ${index + 1}, ${displayedAnswer(row) ? 'отговорен' : 'без отговор'}`} onClick={() => setPosition(index)}>
          {String(index + 1).padStart(2, '0')}
        </button>)}</nav>
        <button className="button primary" type="button" disabled={submitting || pendingAnswers.size > 0}
          onClick={() => expired ? void submit() : setConfirm(true)}>
          <Check size={16} /> {submitting ? 'Предаване…' : pendingAnswers.size ? 'Запазване…' : 'Предай изпита'}
        </button>
      </aside>
    </div>
    {confirm && <Confirm title="Предаване на изпита" description={`Отговорени са ${answered} от ${items.length} въпроса. След предаване отговорите се оценяват.`}
      action="Предай" pending={submitting} onCancel={() => setConfirm(false)} onConfirm={() => void submit()} />}
  </>;
}

export function HistoryPage() {
  const [page, setPage] = useState(1);
  const history = useResource<Page<Attempt>>('/results?limit=12&page=' + page);
  return <>
    <Heading kicker="Архив" title="История на изпитите" description="Продължете започнат изпит или прегледайте оценяването на приключените."
      action={<Link href="/exams/new" className="button primary">Нов изпит <ArrowRight size={16} /></Link>} />
    {history.error ? <Failed error={history.error} retry={history.reload} /> : !history.data ? <Loading /> :
      history.data.total === 0 ? <Empty title="Все още няма изпити">След като създадете изпит, ще го намерите тук.</Empty>
      : <><section className="panel pad"><AttemptRows items={history.data.items} /></section>
        <Pagination page={page} total={history.data.total} limit={history.data.limit} change={setPage} /></>}
  </>;
}

export function ResultPage() {
  const { id } = useParams<{ id: string }>();
  const outcome = useResource<ExamResult>('/results/' + id);
  if (outcome.error) return <><Failed error={outcome.error} retry={outcome.reload} /><div className="actions">
    <Link className="button" href={'/exams/' + id}>Към изпита</Link><Link className="button" href="/history">История</Link></div></>;
  if (!outcome.data) return <Loading />;
  const { attempt, summary, topics, items } = outcome.data;
  return <>
    <Heading kicker={statuses[attempt.status]} title={attempt.title}
      description={[attemptSubject(attempt), algorithms[attempt.algorithm]].filter(Boolean).join(' · ')}
      action={<Link className="button" href="/history"><ArrowLeft size={17} /> История</Link>} />
    <section className="panel pad stack" aria-label="Общ резултат">
      <div className="split"><div><p className="eyebrow">Краен резултат</p><strong className="score">{percent(summary.percentage)}</strong></div>
        <p className="pill blue"><Clock3 size={16} /> {duration(summary.duration_seconds)} мин.</p></div>
      <div className="metrics">
        <div className="metric"><strong>{summary.correct}</strong><small>Верни</small></div>
        <div className="metric"><strong>{summary.incorrect}</strong><small>Грешни</small></div>
        <div className="metric"><strong>{summary.unanswered}</strong><small>Без отговор</small></div>
        <div className="metric"><strong>{attempt.total_questions}</strong><small>Общо</small></div>
      </div>
    </section>
    <div className="dual">
      <section className="panel pad stack"><h2>Представяне по теми</h2>
        <ul className="item-list">{topics.map(topic => <li className="item-row" key={topic.id}>
          <span>{topic.name}</span><strong>{topic.correct} / {topic.total}</strong></li>)}</ul>
      </section>
      <section className="panel pad stack"><h2>Подбор на въпросите</h2>
        <p className="muted">{attempt.algorithm === 'balanced' ? 'Действителен брой спрямо целта.' : 'Действителен брой по теми и трудност.'}</p>
        <ul className="item-list">
          {[...attempt.allocation.topics, ...attempt.allocation.difficulties.map(row => ({
            id: String(row.difficulty), name: difficulties[row.difficulty], actual: row.actual, target: row.target,
          }))].map(row => <li className="item-row" key={row.id}><span>{row.name}</span>
            <strong>{row.actual}{row.target !== null ? ' / ' + row.target : ''}</strong></li>)}
        </ul>
      </section>
    </div>
    <h2>Преглед на отговорите</h2>
    {items.map(item => <article key={item.id} className="panel pad stack review">
      <div className="actions"><span className="eyebrow">Въпрос {item.position}</span>
        <span className={'pill ' + (item.is_correct ? 'good' : 'bad')}>
          {item.is_correct ? 'Верен' : item.selected_option_id ? 'Грешен' : 'Без отговор'}</span></div>
      <h3 className="question-text">{item.content}</h3>
      <details><summary>Виж отговорите</summary><ul className="question-options">{item.options.map(option => {
        const correct = option.id === item.correct_option_id;
        const selected = option.id === item.selected_option_id;
        return <li key={option.id} className={correct ? 'correct' : selected ? 'incorrect' : ''}>
          <strong>{option.label}.</strong> {option.content}{correct && ' · верен отговор'}{selected && ' · вашият отговор'}
        </li>;
      })}</ul>{item.explanation && <p className="question-text">{item.explanation}</p>}</details>
    </article>)}
  </>;
}
