import { useEffect, useState } from 'react';

function getIsTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof window.matchMedia === 'function') {
    return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  }
  if ('ontouchstart' in window) return true;
  if (navigator.maxTouchPoints > 0) return true;
  return false;
}

export function useIsTouchDevice(): boolean {
  const [isTouch, setIsTouch] = useState(getIsTouchDevice);

  useEffect(() => {
    setIsTouch(getIsTouchDevice());
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const query = window.matchMedia('(hover: none) and (pointer: coarse)');
    const handleChange = (event: MediaQueryListEvent) => {
      setIsTouch(event.matches);
    };
    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }, []);

  return isTouch;
}
