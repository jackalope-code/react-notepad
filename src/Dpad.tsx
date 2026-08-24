import styled from 'styled-components';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowUp, faArrowDown, faArrowLeft, faArrowRight } from '@fortawesome/free-solid-svg-icons';
import { useRef } from 'react';
import { useScrollRepeat } from './useScrollRepeat';

const DPAD_GAP = 6;
const DPAD_BUTTON_SIZE = 48;

const DpadContainer = styled.div`
  position: fixed;
  bottom: max(240px, 35vh, env(safe-area-inset-bottom, 0px));
  right: max(8px, env(safe-area-inset-right, 0px));
  display: grid;
  grid-template-columns: ${DPAD_BUTTON_SIZE}px ${DPAD_BUTTON_SIZE}px ${DPAD_BUTTON_SIZE}px;
  grid-template-rows: ${DPAD_BUTTON_SIZE}px ${DPAD_BUTTON_SIZE}px ${DPAD_BUTTON_SIZE}px;
  gap: ${DPAD_GAP}px;
  z-index: 20;
  /* Transparent/borderless so the panel itself never obscures the
     document underneath it — only the individual buttons are visible. */
  background: transparent;
  border: none;
  border-radius: 12px;
  padding: 0;
  box-shadow: none;
  /* Keep the D-pad from pushing or clipping on small viewports. */
  max-width: calc(100vw - max(8px, env(safe-area-inset-right, 0px)) - 4px);
  box-sizing: border-box;
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
  font-size: 1.2rem;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
  touch-action: none;

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
      onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
        // Prevent the button from stealing focus from the editor; the editor
        // already restores focus inside its onMove handler.
        event.preventDefault();
        event.stopPropagation();
        isPointerRef.current = true;
        directionRef.current = direction;
        onMove(direction);
        start();
      },
      onPointerUp: (event: React.PointerEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        stop();
      },
      onPointerLeave: (event: React.PointerEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        stop();
      },
      onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.stopPropagation();
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
