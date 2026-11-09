export class ApiError extends Error {
  constructor(message: string, public code: string, public fields: { path: string; message: string }[] = []) {
    super(message);
  }
}

export function message(error: unknown) {
  return error instanceof ApiError ? error.message : 'Възникна грешка. Опитайте отново.';
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { ...options, cache: 'no-store',
      headers: options.body == null ? {} : { 'Content-Type': 'application/json' } });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ApiError('Връзката със сървъра прекъсна. Опитайте отново.', 'NETWORK');
  }
  if (response.status === 204) return undefined as T;
  const result = await response.json().catch(() => null);
  if (!result || !response.ok) {
    throw new ApiError(result?.error?.message ?? 'Сървърът върна неочакван отговор.',
      result?.error?.code ?? 'HTTP', result?.error?.fields);
  }
  return result.data as T;
}

export const api = <T>(path: string, options?: RequestInit) => request<T>('/api' + path, options);

export function write(method: 'POST' | 'PATCH' | 'DELETE', value?: unknown): RequestInit {
  return { method, body: value === undefined ? undefined : JSON.stringify(value) };
}
