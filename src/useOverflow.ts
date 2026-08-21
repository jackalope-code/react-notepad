import { useEffect, useState, type RefObject } from 'react';

interface OverflowState {
  hasVerticalOverflow: boolean;
  hasHorizontalOverflow: boolean;
}

function measureOverflow(element: HTMLElement | null): OverflowState {
  if (!element) {
    return { hasVerticalOverflow: false, hasHorizontalOverflow: false };
  }
  return {
    hasVerticalOverflow: element.scrollHeight > element.clientHeight,
    hasHorizontalOverflow: element.scrollWidth > element.clientWidth,
  };
}

export function useOverflow(
  ref: RefObject<HTMLElement | null>,
  deps: unknown[] = [],
): OverflowState {
  const [overflow, setOverflow] = useState<OverflowState>({
    hasVerticalOverflow: false,
    hasHorizontalOverflow: false,
  });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const update = () => setOverflow(measureOverflow(element));

    update();

    const hasResizeObserver = typeof ResizeObserver !== 'undefined';
    const resizeObserver = hasResizeObserver ? new ResizeObserver(update) : null;
    resizeObserver?.observe(element);
    window.addEventListener('resize', update);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', update);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, ...deps]);

  return overflow;
}
