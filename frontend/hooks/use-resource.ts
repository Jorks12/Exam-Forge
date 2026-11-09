'use client';

import { useEffect, useState } from 'react';
import { api, message } from '@/lib/api';

export function useResource<T>(path: string | null) {
  const [version, setVersion] = useState(0);
  const key = path + ':' + version;
  const [settled, setSettled] = useState<{ key: string; value?: T; error?: string }>();
  useEffect(() => {
    if (path === null) return;
    const abort = new AbortController();
    api<T>(path, { signal: abort.signal })
      .then(value => { if (!abort.signal.aborted) setSettled({ key, value }); })
      .catch(error => { if (!abort.signal.aborted) setSettled({ key, error: message(error) }); });
    return () => abort.abort();
  }, [key, path]);
  return {
    data: settled?.key === key ? settled.value : undefined,
    error: settled?.key === key ? settled.error : undefined,
    reload: () => setVersion(value => value + 1),
  };
}
