import styled from 'styled-components';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronLeft, faChevronRight } from '@fortawesome/free-solid-svg-icons';
import { useScrollRepeat } from './useScrollRepeat';
import { useRef } from 'react';

const ArrowButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #f8fafc;
  color: #334155;
  cursor: pointer;

  &:hover {
    background: #e2e8f0;
  }

  &:active {
    background: #cbd5e1;
  }
`;

interface ScrollArrowsProps {
  target: HTMLElement | null;
  step: number;
}

export default function ScrollArrows({ target, step }: ScrollArrowsProps) {
  const isPointerRef = useRef(false);

  const scrollLeft = () => {
    if (target) target.scrollLeft -= step;
  };
  const scrollRight = () => {
    if (target) target.scrollLeft += step;
  };

  const leftRepeat = useScrollRepeat({ onTick: scrollLeft });
  const rightRepeat = useScrollRepeat({ onTick: scrollRight });

  const bind = (tick: () => void, repeat: { start: () => void; stop: () => void }) => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      isPointerRef.current = true;
      tick();
      repeat.start();
    },
    onPointerUp: () => {
      repeat.stop();
    },
    onPointerLeave: () => {
      repeat.stop();
    },
    onClick: () => {
      if (isPointerRef.current) {
        isPointerRef.current = false;
        return;
      }
      tick();
    },
  });

  return (
    <>
      <ArrowButton
        aria-label="Scroll tabs left"
        data-testid="tab-scroll-left"
        {...bind(scrollLeft, leftRepeat)}
      >
        <FontAwesomeIcon icon={faChevronLeft} />
      </ArrowButton>
      <ArrowButton
        aria-label="Scroll tabs right"
        data-testid="tab-scroll-right"
        {...bind(scrollRight, rightRepeat)}
      >
        <FontAwesomeIcon icon={faChevronRight} />
      </ArrowButton>
    </>
  );
}
