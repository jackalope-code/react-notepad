import { useEffect, useState, type RefObject } from 'react';

const DEFAULT_LINE_HEIGHT = 20;

export function useMeasuredLineHeight(ref: RefObject<HTMLElement | null>): number {
  const [lineHeight, setLineHeight] = useState(DEFAULT_LINE_HEIGHT);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const probe = document.createElement('span');
    probe.textContent = 'M';
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    probe.style.whiteSpace = 'pre';
    const computed = window.getComputedStyle(element);
    probe.style.font = computed.font;
    document.body.appendChild(probe);
    const measured = probe.getBoundingClientRect().height;
    document.body.removeChild(probe);

    setLineHeight(measured > 0 ? measured : DEFAULT_LINE_HEIGHT);
  }, [ref]);

  return lineHeight;
}
