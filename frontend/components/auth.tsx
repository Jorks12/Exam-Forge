'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, Eye, EyeOff, LoaderCircle } from 'lucide-react';
import { message, request, write } from '@/lib/api';
import type { Account } from '@/lib/auth-routes';
import { AnswerSheet, Brand } from './brand';
import { ThemeToggle } from './theme';
import { formValues, Notice, value } from './ui';

export function SignIn({ configured, register = false, account, next = '/dashboard', confirmation, initialError, initialSent }: {
  configured: boolean; register?: boolean; account?: Account | null; next?: string; confirmation?: string;
  initialError?: string; initialSent?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError ?? '');
  const [sent, setSent] = useState(initialSent ?? false);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!url) return;
    try {
      const project = new URL(url).hostname.split('.')[0];
      localStorage.removeItem('sb-' + project + '-auth-token');
    } catch { /* Cookie authentication also works when local storage is unavailable. */ }
  }, []);

  return <main className="auth-page">
    <aside className="auth-art">
      <Brand /><div className="auth-story"><p className="eyebrow">Работно пространство за подготовка</p>
        <h2>От банка с въпроси до пробен изпит.</h2>
        <p>Подредете материала по теми, упражнявайте се с таймер и проследявайте резултатите си.</p>
        <AnswerSheet />
      </div><span className="auth-caption">БАНКА С ВЪПРОСИ / СИМУЛАТОР / АНАЛИЗ</span>
    </aside>
    <section className="auth-content"><div className="auth-form enter">
      <div className="split auth-toolbar"><Brand /><ThemeToggle /></div>
      <p className="eyebrow">Вашият профил</p>
      <h1>{register ? 'Създайте профил' : account ? 'Добре дошли отново' : 'Вход в ExamForge'}</h1>
      <p>{register ? 'Започнете със собствена банка с въпроси.' : account
        ? account.email : 'Влезте, за да продължите подготовката си.'}</p>
      {!configured && <Notice tone="info">Услугата за вход още не е конфигурирана.</Notice>}
      {confirmation === 'success' && <Notice tone="success">Имейлът е потвърден. Вече можете да продължите.</Notice>}
      {confirmation === 'failed' && <Notice>Връзката за потвърждение е изтекла или е отворена в друг браузър.</Notice>}
      {error && <Notice>{error}</Notice>}
      {account ? <div className="form-stack">
        <a href={next} className="button primary">Продължи към ExamForge <ArrowRight size={17} /></a>
        <button type="button" className="button" disabled={busy} onClick={async () => {
          setBusy(true); setError('');
          try {
            await request('/auth/session', write('DELETE'));
            location.replace('/login');
          } catch (failure) { setError(message(failure)); setBusy(false); }
        }}>{busy ? 'Излизане…' : 'Изход и смяна на профил'}</button>
      </div> : sent ? <Notice tone="success">Изпратихме връзка за потвърждение. Отворете я в този браузър, за да активирате профила си.</Notice>
        : <form className="form-stack" method="post" action="/auth/session" onSubmit={async event => {
          const data = formValues(event, setError);
          if (!data || !configured || busy) return;
          setBusy(true); setError('');
          try {
            const result = await request<{ confirmationRequired: boolean }>('/auth/session', write('POST', {
              email: value(data, 'email'), password: String(data.get('password')), register,
              remember: data.has('remember'),
            }));
            if (result.confirmationRequired) setSent(true);
            else { location.replace(next); return; }
          } catch (failure) { setError(message(failure)); }
          setBusy(false);
        }}>
          <input name="next" type="hidden" value={next} />
          {register && <input name="register" type="hidden" value="yes" />}
          <label>Имейл<input name="email" type="email" autoComplete="email" placeholder="name@example.com" required /></label>
          <div className="field"><label htmlFor="password">Парола</label>
            <div className="password-field"><input id="password" name="password" type={visible ? 'text' : 'password'}
              autoComplete={register ? 'new-password' : 'current-password'} minLength={register ? 8 : undefined} required />
              <button type="button" className="icon-button" aria-label={visible ? 'Скрий паролата' : 'Покажи паролата'}
                aria-controls="password" aria-pressed={visible} onClick={() => setVisible(!visible)}>
                {visible ? <EyeOff size={17} /> : <Eye size={17} />}
              </button></div>
            {register && <small>Използвайте поне 8 знака.</small>}
          </div>
          {!register && <label className="check-inline"><input name="remember" type="checkbox" /> Запомни ме</label>}
          <button className="button primary" disabled={!configured || busy} aria-busy={busy}>
            {busy ? 'Моля, изчакайте…' : register ? 'Регистрация' : 'Вход'}
            {busy ? <LoaderCircle className="spin" size={17} /> : <ArrowRight size={17} />}
          </button>
        </form>}
      {!account && <p className="auth-link">{register ? 'Имате профил?' : 'Нямате профил?'}{' '}
        <Link href={register ? '/login' : '/register'} prefetch={false}>{register ? 'Влезте' : 'Регистрирайте се'}</Link></p>}
      <p className="auth-link"><Link href="/privacy" prefetch={false}>Поверителност и бисквитки</Link></p>
    </div></section>
  </main>;
}
