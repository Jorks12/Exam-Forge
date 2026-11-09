'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Archive, BookOpen, Edit3, Folder, Plus, RotateCcw } from 'lucide-react';
import { api, message, write } from '@/lib/api';
import { difficulties, labels } from '@/lib/contracts';
import type { CatalogueQuestion, CatalogueTopic, Label, Page, Question, Subject, Topic } from '@/lib/contracts';
import { useResource } from '@/hooks/use-resource';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { CataloguePicker } from './catalogue';
import { Confirm, Empty, Failed, formValues, Heading, Loading, Notice, Pagination, value } from './ui';

export function QuestionBank() {
  const [catalogue, setCatalogue] = useState(false);
  const [grade, setGrade] = useState('');
  const [subject, setSubject] = useState<Subject | null>(null);
  return <>
    <div className="actions" aria-label="Източник на въпроси">
      <button className={'button' + (!catalogue ? ' primary' : '')} type="button"
        aria-pressed={!catalogue} onClick={() => setCatalogue(false)}>Лична банка</button>
      <button className={'button' + (catalogue ? ' primary' : '')} type="button"
        aria-pressed={catalogue} onClick={() => setCatalogue(true)}>Училищен каталог</button>
    </div>
    {catalogue ? <>
      <Heading kicker="Учебно съдържание" title="Училищен каталог"
        description="Разгледайте общата банка по клас, предмет, тема и трудност." />
      <CataloguePicker grade={grade} subject={subject}
        changeGrade={value => { setGrade(value); setSubject(null); }} changeSubject={setSubject} />
      {subject && <CatalogueBank key={subject.subject_grade_id} subject={subject} />}
    </> : <PrivateBank />}
  </>;
}

