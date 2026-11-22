'use client';

import { useEffect, useState } from 'react';
import { skipToken, useQuery } from '@tanstack/react-query';
import { api, message } from '@/lib/api';

export function useResource<T>(path: string | null, refreshSharedContent = false) {
  const resource = useQuery({
    queryKey: [path?.split(/[/?]/)[1], path],
    queryFn: path === null ? skipToken : ({ signal }) => api<T>(path, { signal }),
    ...(refreshSharedContent && {
      staleTime: 0,
      refetchOnWindowFocus: true,
      refetchInterval: 30_000,
    }),
  });
  return {
    data: resource.data,
    error: resource.error ? message(resource.error) : undefined,
    reload: () => { void resource.refetch(); },
  };
}

// The simulator uses the server clock and the last saved answers on each visit.
export function useLiveResource<T>(path: string) {
  const [version, setVersion] = useState(0);
  const key = path + ':' + version;
  const [settled, setSettled] = useState<{ key: string; value?: T; error?: string }>();
  useEffect(() => {
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
