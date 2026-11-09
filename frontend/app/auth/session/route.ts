import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { destination, loginError } from '@/lib/auth-routes';
import { authError, privateHeaders, requestOrigin, routeAuth, sameOrigin } from '@/lib/server-auth';

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return authError('Заявката е от друг сайт.', 'ORIGIN', 403);
  const form = request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded');
  const body = await (form ? request.formData().then(data => Object.fromEntries(data)) : request.json()).catch(() => null);
  const { email, password } = body ?? {};
  const register = form ? body?.register === 'yes' : body?.register === true;
  const remember = form ? body?.remember === 'on' : body?.remember === true;
  const next = destination(typeof body?.next === 'string' ? body.next : null);
  const redirectTo = (path: string) => NextResponse.redirect(new URL(path, requestOrigin(request)),
    { status: 303, headers: privateHeaders });
  const reject = (code: string, status: number) => {
    if (!form) return authError(loginError(code), code, status);
    const query = new URLSearchParams({ failure: code, next });
    return redirectTo((register ? '/register?' : '/login?') + query);
  };
  if (typeof email !== 'string' || !email.trim() || email.length > 320 || typeof password !== 'string'
    || !password || password.length > 1024 || (register && password.length < 8)) {
    return reject('INPUT', 400);
  }
  const auth = await routeAuth(remember && !register);
  if (!auth.client) return reject('UNAVAILABLE', 503);
  const result = register
    ? await auth.client.auth.signUp({ email: email.trim(), password,
      options: { emailRedirectTo: new URL('/login', requestOrigin(request)).href } })
    : await auth.client.auth.signInWithPassword({ email: email.trim(), password });
  if (result.error) {
    const code = result.error.code ?? 'AUTH';
    return reject(code, result.error.status === 429 ? 429 : result.error.status && result.error.status >= 500 ? 503 : 400);
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
