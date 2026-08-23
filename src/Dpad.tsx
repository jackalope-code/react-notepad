import styled from 'styled-components';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowUp, faArrowDown, faArrowLeft, faArrowRight } from '@fortawesome/free-solid-svg-icons';
import { useRef } from 'react';
import { useScrollRepeat } from './useScrollRepeat';

const DpadContainer = styled.div`
  position: fixed;
  bottom: 32px;
  right: 12px;
  display: grid;
  grid-template-columns: 56px 56px 56px;
  grid-template-rows: 56px 56px 56px;
  gap: 6px;
  z-index: 20;
  /* Transparent/borderless so the panel itself never obscures the
     document underneath it — only the individual buttons are visible. */
  background: transparent;
  border: none;
  border-radius: 12px;
  padding: 0;
  box-shadow: none;
`;

const DpadButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  border: 1px solid #94a3b8;
  border-radius: 10px;
  background: rgba(248, 250, 252, 0.9);
  color: #334155;
  cursor: pointer;
  font-size: 1.3rem;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
  touch-action: manipulation;

  &:hover {
    background: #e2e8f0;
  }

  &:active {
    background: #cbd5e1;
  }
`;

export type DpadDirection = 'up' | 'down' | 'left' | 'right';

interface DpadProps {
  onMove: (direction: DpadDirection) => void;
  className?: string;
  style?: React.CSSProperties;
  testId?: string;
  enabled?: Partial<Record<DpadDirection, boolean>>;
}

const ALL_ENABLED: Record<DpadDirection, boolean> = {
  up: true,
  down: true,
  left: true,
  right: true,
};

export default function Dpad({
  onMove,
  className,
  style,
  testId = 'dpad',
  enabled = ALL_ENABLED,
}: DpadProps) {
  const isPointerRef = useRef(false);
  const directionRef = useRef<DpadDirection>('up');

  const { start, stop } = useScrollRepeat({
    onTick: () => onMove(directionRef.current),
  });

  function bind(direction: DpadDirection) {
    if (enabled[direction] === false) {
      return {
        'aria-hidden': true,
        tabIndex: -1,
        disabled: true,
        style: { visibility: 'hidden' as const },
      };
    }

    return {
      'aria-label': direction,
      'data-testid': `${testId}-${direction}`,
      onPointerDown: () => {
        isPointerRef.current = true;
        directionRef.current = direction;
        onMove(direction);
        start();
      },
      onPointerUp: () => {
        stop();
      },
      onPointerLeave: () => {
        stop();
      },
      onClick: () => {
        if (isPointerRef.current) {
          isPointerRef.current = false;
          return;
        }
        directionRef.current = direction;
        onMove(direction);
      },
    };
  }

  return (
    <DpadContainer
      className={className}
      style={style}
      role="group"
      aria-label="D-pad navigation"
      data-testid={testId}
    >
      <div />
      <DpadButton {...bind('up')}>
        <FontAwesomeIcon icon={faArrowUp} />
      </DpadButton>
      <div />
      <DpadButton {...bind('left')}>
        <FontAwesomeIcon icon={faArrowLeft} />
      </DpadButton>
      <DpadButton {...bind('down')}>
        <FontAwesomeIcon icon={faArrowDown} />
      </DpadButton>
      <DpadButton {...bind('right')}>
        <FontAwesomeIcon icon={faArrowRight} />
      </DpadButton>
    </DpadContainer>
  );
}
