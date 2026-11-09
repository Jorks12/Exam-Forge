import type { NextRequest } from 'next/server';
import { authError, privateHeaders, routeAuth, sameOrigin } from '@/lib/server-auth';

async function forward(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const writes = request.method !== 'GET';
  if (writes && !sameOrigin(request)) return authError('Заявката е от друг сайт.', 'ORIGIN', 403);
  const { path } = await context.params;
  if (path.some(segment => !/^[a-z0-9-]+$/i.test(segment))) return authError('Адресът не е намерен.', 'NOT_FOUND', 404);
  const body = writes ? await request.text() : undefined;
  if (body && new TextEncoder().encode(body).length > 32768) {
    return authError('Заявката е твърде голяма.', 'PAYLOAD_TOO_LARGE', 413);
  }
  const { client } = await routeAuth();
  const token = (await client?.auth.getSession())?.data.session?.access_token;
  if (!token) return authError('Влезте отново, за да продължите.', 'UNAUTHENTICATED', 401);
  const base = (process.env.EXAMFORGE_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api').replace(/\/$/, '');
  try {
    const result = await fetch(base + '/' + path.join('/') + request.nextUrl.search, {
      method: request.method, body, cache: 'no-store', redirect: 'error', signal: request.signal,
      headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    });
    const headers = new Headers(privateHeaders);
    const type = result.headers.get('content-type');
    if (type) headers.set('content-type', type);
    return new Response(result.body, { status: result.status, headers });
  } catch {
    return authError('Връзката със сървъра прекъсна. Опитайте отново.', 'NETWORK', 502);
  }
}

export const GET = forward;
export const POST = forward;
export const PATCH = forward;
export const DELETE = forward;
