import { useEffect, useState, type RefObject } from 'react';

const DEFAULT_CHAR_WIDTH = 10;
const CHAR_PROBE = '0';

export function useMeasuredCharWidth(ref: RefObject<HTMLElement | null>): number {
  const [charWidth, setCharWidth] = useState(DEFAULT_CHAR_WIDTH);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const probe = document.createElement('span');
    probe.textContent = CHAR_PROBE;
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    probe.style.whiteSpace = 'pre';
    const computed = window.getComputedStyle(element);
    probe.style.font = computed.font;
    document.body.appendChild(probe);
    const measured = probe.getBoundingClientRect().width;
    document.body.removeChild(probe);

    setCharWidth(measured > 0 ? measured : DEFAULT_CHAR_WIDTH);
  }, [ref]);

  return charWidth;
}
