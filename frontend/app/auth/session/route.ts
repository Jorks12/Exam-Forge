import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { destination, loginError, verificationPage } from '@/lib/auth-routes';
import { authError, privateHeaders, requestOrigin, routeAuth, sameOrigin } from '@/lib/server-auth';

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return authError('Заявката е от друг сайт.', 'ORIGIN', 403);
  const form = request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded');
  const body = await (form ? request.formData().then(data => Object.fromEntries(data)) : request.json()).catch(() => null);
  const { email, password } = body ?? {};
  const register = form ? body?.register === 'yes' : body?.register === true;
  const resend = form ? body?.resend === 'yes' : body?.resend === true;
  const remember = form ? body?.remember === 'on' : body?.remember === true;
  const next = destination(typeof body?.next === 'string' ? body.next : null);
  const redirectTo = (path: string) => NextResponse.redirect(new URL(path, requestOrigin(request)),
    { status: 303, headers: privateHeaders });
  const reject = (code: string, status: number) => {
    if (!form) return authError(loginError(code), code, status);
    const query = new URLSearchParams({ failure: code, next });
    return redirectTo((resend ? verificationPage + '?' : register ? '/register?' : '/login?') + query);
  };
  const address = typeof email === 'string' ? email.trim() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) || address.length > 320 ||
    (!resend && (typeof password !== 'string' || !password || password.length > 1024 || (register && password.length < 8)))) {
    return reject('INPUT', 400);
  }
  const auth = await routeAuth(remember && !register && !resend);
  if (!auth.client) return reject('UNAVAILABLE', 503);
  const emailRedirectTo = new URL('/auth/confirm', requestOrigin(request)).href;
  const accepted = () => form
    ? redirectTo(verificationPage + (resend ? '?resent=yes' : ''))
    : NextResponse.json({ data: { confirmationRequired: true } }, { headers: privateHeaders });
  const mailError = (error: { code?: string; status?: number }) => {
    const code = error.code && /^[a-z0-9_]{1,64}$/.test(error.code) ? error.code : 'AUTH';
    console.warn('Auth email request failed', { action: resend ? 'resend' : 'signup', code, status: error.status });
    return reject(code, error.status === 429 ? 429 : error.status && error.status >= 500 ? 503 : 400);
  };
  if (resend) {
    const { error } = await auth.client.auth.resend({ type: 'signup', email: address, options: { emailRedirectTo } });
    if (error && !['user_not_found', 'user_already_exists', 'email_exists', 'email_already_confirmed'].includes(error.code ?? '')) {
      return mailError(error);
    }
    return accepted();
  }
  const result = register
    ? await auth.client.auth.signUp({ email: address, password, options: { emailRedirectTo } })
    : await auth.client.auth.signInWithPassword({ email: address, password });
  if (result.error) {
    if (register) {
      if (['user_already_exists', 'email_exists'].includes(result.error.code ?? '')) return accepted();
      return mailError(result.error);
    }
    const code = result.error.code ?? 'AUTH';
    return reject(code, result.error.status === 429 ? 429 : result.error.status && result.error.status >= 500 ? 503 : 400);
  }
  if (register) {
    if (!result.data.session) return accepted();
    await auth.client.auth.signOut({ scope: 'local' });
    console.error('Auth signup unexpectedly returned a session');
    return reject('EMAIL_VERIFICATION_REQUIRED', 503);
  }
  if (!result.data.user?.email_confirmed_at) {
    if (result.data.session) await auth.client.auth.signOut({ scope: 'local' });
    return reject('email_not_confirmed', 403);
  }
  if (result.data.session) auth.savePolicy();
  if (form) return redirectTo(result.data.session ? next : '/register?sent=yes');
  return NextResponse.json({ data: { confirmationRequired: !result.data.session } }, { headers: privateHeaders });
}

export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return authError('Заявката е от друг сайт.', 'ORIGIN', 403);
  const auth = await routeAuth();
  const result = await auth.client?.auth.signOut({ scope: 'local' });
  if (result?.error) return authError('Изходът не успя. Опитайте отново.', 'LOGOUT', 503);
  auth.clearPolicy();
  return new NextResponse(null, { status: 204, headers: privateHeaders });
}
