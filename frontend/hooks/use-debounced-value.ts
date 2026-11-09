'use client';

import { useEffect, useState } from 'react';

export function useDebouncedValue(value: string, delay = 220) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return settled;
}
