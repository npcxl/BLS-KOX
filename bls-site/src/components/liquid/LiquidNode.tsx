import type { HTMLAttributes, ReactNode } from 'react';
import { usePointerHighlight } from '../../lib/pointer';

export interface LiquidNodeProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  children?: ReactNode;
  /** The node currently being inspected — grows slightly, refraction strengthens. */
  active?: boolean;
  /** Another node is active and this one is not connected to it. */
  dim?: boolean;
  accent?: boolean;
  shape?: 'capsule' | 'tile';
  glow?: boolean;
}

/** Small system module / glass capsule used across the architecture, memory and deployment maps. */
export function LiquidNode({
  children,
  active = false,
  dim = false,
  accent = false,
  shape = 'tile',
  glow = true,
  className,
  ...rest
}: LiquidNodeProps) {
  const pointer = usePointerHighlight(glow);

  const classes = [
    'lq-node',
    `lq-node--${shape}`,
    active ? 'is-active' : '',
    dim ? 'is-dim' : '',
    accent ? 'is-accent' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} {...(glow ? pointer : {})} {...rest}>
      <span className="lq-node__edge" aria-hidden="true" />
      {children}
    </div>
  );
}
