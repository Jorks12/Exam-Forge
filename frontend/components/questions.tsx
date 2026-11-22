'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import {
  Archive,
  BookOpen,
  Edit3,
  Folder,
  Layers,
  Plus,
  RotateCcw,
  Search,
} from 'lucide-react';
import { api, message, write } from '@/lib/api';
import { difficulties, labels, percent } from '@/lib/contracts';
import type { CatalogueQuestion, CatalogueTopic, Label, Page, Question, Subject, Topic } from '@/lib/contracts';
import { useResource } from '@/hooks/use-resource';
import { skipToken, useQuery, useQueryClient } from '@tanstack/react-query';
import { MathText } from './math-text';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { CataloguePicker } from './catalogue';
import { Confirm, Empty, Failed, formValues, Heading, Loading, Notice, Pagination, value } from './ui';

export function QuestionBank() {
  const access = useResource<{ admin: boolean }>('/catalogue/access');
  const [catalogue, setCatalogue] = useState(false);
  const [grade, setGrade] = useState('');
  const [subject, setSubject] = useState<Subject | null>(null);

  return (
    <>
      <div className="actions source-toggle" aria-label="Източник на въпроси">
        <button
          className={'button' + (!catalogue ? ' primary' : '')}
          type="button"
          aria-pressed={!catalogue}
          onClick={() => setCatalogue(false)}
        >
          <Layers size={17} aria-hidden="true" />
          <span>Обща банка</span>
        </button>
        <button
          className={'button' + (catalogue ? ' primary' : '')}
          type="button"
          aria-pressed={catalogue}
          onClick={() => setCatalogue(true)}
        >
          <BookOpen size={17} aria-hidden="true" />
          <span>Училищен каталог</span>
        </button>
        <Link className="button" href="/questions/quality">
          <span>Качество на въпросите</span>
        </Link>
      </div>

      {catalogue ? (
        <>
          <Heading
            kicker="Учебно съдържание"
            title="Училищен каталог"
            description="Разгледайте общата банка по клас, предмет, тема и трудност."
          />
          <CataloguePicker
            grade={grade}
            subject={subject}
            changeGrade={value => {
              setGrade(value);
              setSubject(null);
            }}
            changeSubject={setSubject}
          />
          {subject && <CatalogueBank key={subject.subject_grade_id} subject={subject} />}
        </>
      ) : access.error ? (
        <Failed error={access.error} retry={access.reload} />
      ) : access.data ? (
        <SharedBank key={String(access.data.admin)} admin={access.data.admin} />
      ) : (
        <Loading />
      )}
    </>
  );
}

