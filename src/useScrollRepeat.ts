import { useCallback, useRef } from 'react';

interface UseScrollRepeatOptions {
  onTick: () => void;
  initialDelay?: number;
  slowDelay?: number;
  fastDelay?: number;
  rampAt?: number;
  maxAt?: number;
}

export function useScrollRepeat({
  onTick,
  initialDelay = 300,
  slowDelay = 150,
  fastDelay = 38,
  rampAt = 3000,
  maxAt = 6000,
}: UseScrollRepeatOptions) {
  const timeoutRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  const cancel = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const schedule = useCallback(() => {
    const elapsed = Date.now() - startTimeRef.current;
    const delay = elapsed < rampAt ? slowDelay : elapsed < maxAt ? slowDelay / 2 : fastDelay;
    timeoutRef.current = window.setTimeout(() => {
      onTick();
      schedule();
    }, Math.max(20, Math.floor(delay)));
  }, [onTick, slowDelay, fastDelay, rampAt, maxAt]);

  const start = useCallback(() => {
    cancel();
    startTimeRef.current = Date.now();
    timeoutRef.current = window.setTimeout(() => {
      onTick();
      schedule();
    }, initialDelay);
  }, [cancel, initialDelay, onTick, schedule]);

  const stop = useCallback(() => {
    cancel();
  }, [cancel]);

  return { start, stop };
}
