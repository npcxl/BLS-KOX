import { motion } from 'framer-motion';
import { spring } from '../../lib/motion';

export interface LiquidTabItem<T extends string> {
  id: T;
  label: string;
  caption?: string;
}

export interface LiquidTabsProps<T extends string> {
  items: readonly LiquidTabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  orientation?: 'vertical' | 'horizontal';
  /** Scopes the shared layoutId so two tab groups never share an indicator. */
  scope: string;
  ariaLabel?: string;
}

/**
 * Tab list where the selection indicator is a single translucent liquid block
 * that *moves* between items (shared layout), instead of each item
 * painting its own background.
 */
export function LiquidTabs<T extends string>({
  items,
  value,
  onChange,
  orientation = 'vertical',
  scope,
  ariaLabel,
}: LiquidTabsProps<T>) {
  return (
    <div
      className={`lq-tabs lq-tabs--${orientation}`}
      role="tablist"
      aria-label={ariaLabel}
      aria-orientation={orientation}
    >
      {items.map((item) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={selected}
            className={`lq-tabs__item ${selected ? 'is-selected' : ''}`}
            onClick={() => onChange(item.id)}
          >
            {selected ? (
              <motion.span
                layoutId={`${scope}-indicator`}
                className="lq-tabs__liquid"
                transition={spring.nav}
              />
            ) : null}
            <span className="lq-tabs__label">{item.label}</span>
            {item.caption ? <span className="lq-tabs__caption">{item.caption}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