function CatalogueBank({ subject }: { subject: Subject }) {
  const cache = useQueryClient();
  const access = useResource<{ admin: boolean }>('/catalogue/access');
  const admin = access.data?.admin === true;
  const [archived, setArchived] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const searchQuery = useDebouncedValue(search.trim());
  const [topicId, setTopicId] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const params = new URLSearchParams({
    grade: String(subject.grade),
    subjectId: subject.id,
    page: String(page),
    limit: '12',
  });
  for (const [key, input] of Object.entries({ search: searchQuery, topicId, difficulty })) {
    if (input) params.set(key, input);
  }
  const topics = useResource<CatalogueTopic[]>(`/subjects/${subject.id}/topics?grade=${subject.grade}`, true);
  if (admin && archived) params.set('active', 'false');
  const list = useResource<Page<CatalogueQuestion>>('/questions?' + params, true);

  async function updateStatus(id: string) {
    setPending(true);
    setError('');
    try {
      await api('/catalogue/questions/' + id, write('PATCH', { isActive: archived }));
      setPage(1);
      await cache.invalidateQueries({ predicate: ({ queryKey: [group] }) => group === 'questions' || group === 'subjects' });
    } catch (failure) {
      setError(message(failure));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {topics.error && <Failed error={topics.error} retry={topics.reload} />}
      {error && <p role="alert">{error}</p>}
      {admin && <div className="actions">
        <span className="pill blue">Администратор на каталога</span>
        <button className="button" type="button" aria-pressed={archived} disabled={pending} onClick={() => {
          setArchived(current => !current);
          setPage(1);
          setError('');
        }}>Архивирани въпроси</button>
      </div>}
      <section className="panel pad filters question-filters" aria-label="Филтри за каталога">
        <label>
          Търсене
          <span className="search-field"><Search size={17} aria-hidden="true" />
          <input
            type="search"
            value={search}
            placeholder="Дума или фраза"
            maxLength={120}
            onChange={event => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
          </span>
        </label>
        <label>
          Тема
          <select
            value={topicId}
            onChange={event => {
              setTopicId(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Всички теми</option>
            {topics.data?.map(topic => (
              <option value={topic.id} key={topic.id}>
                {topic.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Трудност
          <select
            value={difficulty}
            onChange={event => {
              setDifficulty(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Всички нива</option>
            {Object.entries(difficulties).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </section>

      {list.error ? (
        <Failed error={list.error} retry={list.reload} />
      ) : !list.data ? (
        <Loading />
      ) : list.data.items.length === 0 ? (
        <Empty title="Няма намерени въпроси">Променете филтрите или изберете друг предмет.</Empty>
      ) : (
        <>
          <p className="eyebrow" style={{ marginTop: '0.25rem' }}>{list.data.total} намерени въпроса</p>
          <div className="stack" style={{ gap: '0.85rem' }}>
            {list.data.items.map(question => (
              <article className="panel pad question-card" key={question.id}>
                <div className="actions">
                  <span className="pill blue">{question.topic_name}</span>
                  <span className={'pill' + (question.difficulty === 3 ? ' warning' : '')}>{difficulties[question.difficulty]}</span>
                </div>
                <h2 className="question-text">
                  <MathText text={question.content} />
                </h2>
                <details>
                  <summary>Варианти за отговор</summary>
                  <ol className="question-options">
                    {question.options.map((option, index) => (
                      <li key={option}>
                        <strong>{labels[index]}.</strong> <MathText text={option} />
                      </li>
                    ))}
                  </ol>
                </details>
                {admin && <button className="button" type="button" disabled={pending}
                  onClick={() => { void updateStatus(question.id); }}>
                  {archived ? 'Възстанови въпроса' : 'Архивирай въпроса'}
                </button>}
              </article>
            ))}
          </div>
          <Pagination page={page} limit={list.data.limit} total={list.data.total} change={setPage} />
        </>
      )}
    </>
  );
}

type BankQuestion = Omit<Question, 'correct_option_id' | 'explanation'> | Question;

function SharedBank({ admin }: { admin: boolean }) {
  const cache = useQueryClient();
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
  const topics = useResource<Topic[]>(admin ? '/topics' : '/topics/shared', true);
  const params = new URLSearchParams({ page: String(page), limit: '12' });
  for (const [key, input] of Object.entries({ search: searchQuery, topicId, difficulty, active })) {
    if (input) params.set(key, input);
  }
  const list = useResource<Page<BankQuestion>>((admin ? '/questions?' : '/questions/shared?') + params, true);

  function refreshBank() {
    setPage(1);
    void cache.invalidateQueries({ queryKey: ['questions'] });
    void cache.invalidateQueries({ queryKey: ['topics'] });
  }

  async function archive(question: BankQuestion) {
    setBusy(true);
    setError('');
    setFeedback('');
    try {
      await api('/questions/' + question.id, question.is_active ? write('DELETE') : write('PATCH', { isActive: true }));
      setFeedback(question.is_active ? 'Въпросът е архивиран.' : 'Въпросът отново е активен.');
      setPending(null);
      refreshBank();
    } catch (failure) {
      setError(message(failure));
      setPending(null);
    } finally {
      setBusy(false);
    }
  }

  if (editor && topics.data)
    return (
      <QuestionEditor
        question={editor === 'new' ? undefined : editor}
        topics={topics.data}
        cancel={() => setEditor(null)}
        saved={() => {
          setFeedback(editor === 'new' ? 'Въпросът е добавен.' : 'Промените са запазени.');
          setEditor(null);
          refreshBank();
        }}
      />
    );

  return (
    <>
      <Heading
        kicker="Учебно съдържание"
        title="Банка с въпроси"
        description="Разгледайте въпросите по тема и трудност."
        action={admin && (
          <div className="actions">
            <Link className="button" href="/questions/topics">
              <Folder size={17} />
              <span>Теми</span>
            </Link>
            <button
              className="button primary"
              type="button"
              disabled={!topics.data?.length}
              onClick={() => {
                setEditor('new');
                setError('');
                setFeedback('');
              }}
            >
              <Plus size={18} />
              <span>Нов въпрос</span>
            </button>
          </div>
        )}
      />
      {feedback && <Notice tone="success">{feedback}</Notice>}
      {error && <Failed error={error} />}
      {topics.error && <Failed error={topics.error} retry={topics.reload} />}
      {admin && topics.data?.length === 0 && (
        <Notice tone="info">
          Преди да добавите въпрос, <Link href="/questions/topics">създайте тема</Link>.
        </Notice>
      )}

      <section className="panel pad filters question-filters" aria-label="Филтри за въпроси">
        <label>
          Търсене
          <span className="search-field"><Search size={17} aria-hidden="true" />
          <input
            type="search"
            value={search}
            placeholder="Текст на въпроса"
            maxLength={120}
            onChange={event => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
          </span>
        </label>
        <label>
          Тема
          <select
            value={topicId}
            onChange={event => {
              setTopicId(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Всички теми</option>
            {topics.data?.map(topic => (
              <option key={topic.id} value={topic.id}>
                {topic.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Трудност
          <select
            value={difficulty}
            onChange={event => {
              setDifficulty(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Всички нива</option>
            {Object.entries(difficulties).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {admin && <label>
          Състояние
          <select
            value={active}
            onChange={event => {
              setActive(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Всички</option>
            <option value="true">Активни</option>
            <option value="false">Архивирани</option>
          </select>
        </label>}
      </section>

      {list.error ? (
        <Failed error={list.error} retry={list.reload} />
      ) : !list.data ? (
        <Loading />
      ) : (
        <>
          {list.data.items.length === 0 ? (
            <Empty title="Няма намерени въпроси">Променете филтрите, за да видите други въпроси.</Empty>
          ) : (
            <>
              <p className="eyebrow" style={{ marginTop: '0.25rem' }}>{list.data.total} намерени въпроса</p>
              <div className="stack" style={{ gap: '0.85rem' }}>
                {list.data.items.map(question => {
                  const editable = admin && 'correct_option_id' in question ? question : null;
                  return (
                  <article className="panel pad question-card" key={question.id}>
                    <div className="actions">
                      <span className="pill blue">
                        <BookOpen size={13} /> {question.topic_name}
                      </span>
                      <span className={'pill' + (question.difficulty === 3 ? ' warning' : '')}>{difficulties[question.difficulty]}</span>
                      {!question.is_active && <span className="pill bad">Архивиран</span>}
                    </div>
                    <h2 className="question-text">
                      <MathText text={question.content} />
                    </h2>
                    <details>
                      <summary>{editable ? 'Отговори и обяснение' : 'Варианти за отговор'}</summary>
                      <ul className="question-options">
                        {question.options.map(option => (
                          <li
                            key={option.id}
                            className={option.id === editable?.correct_option_id ? 'correct' : ''}
                          >
                            <strong>{option.label}.</strong> <MathText text={option.content} />{' '}
                            {option.id === editable?.correct_option_id && <small>· верен отговор</small>}
                          </li>
                        ))}
                      </ul>
                      {editable?.explanation && (
                        <p className="question-text" style={{ marginTop: '0.65rem' }}>
                          <MathText text={editable.explanation} />
                        </p>
                      )}
                    </details>
                    {editable && <div className="actions">
                      <button
                        className="button"
                        type="button"
                        disabled={!topics.data}
                        onClick={() => {
                          setEditor(editable);
                          setError('');
                          setFeedback('');
                        }}
                      >
                        <Edit3 size={15} />
                        <span>Редактиране</span>
                      </button>
                      {question.is_active ? (
                        <button className="button" type="button" onClick={() => setPending(editable)}>
                          <Archive size={15} />
                          <span>Архивиране</span>
                        </button>
                      ) : (
                        <button
                          className="button"
                          type="button"
                          disabled={busy}
                          onClick={() => void archive(question)}
                        >
                          <RotateCcw size={15} />
                          <span>Възстановяване</span>
                        </button>
                      )}
                    </div>}
                  </article>
                  );
                })}
              </div>
            </>
          )}
          <Pagination page={page} limit={list.data.limit} total={list.data.total} change={setPage} />
        </>
      )}

      {pending && (
        <Confirm
          title="Архивиране на въпрос"
          description="Въпросът ще бъде изключен от новите изпити. Можете да го възстановите от архива."
          action="Архивирай"
          pending={busy}
          destructive
          onCancel={() => setPending(null)}
          onConfirm={() => void archive(pending)}
        />
      )}
    </>
  );
}

function QuestionEditor({
  question,
  topics,
  saved,
  cancel,
}: {
  question?: Question;
  topics: Topic[];
  saved: () => void;
  cancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [content, setContent] = useState(question?.content ?? '');
  const [fieldError, setFieldError] = useState<{ field: string; message: string }>();
  const errorId = useId();
  const draft = useDebouncedValue(content.trim(), 450);
  const checking = draft.length >= 12 && content.trim() === draft && draft !== question?.content;
  const similar = useQuery({
    queryKey: ['questions', 'similar', question?.id, draft],
    queryFn: checking
      ? ({ signal }) =>
          api<(Pick<Question, 'id' | 'content' | 'topic_name' | 'is_active'> & { similarity: number })[]>(
            '/questions/similar',
            { ...write('POST', { content: draft, excludeId: question?.id }), signal }
          )
      : skipToken,
    gcTime: 0,
  });
  const options = Object.fromEntries(question?.options.map(option => [option.label, option.content]) ?? []);
  const invalid = (field: string) => fieldError?.field === field
    ? { 'aria-invalid': true as const, 'aria-describedby': errorId } : {};
  const errorFor = (field: string) => fieldError?.field === field &&
    <small id={errorId} className="field-error" aria-hidden="true">{fieldError.message}</small>;

  return (
    <>
      <Heading
        kicker="Банка с въпроси"
        title={question ? 'Редактиране на въпрос' : 'Нов въпрос'}
        description="Въведете четири различни отговора и посочете верния."
      />
      <section className="panel pad">
        <form
          noValidate
          className="form-stack question-editor-form"
          onChange={event => {
            if (event.target instanceof HTMLElement && event.target.getAttribute('name') === fieldError?.field) setFieldError(undefined);
          }}
          onSubmit={async event => {
            setFieldError(undefined);
            const form = event.currentTarget;
            function showFieldError(field: string, message: string) {
              setFieldError({ field, message });
              form.querySelector<HTMLElement>(`[name="${field}"]`)?.focus();
            }
            const data = formValues(event, setError, showFieldError);
            if (!data || busy) return;
            const values = Object.fromEntries(labels.map(label => [label, value(data, label)])) as Record<
              Label,
              string
            >;
            if (!value(data, 'content') || Object.values(values).some(text => !text)) {
              setError('Въведете текста на въпроса и четирите отговора.');
              const field = !value(data, 'content') ? 'content' : labels.find(label => !values[label]);
              if (field) showFieldError(field, 'Въведете текст.');
              return;
            }
            if (new Set(Object.values(values).map(text => text.toLowerCase())).size !== 4) {
              setError('Четирите отговора трябва да са различни.');
              const repeated = labels.find((label, index) => labels.slice(0, index)
                .some(previous => values[previous].toLowerCase() === values[label].toLowerCase()));
              if (repeated) showFieldError(repeated, 'Този текст се повтаря в друг отговор.');
              return;
            }
            setBusy(true);
            setError('');
            try {
              await api(
                '/questions' + (question ? '/' + question.id : ''),
                write(question ? 'PATCH' : 'POST', {
                  topicId: value(data, 'topicId'),
                  difficulty: Number(data.get('difficulty')),
                  content: value(data, 'content'),
                  explanation: value(data, 'explanation') || null,
                  options: values,
                  correctLabel: value(data, 'correctLabel'),
                })
              );
              saved();
            } catch (failure) {
              setError(message(failure));
            } finally {
              setBusy(false);
            }
          }}
        >
          {error && <Failed error={error} />}
          <div className="form-grid">
            <label>
              Тема
              <select name="topicId" required defaultValue={question?.topic_id ?? ''} {...invalid('topicId')}>
                <option value="" disabled>
                  Изберете тема
                </option>
                {topics.map(topic => (
                  <option key={topic.id} value={topic.id}>
                    {topic.name}
                  </option>
                ))}
              </select>
              {errorFor('topicId')}
            </label>
            <label>
              Трудност
              <select name="difficulty" defaultValue={question?.difficulty ?? 1}>
                {Object.entries(difficulties).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Текст на въпроса
            <textarea
              name="content"
              value={content}
              onChange={event => setContent(event.target.value)}
              required
              maxLength={4000}
              placeholder="Въведете условието на въпроса…"
              {...invalid('content')}
            />
            {errorFor('content')}
          </label>
          {checking && similar.data && similar.data.length > 0 && (
            <Notice tone="info">
              <strong>Възможни дубликати в общата банка</strong>
              <ul className="question-options">
                {similar.data.map(row => (
                  <li key={row.id}>
                    <MathText text={row.content} />{' '}
                    <small>
                      · {row.topic_name} · {percent(row.similarity * 100)} сходство
                      {!row.is_active && ' · архивиран'}
                    </small>
                  </li>
                ))}
              </ul>
            </Notice>
          )}
          {checking && similar.isError && (
            <p role="status" className="muted">
              Проверката за сходни въпроси временно е недостъпна.
            </p>
          )}
          <p className="muted" style={{ fontSize: '0.85rem' }}>
            За формули в текста, отговорите и обяснението използвайте <code>{'\\(x^2\\)'}</code> в реда или{' '}
            <code>{'\\[x^2\\]'}</code> на отделен ред.
          </p>
          <fieldset>
            <legend>Отговори</legend>
            <div className="form-grid">
              {labels.map(label => (
                <label key={label}>
                  Отговор {label}
                  <input name={label} defaultValue={options[label]} maxLength={1000} required {...invalid(label)} />
                  {errorFor(label)}
                </label>
              ))}
            </div>
          </fieldset>
          <label>
            Верен отговор
            <select
              name="correctLabel"
              required
              defaultValue={question?.options.find(option => option.id === question.correct_option_id)?.label ?? ''}
              {...invalid('correctLabel')}
            >
              <option value="" disabled>
                Изберете отговор
              </option>
              {labels.map(label => (
                <option key={label}>{label}</option>
              ))}
            </select>
            {errorFor('correctLabel')}
          </label>
          <label>
            Обяснение <small>По желание. Показва се при преглед на резултата.</small>
            <textarea
              name="explanation"
              defaultValue={question?.explanation ?? ''}
              maxLength={4000}
              placeholder="Обяснете защо верният отговор е правилен…"
            />
          </label>
          <div className="actions">
            <button className="button primary" disabled={busy}>
              {busy ? 'Запазване…' : 'Запази въпроса'}
            </button>
            <button className="button" type="button" disabled={busy} onClick={cancel}>
              Отказ
            </button>
          </div>
        </form>
      </section>
    </>
  );
}

export function Topics() {
  const cache = useQueryClient();
  const access = useResource<{ admin: boolean }>('/catalogue/access');
  const admin = access.data?.admin === true;
  const list = useResource<Topic[]>(access.data ? (admin ? '/topics' : '/topics/shared') : null, true);
  const subjects = useResource<Subject[]>(admin ? '/subjects' : null);
  const [editor, setEditor] = useState<Topic | 'new' | null>(null);
  const [removing, setRemoving] = useState<Topic | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const topic = editor === 'new' ? null : editor;

  async function mutate(path: string, options: RequestInit, success: string) {
    setBusy(true);
    setError('');
    setFeedback('');
    try {
      await api(path, options);
      setEditor(null);
      setRemoving(null);
      setFeedback(success);
      void cache.invalidateQueries({ queryKey: ['topics'] });
      void cache.invalidateQueries({ queryKey: ['questions'] });
    } catch (failure) {
      setError(message(failure));
      setRemoving(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Heading
        kicker="Банка с въпроси"
        title="Теми"
        description="Групирайте въпросите, които искате да упражнявате заедно."
        action={
          <div className="actions">
            <Link className="button" href="/questions">
              Към банката
            </Link>
            {admin && <button
              type="button"
              className="button primary"
              disabled={busy}
              onClick={() => {
                setEditor('new');
                setError('');
              }}
            >
              <Plus size={17} />
              <span>Нова тема</span>
            </button>}
          </div>
        }
      />
      {feedback && <Notice tone="success">{feedback}</Notice>}
      {error && <Failed error={error} />}
      {access.error && <Failed error={access.error} retry={access.reload} />}
      {admin && editor && (
        <form
          key={topic?.id ?? 'new'}
          noValidate
          className="panel pad form-stack"
          onSubmit={event => {
            const data = formValues(event, setError);
            if (!data || busy) return;
            if (!value(data, 'name')) {
              setError('Въведете име на темата.');
              return;
            }
            void mutate(
              '/topics' + (topic ? '/' + topic.id : ''),
              write(topic ? 'PATCH' : 'POST', {
                name: value(data, 'name'),
                description: value(data, 'description') || null,
                subjectGradeId: data.has('subjectGradeId') ? value(data, 'subjectGradeId') || null : undefined,
              }),
              topic ? 'Темата е обновена.' : 'Темата е създадена.'
            );
          }}
        >
          <div className="section-head">
            <h2>{topic ? 'Редактиране на тема' : 'Нова тема'}</h2>
            <p className="muted">Въведете детайли за тематичната единица.</p>
          </div>
          <label>
            Име
            <input name="name" required maxLength={100} defaultValue={topic?.name} placeholder="Напр. Линейни уравнения" />
          </label>
          <label>
            Описание
            <textarea
              name="description"
              maxLength={1000}
              defaultValue={topic?.description ?? ''}
              placeholder="Кратко описание на материала в темата…"
            />
          </label>
          {subjects.error && <Failed error={subjects.error} retry={subjects.reload} />}
          {subjects.data && (
            <label>
              Клас и предмет
              <select name="subjectGradeId" defaultValue={topic?.subject_grade_id ?? ''}>
                <option value="">Без класификация</option>
                {subjects.data.map(subject => (
                  <option key={subject.subject_grade_id} value={subject.subject_grade_id}>
                    {subject.grade}. клас · {subject.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="actions">
            <button className="button primary" disabled={busy}>
              {busy ? 'Запазване…' : 'Запази темата'}
            </button>
            <button
              className="button"
              type="button"
              disabled={busy}
              onClick={() => {
                setEditor(null);
                setError('');
              }}
            >
              Отказ
            </button>
          </div>
        </form>
      )}

      {list.error ? (
        <Failed error={list.error} retry={list.reload} />
      ) : !list.data ? (
        <Loading />
      ) : !list.data.length ? (
        <Empty title="Все още няма теми">
          {admin ? 'Създайте първата тема, за да добавите въпроси към нея.' : 'Все още няма теми с активни въпроси.'}
        </Empty>
      ) : (
        <ul className="panel pad item-list">
          {list.data.map(row => (
            <li className="item-row" key={row.id}>
              <div>
                <h2>{row.name}</h2>
                {row.description && <p>{row.description}</p>}
                <p className="muted">
                  {row.active_count} активни от {row.question_count} въпроса
                </p>
                {!row.subject_grade_id && <span className="pill">Без класификация</span>}
              </div>
              {admin && <div className="actions">
                <button
                  className="button"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setEditor(row);
                    setError('');
                  }}
                >
                  Редактиране
                </button>
                {row.question_count === 0 && (
                  <button
                    className="button"
                    type="button"
                    disabled={busy}
                    onClick={() => setRemoving(row)}
                  >
                    Изтриване
                  </button>
                )}
              </div>}
            </li>
          ))}
        </ul>
      )}

      {admin && removing && (
        <Confirm
          title="Изтриване на тема"
          description={`Темата „${removing.name}“ ще бъде изтрита.`}
          action="Изтрий"
          pending={busy}
          destructive
          onCancel={() => setRemoving(null)}
          onConfirm={() => void mutate('/topics/' + removing.id, write('DELETE'), 'Темата е изтрита.')}
        />
      )}
    </>
  );
}
