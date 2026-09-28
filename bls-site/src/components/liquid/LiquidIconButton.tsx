import type { ReactNode } from 'react';
import { usePointerHighlight } from '../../lib/pointer';

export interface LiquidIconButtonProps {
  icon: ReactNode;
  href?: string;
  label: string;
  onClick?: () => void;
  size?: 'sm' | 'md' | 'lg';
  external?: boolean;
  className?: string;
}

/** Square glass icon button used by the nav and the hero action row. */
export function LiquidIconButton({
  icon,
  href,
  label,
  onClick,
  size = 'md',
  external = false,
  className,
}: LiquidIconButtonProps) {
  const pointer = usePointerHighlight(true);
  const classes = ['lq-iconbtn', `lq-iconbtn--${size}`, className ?? ''].filter(Boolean).join(' ');

  if (href) {
    return (
      <a
        className={classes}
        href={href}
        aria-label={label}
        title={label}
        onPointerMove={pointer.onPointerMove}
        onPointerLeave={pointer.onPointerLeave}
        {...(external ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
      >
        <span className="lq-iconbtn__sheen" aria-hidden="true" />
        {icon}
      </a>
    );
  }

  return (
    <button
      type="button"
      className={classes}
      aria-label={label}
      title={label}
      onClick={onClick}
      onPointerMove={pointer.onPointerMove}
      onPointerLeave={pointer.onPointerLeave}
    >
      <span className="lq-iconbtn__sheen" aria-hidden="true" />
      {icon}
    </button>
  );
}
