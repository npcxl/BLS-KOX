import type { ReactNode } from 'react';
import { usePointerHighlight } from '../../lib/pointer';

export interface LiquidButtonProps {
  children: ReactNode;
  href?: string;
  onClick?: () => void;
  /** primary = brand filled · glass = liquid glass surface · ghost = text only */
  variant?: 'primary' | 'glass' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  external?: boolean;
  className?: string;
  ariaLabel?: string;
  type?: 'button' | 'submit';
}

/**
 * Glass button: pointer highlight travels inside the control, hover lifts 1px,
 * press compresses to 0.97. Never scales up.
 */
export function LiquidButton({
  children,
  href,
  onClick,
  variant = 'glass',
  size = 'md',
  leadingIcon,
  trailingIcon,
  external = false,
  className,
  ariaLabel,
  type = 'button',
}: LiquidButtonProps) {
  const pointer = usePointerHighlight(true);
  const classes = [
    'lq-btn',
    `lq-btn--${variant}`,
    `lq-btn--${size}`,
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const body = (
    <>
      <span className="lq-btn__sheen" aria-hidden="true" />
      <span className="lq-btn__sheen lq-btn__sheen--trail" aria-hidden="true" />
      {leadingIcon ? <span className="lq-btn__icon">{leadingIcon}</span> : null}
      <span className="lq-btn__label">{children}</span>
      {trailingIcon ? <span className="lq-btn__icon">{trailingIcon}</span> : null}
    </>
  );

  if (href) {
    return (
      <a
        className={classes}
        href={href}
        aria-label={ariaLabel}
        onPointerMove={pointer.onPointerMove}
        onPointerLeave={pointer.onPointerLeave}
        {...(external ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
      >
        {body}
      </a>
    );
  }

  return (
    <button
      type={type}
      className={classes}
      aria-label={ariaLabel}
      onClick={onClick}
      onPointerMove={pointer.onPointerMove}
      onPointerLeave={pointer.onPointerLeave}
    >
      {body}
    </button>
  );
}
