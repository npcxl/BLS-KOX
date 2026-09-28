import type { HTMLAttributes, ReactNode } from 'react';
import { usePointerHighlight } from '../../lib/pointer';

export interface LiquidPanelProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** soft = rgba(255,255,255,.55) · strong = .82 · plain = no backdrop blur */
  variant?: 'soft' | 'strong' | 'plain';
  /** Local pointer highlight (never page-wide). */
  glow?: boolean;
  /** Adds hover lift + stronger refraction. */
  interactive?: boolean;
  radius?: 'sm' | 'md' | 'lg' | 'xl' | 'pill';
  elevated?: boolean;
}

export function LiquidPanel({
  children,
  variant = 'soft',
  glow = false,
  interactive = false,
  radius = 'lg',
  elevated = false,
  className,
  ...rest
}: LiquidPanelProps) {
  const pointer = usePointerHighlight(glow);

  const classes = [
    'lq-panel',
    `lq-panel--${variant}`,
    `lq-panel--r-${radius}`,
    interactive ? 'is-interactive' : '',
    glow ? 'has-glow' : '',
    elevated ? 'is-elevated' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} {...(glow ? pointer : {})} {...rest}>
      {children}
    </div>
  );
}
