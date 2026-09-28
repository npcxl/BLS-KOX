import { useId, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { spring } from '../../lib/motion';

export interface LiquidTooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom';
  delay?: number;
  className?: string;
}

/** Glass tooltip. Appears with a spring, no sudden popup. */
export function LiquidTooltip({
  content,
  children,
  side = 'top',
  delay = 120,
  className,
}: LiquidTooltipProps) {
  const [open, setOpen] = useState(false);
  const [timer, setTimer] = useState<number | undefined>(undefined);
  const id = useId();

  const show = () => {
    window.clearTimeout(timer);
    setTimer(window.setTimeout(() => setOpen(true), delay));
  };
  const hide = () => {
    window.clearTimeout(timer);
    setOpen(false);
  };

  return (
    <span
      className={['lq-tip', className ?? ''].filter(Boolean).join(' ')}
      onPointerEnter={show}
      onPointerLeave={hide}
      onFocus={show}
      onBlur={hide}
      aria-describedby={open ? id : undefined}
    >
      {children}
      <AnimatePresence>
        {open ? (
          <motion.span
            id={id}
            role="tooltip"
            className={`lq-tip__bubble lq-tip__bubble--${side}`}
            initial={{ opacity: 0, scale: 0.94, y: side === 'top' ? 5 : -5, x: '-50%' }}
            animate={{ opacity: 1, scale: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, scale: 0.97, y: side === 'top' ? 3 : -3, x: '-50%' }}
            transition={spring.hover}
          >
            {content}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </span>
  );
}