function CatalogueBank({ subject }: { subject: Subject }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const searchQuery = useDebouncedValue(search.trim());
  const [topicId, setTopicId] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const params = new URLSearchParams({ grade: String(subject.grade), subjectId: subject.id, page: String(page), limit: '12' });
  for (const [key, input] of Object.entries({ search: searchQuery, topicId, difficulty })) if (input) params.set(key, input);
  const topics = useResource<CatalogueTopic[]>(`/subjects/${subject.id}/topics?grade=${subject.grade}`);
  const list = useResource<Page<CatalogueQuestion>>('/questions?' + params);

  return <>
    {topics.error && <Failed error={topics.error} retry={topics.reload} />}
    <section className="panel pad filters" aria-label="Филтри за каталога">
      <label>Търсене<input type="search" value={search} maxLength={120}
        onChange={event => { setSearch(event.target.value); setPage(1); }} /></label>
      <label>Тема<select value={topicId} onChange={event => { setTopicId(event.target.value); setPage(1); }}>
        <option value="">Всички теми</option>
        {topics.data?.map(topic => <option value={topic.id} key={topic.id}>{topic.name}</option>)}
      </select></label>
      <label>Трудност<select value={difficulty} onChange={event => { setDifficulty(event.target.value); setPage(1); }}>
        <option value="">Всички нива</option>
        {Object.entries(difficulties).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select></label>
    </section>
    {list.error ? <Failed error={list.error} retry={list.reload} /> : !list.data ? <Loading /> :
      list.data.items.length === 0 ? <Empty title="Няма намерени въпроси">Променете филтрите или изберете друг предмет.</Empty> : <>
        <p className="eyebrow">{list.data.total} намерени въпроса</p>
        {list.data.items.map(question => <article className="panel pad question-card" key={question.id}>
          <div className="actions"><span className="pill blue">{question.topic_name}</span>
            <span className="pill">{difficulties[question.difficulty]}</span></div>
          <h2 className="question-text">{question.content}</h2>
          <details><summary>Варианти за отговор</summary><ol className="question-options">
            {question.options.map((option, index) => <li key={option}><strong>{labels[index]}.</strong> {option}</li>)}
          </ol></details>
        </article>)}
        <Pagination page={page} limit={list.data.limit} total={list.data.total} change={setPage} />
      </>}
  </>;
}

function PrivateBank() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const searchQuery = useDebouncedValue(search.trim());
  const [topicId, setTopicId] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [active, setActive] = useState('true');
  const [editor, setEditor] = useState<Question | 'new' | null>(null);
  const [pending, setPending] = useState<Question | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const topics = useResource<Topic[]>('/topics');
  const params = new URLSearchParams({ page: String(page), limit: '12' });
  for (const [key, input] of Object.entries({ search: searchQuery, topicId, difficulty, active })) {
    if (input) params.set(key, input);
  }
  const list = useResource<Page<Question>>('/questions?' + params);

  async function archive(question: Question) {
    setBusy(true); setError(''); setFeedback('');
    try {
      await api('/questions/' + question.id, question.is_active ? write('DELETE') : write('PATCH', { isActive: true }));
      setFeedback(question.is_active ? 'Въпросът е архивиран.' : 'Въпросът отново е активен.');
      setPending(null); setPage(1); list.reload(); topics.reload();
    } catch (failure) { setError(message(failure)); setPending(null); }
    finally { setBusy(false); }
  }

  if (editor && topics.data) return <QuestionEditor question={editor === 'new' ? undefined : editor} topics={topics.data}
    cancel={() => setEditor(null)} saved={() => {
      setFeedback(editor === 'new' ? 'Въпросът е добавен.' : 'Промените са запазени.');
      setEditor(null); setPage(1); list.reload(); topics.reload();
    }} />;

  return <>
    <Heading kicker="Учебно съдържание" title="Банка с въпроси"
      description="Организирайте въпросите си по тема и трудност."
      action={<div className="actions"><Link className="button" href="/questions/topics"><Folder size={17} /> Теми</Link>
        <button className="button primary" type="button" disabled={!topics.data?.length} onClick={() => {
          setEditor('new'); setError(''); setFeedback('');
        }}><Plus size={18} /> Нов въпрос</button></div>} />
    {feedback && <Notice tone="success">{feedback}</Notice>}
    {error && <Failed error={error} />}
    {topics.error && <Failed error={topics.error} retry={topics.reload} />}
    {topics.data?.length === 0 && <Notice tone="info">Преди да добавите въпрос, <Link href="/questions/topics">създайте тема</Link>.</Notice>}
    <section className="panel pad filters" aria-label="Филтри за въпроси">
      <label>Търсене<input type="search" value={search} placeholder="Текст на въпроса" maxLength={120}
        onChange={event => { setSearch(event.target.value); setPage(1); }} /></label>
      <label>Тема<select value={topicId} onChange={event => { setTopicId(event.target.value); setPage(1); }}>
        <option value="">Всички теми</option>
        {topics.data?.map(topic => <option key={topic.id} value={topic.id}>{topic.name}</option>)}
      </select></label>
      <label>Трудност<select value={difficulty} onChange={event => { setDifficulty(event.target.value); setPage(1); }}>
        <option value="">Всички нива</option>
        {Object.entries(difficulties).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select></label>
      <label>Състояние<select value={active} onChange={event => { setActive(event.target.value); setPage(1); }}>
        <option value="">Всички</option><option value="true">Активни</option><option value="false">Архивирани</option>
      </select></label>
    </section>
    {list.error ? <Failed error={list.error} retry={list.reload} /> : !list.data ? <Loading /> : <>
      {list.data.items.length === 0 ? <Empty title="Няма намерени въпроси">Променете филтрите или добавете въпрос към темата.</Empty>
        : <><p className="eyebrow">{list.data.total} намерени въпроса</p>{list.data.items.map(question =>
          <article className="panel pad question-card" key={question.id}>
            <div className="actions"><span className="pill blue"><BookOpen size={13} /> {question.topic_name}</span>
              <span className="pill">{difficulties[question.difficulty]}</span>{!question.is_active && <span className="pill bad">Архивиран</span>}</div>
            <h2 className="question-text">{question.content}</h2>
            <details><summary>Отговори и обяснение</summary><ul className="question-options">
              {question.options.map(option => <li key={option.id} className={option.id === question.correct_option_id ? 'correct' : ''}>
                <strong>{option.label}.</strong> {option.content} {option.id === question.correct_option_id && <small>· верен отговор</small>}</li>)}
            </ul>{question.explanation && <p className="question-text">{question.explanation}</p>}</details>
            <div className="actions">
              <button className="button" type="button" disabled={!topics.data} onClick={() => { setEditor(question); setError(''); setFeedback(''); }}>
                <Edit3 size={15} /> Редактиране</button>
              {question.is_active ? <button className="button" type="button" onClick={() => setPending(question)}>
                <Archive size={15} /> Архивиране</button> : <button className="button" type="button" disabled={busy} onClick={() => void archive(question)}>
                <RotateCcw size={15} /> Възстановяване</button>}
            </div>
          </article>)}</>}
      <Pagination page={page} limit={list.data.limit} total={list.data.total} change={setPage} />
    </>}
    {pending && <Confirm title="Архивиране на въпрос" description="Въпросът ще бъде изключен от новите изпити. Можете да го възстановите от архива."
      action="Архивирай" pending={busy} destructive onCancel={() => setPending(null)} onConfirm={() => void archive(pending)} />}
  </>;
}

function QuestionEditor({ question, topics, saved, cancel }: {
  question?: Question; topics: Topic[]; saved: () => void; cancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const options = Object.fromEntries(question?.options.map(option => [option.label, option.content]) ?? []);
  return <>
    <Heading kicker="Банка с въпроси" title={question ? 'Редактиране на въпрос' : 'Нов въпрос'}
      description="Въведете четири различни отговора и посочете верния." />
    <section className="panel pad">
      <form noValidate className="form-stack" onSubmit={async event => {
        const data = formValues(event, setError);
        if (!data || busy) return;
        const values = Object.fromEntries(labels.map(label => [label, value(data, label)])) as Record<Label, string>;
        if (!value(data, 'content') || Object.values(values).some(text => !text)) {
          setError('Въведете текста на въпроса и четирите отговора.'); return;
        }
        if (new Set(Object.values(values).map(text => text.toLowerCase())).size !== 4) {
          setError('Четирите отговора трябва да са различни.'); return;
        }
        setBusy(true); setError('');
        try {
          await api('/questions' + (question ? '/' + question.id : ''), write(question ? 'PATCH' : 'POST', {
            topicId: value(data, 'topicId'), difficulty: Number(data.get('difficulty')), content: value(data, 'content'),
            explanation: value(data, 'explanation') || null, options: values, correctLabel: value(data, 'correctLabel'),
          }));
          saved();
        } catch (failure) { setError(message(failure)); }
        finally { setBusy(false); }
      }}>
        {error && <Failed error={error} />}
        <div className="form-grid">
          <label>Тема<select name="topicId" required defaultValue={question?.topic_id ?? ''}><option value="" disabled>Изберете тема</option>
            {topics.map(topic => <option key={topic.id} value={topic.id}>{topic.name}</option>)}</select></label>
          <label>Трудност<select name="difficulty" defaultValue={question?.difficulty ?? 1}>
            {Object.entries(difficulties).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        </div>
        <label>Текст на въпроса<textarea name="content" defaultValue={question?.content} required maxLength={4000} /></label>
        <fieldset><legend>Отговори</legend><div className="form-grid">{labels.map(label => <label key={label}>Отговор {label}
          <input name={label} defaultValue={options[label]} maxLength={1000} required /></label>)}</div></fieldset>
        <label>Верен отговор<select name="correctLabel" required defaultValue={question?.options.find(option => option.id === question.correct_option_id)?.label ?? ''}>
          <option value="" disabled>Изберете отговор</option>{labels.map(label => <option key={label}>{label}</option>)}</select></label>
        <label>Обяснение <small>По желание. Показва се при преглед на резултата.</small>
          <textarea name="explanation" defaultValue={question?.explanation ?? ''} maxLength={4000} /></label>
        <div className="actions"><button className="button primary" disabled={busy}>{busy ? 'Запазване…' : 'Запази въпроса'}</button>
          <button className="button" type="button" disabled={busy} onClick={cancel}>Отказ</button></div>
      </form>
    </section>
  </>;
}

export function Topics() {
  const list = useResource<Topic[]>('/topics');
  const subjects = useResource<Subject[]>('/subjects');
  const [editor, setEditor] = useState<Topic | 'new' | null>(null);
  const [removing, setRemoving] = useState<Topic | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const topic = editor === 'new' ? null : editor;

  async function mutate(path: string, options: RequestInit, success: string) {
    setBusy(true); setError(''); setFeedback('');
    try {
      await api(path, options);
      setEditor(null); setRemoving(null); setFeedback(success); list.reload();
    } catch (failure) { setError(message(failure)); setRemoving(null); }
    finally { setBusy(false); }
  }

  return <>
    <Heading kicker="Банка с въпроси" title="Теми" description="Групирайте въпросите, които искате да упражнявате заедно."
      action={<div className="actions"><Link className="button" href="/questions">Към банката</Link>
        <button type="button" className="button primary" disabled={busy} onClick={() => { setEditor('new'); setError(''); }}>
          <Plus size={17} /> Нова тема</button></div>} />
    {feedback && <Notice tone="success">{feedback}</Notice>}
    {error && <Failed error={error} />}
    {editor && <form key={topic?.id ?? 'new'} noValidate className="panel pad form-stack" onSubmit={event => {
      const data = formValues(event, setError);
      if (!data || busy) return;
      if (!value(data, 'name')) { setError('Въведете име на темата.'); return; }
      void mutate('/topics' + (topic ? '/' + topic.id : ''), write(topic ? 'PATCH' : 'POST', {
        name: value(data, 'name'), description: value(data, 'description') || null,
        subjectGradeId: data.has('subjectGradeId') ? value(data, 'subjectGradeId') || null : undefined,
      }), topic ? 'Темата е обновена.' : 'Темата е създадена.');
    }}>
      <h2>{topic ? 'Редактиране на тема' : 'Нова тема'}</h2>
      <label>Име<input name="name" required maxLength={100} defaultValue={topic?.name} /></label>
      <label>Описание<textarea name="description" maxLength={1000} defaultValue={topic?.description ?? ''} /></label>
      {subjects.error && <Failed error={subjects.error} retry={subjects.reload} />}
      {subjects.data && <label>Клас и предмет<select name="subjectGradeId" defaultValue={topic?.subject_grade_id ?? ''}>
        <option value="">Без класификация</option>
        {subjects.data.map(subject => <option key={subject.subject_grade_id} value={subject.subject_grade_id}>
          {subject.grade}. клас · {subject.name}
        </option>)}
      </select></label>}
      <div className="actions"><button className="button primary" disabled={busy}>{busy ? 'Запазване…' : 'Запази темата'}</button>
        <button className="button" type="button" disabled={busy} onClick={() => { setEditor(null); setError(''); }}>Отказ</button></div>
    </form>}
    {list.error ? <Failed error={list.error} retry={list.reload} /> : !list.data ? <Loading />
      : !list.data.length ? <Empty title="Все още няма теми">Създайте първата си тема, за да добавяте въпроси към нея.</Empty>
        : <ul className="panel pad item-list">{list.data.map(row => <li className="item-row" key={row.id}>
          <div><h2>{row.name}</h2>{row.description && <p>{row.description}</p>}<p className="muted">{row.active_count} активни от {row.question_count} въпроса</p>
            {!row.subject_grade_id && <span className="pill">Без класификация</span>}</div>
          <div className="actions"><button className="button" type="button" disabled={busy} onClick={() => { setEditor(row); setError(''); }}>
            Редактиране</button>{row.question_count === 0 && <button className="button" type="button" disabled={busy} onClick={() => setRemoving(row)}>
            Изтриване</button>}</div>
        </li>)}</ul>}
    {removing && <Confirm title="Изтриване на тема" description={`Темата „${removing.name}“ ще бъде изтрита.`} action="Изтрий" pending={busy}
      destructive onCancel={() => setRemoving(null)} onConfirm={() => void mutate('/topics/' + removing.id, write('DELETE'), 'Темата е изтрита.')} />}
  </>;
}
