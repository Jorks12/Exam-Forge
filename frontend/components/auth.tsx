'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, Eye, EyeOff, LoaderCircle } from 'lucide-react';
import { message, request, write } from '@/lib/api';
import type { Account } from '@/lib/auth-routes';
import { verificationPage } from '@/lib/auth-routes';
import { AnswerSheet, Brand } from './brand';
import { ThemeToggle } from './theme';
import { formValues, Notice, value } from './ui';

export function SignIn({
  configured,
  register = false,
  account,
  next = '/dashboard',
  confirmation,
  initialError,
  pendingVerification = false,
  initialResent = false,
}: {
  configured: boolean;
  register?: boolean;
  account?: Account | null;
  next?: string;
  confirmation?: string;
  initialError?: string;
  pendingVerification?: boolean;
  initialResent?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError ?? '');
  const [resent, setResent] = useState(initialResent);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!url) return;
    try {
      const project = new URL(url).hostname.split('.')[0];
      localStorage.removeItem('sb-' + project + '-auth-token');
    } catch {
      /* Cookie authentication also works when local storage is unavailable. */
    }
  }, []);

  return (
    <main className="auth-page">
      <aside className="auth-art">
        <Brand />
        <div className="auth-story">
          <p className="eyebrow">Работно пространство за подготовка</p>
          <h2>Подготовка с пробни изпити</h2>
          <p>
            Подредете материала по теми, решавайте с таймер и проследявайте напредъка след всеки изпит.
          </p>
          <div className="auth-features">
            <div className="auth-feature-item">
              <CheckCircle2 size={18} className="text-primary" />
              <span>Училищен каталог за X, XI и XII клас</span>
            </div>
            <div className="auth-feature-item">
              <CheckCircle2 size={18} className="text-primary" />
              <span>Симулатор с реално изпитно време</span>
            </div>
            <div className="auth-feature-item">
              <CheckCircle2 size={18} className="text-primary" />
              <span>Персонализиран преговор на сгрешени въпроси</span>
            </div>
          </div>
          <AnswerSheet />
        </div>
        <span className="auth-caption">БАНКА С ВЪПРОСИ / СИМУЛАТОР / АНАЛИЗ</span>
      </aside>

      <section className="auth-content">
        <div className="auth-form enter">
          <div className="split auth-toolbar">
            <Brand />
            <ThemeToggle />
          </div>

          <div className="auth-header">
            <p className="eyebrow">Вашият профил</p>
            <h1>
              {pendingVerification ? 'Потвърдете имейла си' : register ? 'Създайте профил' : account ? 'Добре дошли отново' : 'Вход в ExamForge'}
            </h1>
            <p>
              {pendingVerification ? 'Регистрацията е заявена. Проверете имейла си за потвърждение.' : register
                ? 'Започнете със собствена банка с въпроси.'
                : account
                ? account.email
                : 'Влезте, за да продължите подготовката си.'}
            </p>
          </div>

          {!configured && <Notice tone="info">Услугата за вход още не е конфигурирана.</Notice>}
          {confirmation === 'success' && (
            <Notice tone="success">Имейлът е потвърден. Вече можете да продължите.</Notice>
          )}
          {confirmation === 'failed' && (
            <Notice>Потвърждението не успя. <Link href={verificationPage}>Поискайте нова връзка</Link>.</Notice>
          )}
          {error && <Notice>{error}</Notice>}

          {account ? (
            <div className="form-stack">
              <a href={next} className="button primary">
                <span>Продължи към ExamForge</span>
                <ArrowRight size={17} />
              </a>
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError('');
                  try {
                    await request('/auth/session', write('DELETE'));
                    location.replace('/login');
                  } catch (failure) {
                    setError(message(failure));
                    setBusy(false);
                  }
                }}
              >
                <span>{busy ? 'Излизане…' : 'Изход и смяна на профил'}</span>
              </button>
            </div>
          ) : pendingVerification ? (
            <div className="form-stack">
              <Notice tone="info">Отворете връзката за потвърждение от писмото. Проверете и папката „Спам“.</Notice>
              {resent && <Notice tone="info">Заявката е приета. Ако адресът очаква потвърждение, проверете пощата си за нова връзка.</Notice>}
              <form className="form-stack" method="post" action="/auth/session" onSubmit={async event => {
                const data = formValues(event, setError);
                if (!data || !configured || busy) return;
                setBusy(true);
                setError('');
                setResent(false);
                try {
                  await request('/auth/session', write('POST', { email: value(data, 'email'), resend: true }));
                  setResent(true);
                } catch (failure) {
                  setError(message(failure));
                } finally {
                  setBusy(false);
                }
              }}>
                <input name="resend" type="hidden" value="yes" />
                <label>Имейл<input name="email" type="email" autoComplete="email" maxLength={320} required /></label>
                <button className="button primary" disabled={!configured || busy} aria-busy={busy}>
                  {busy ? 'Изчакване…' : 'Поискайте ново писмо'}
                </button>
              </form>
              <Link className="button" href="/login">Обратно към входа</Link>
            </div>
          ) : (
            <form
              className="form-stack"
              method="post"
              action="/auth/session"
              onSubmit={async event => {
                const data = formValues(event, setError);
                if (!data || !configured || busy) return;
                setBusy(true);
                setError('');
                try {
                  const result = await request<{ confirmationRequired: boolean }>(
                    '/auth/session',
                    write('POST', {
                      email: value(data, 'email'),
                      password: String(data.get('password')),
                      register,
                      remember: data.has('remember'),
                    })
                  );
                  location.replace(result.confirmationRequired ? verificationPage : next);
                  return;
                } catch (failure) {
                  setError(message(failure));
                }
                setBusy(false);
              }}
            >
              <input name="next" type="hidden" value={next} />
              {register && <input name="register" type="hidden" value="yes" />}

              <label>
                Имейл
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="name@example.com"
                  required
                />
              </label>

              <div className="field">
                <label htmlFor="password">Парола</label>
                <div className="password-field">
                  <input
                    id="password"
                    name="password"
                    type={visible ? 'text' : 'password'}
                    autoComplete={register ? 'new-password' : 'current-password'}
                    minLength={register ? 8 : undefined}
                    placeholder="••••••••"
                    required
                  />
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={visible ? 'Скрий паролата' : 'Покажи паролата'}
                    aria-controls="password"
                    aria-pressed={visible}
                    onClick={() => setVisible(!visible)}
                  >
                    {visible ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
                {register && <small>Използвайте поне 8 знака.</small>}
              </div>

              {!register && (
                <label className="check-inline">
                  <input name="remember" type="checkbox" />
                  <span>Запомни ме</span>
                </label>
              )}

              <button className="button primary" disabled={!configured || busy} aria-busy={busy}>
                <span>{busy ? 'Моля, изчакайте…' : register ? 'Регистрация' : 'Вход'}</span>
                {busy ? <LoaderCircle className="spin" size={17} /> : <ArrowRight size={17} />}
              </button>
            </form>
          )}

          {!account && !pendingVerification && (
            <p className="auth-link">
              {register ? 'Имате профил?' : 'Нямате профил?'}{' '}
              <Link href={register ? '/login' : '/register'} prefetch={false}>
                {register ? 'Влезте' : 'Регистрирайте се'}
              </Link>
            </p>
          )}

          <p className="auth-link">
            <Link href="/privacy" prefetch={false}>
              Поверителност и бисквитки
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
