import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  account, accountHeader, privateHeaders, requestOrigin, serverClient, sessionOptions, sessionPolicy,
} from '@/lib/server-auth';

export async function proxy(request: NextRequest) {
  const incoming = new Headers(request.headers);
  incoming.delete(accountHeader);
  const remember = request.cookies.get(sessionPolicy)?.value === 'yes';
  const pending: { name: string; value: string; options: ReturnType<typeof sessionOptions> }[] = [];
  const client = serverClient(() => request.cookies.getAll(), changes => {
    for (const { name, value, options } of changes) {
      request.cookies.set(name, value);
      pending.push({ name, value, options: sessionOptions(options, remember) });
    }
  });
  const user = client ? (await client.auth.getUser()).data.user : null;
  if (user) incoming.set(accountHeader, encodeURIComponent(JSON.stringify(account(user))));
  const entry = request.nextUrl.pathname === '/login';
  let response: NextResponse;
  if (!user && !entry) {
    const login = new URL('/login', requestOrigin(request));
    login.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
    response = NextResponse.redirect(login);
  } else {
    incoming.set('cookie', request.cookies.toString());
    response = NextResponse.next({ request: { headers: incoming } });
  }
  for (const cookie of pending) response.cookies.set(cookie.name, cookie.value, cookie.options);
  response.headers.set('Cache-Control', privateHeaders['Cache-Control']);
  return response;
}

export const config = {
  matcher: ['/login', '/dashboard/:path*', '/questions/:path*', '/exams/:path*',
    '/history/:path*', '/analytics/:path*', '/results/:path*', '/settings/:path*'],
};
