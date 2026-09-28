import { AnimatePresence, motion } from 'framer-motion';
import type { ReactNode } from 'react';
import type { ArchNode } from '../../content/site';
import { spring } from '../../lib/motion';
import { LiquidNode } from './LiquidNode';

export interface SystemNodeProps {
  node: ArchNode;
  icon?: ReactNode;
  active: boolean;
  dim: boolean;
  /** Which side of the node the information area stretches out from. */
  side?: 'left' | 'right';
  onInspect: () => void;
  onRelease: () => void;
  className?: string;
  compact?: boolean;
}

/**
 * A module on the system map. Hovering it stretches a liquid connector out of
 * the node surface which then widens into an information area — never a popup.
 */
export function SystemNode({
  node,
  icon,
  active,
  dim,
  side = 'right',
  onInspect,
  onRelease,
  className,
  compact = false,
}: SystemNodeProps) {
  return (
    <LiquidNode
      shape="tile"
      accent={node.accent}
      active={active}
      dim={dim}
      className={['sn', className ?? ''].filter(Boolean).join(' ')}
      onPointerEnter={onInspect}
      onPointerLeave={onRelease}
      onFocus={onInspect}
      onBlur={onRelease}
      tabIndex={compact ? -1 : 0}
      role="group"
      aria-label={`${node.name} — ${node.caption}`}
    >
      <div className="sn__head">
        {icon ? <span className="sn__icon">{icon}</span> : null}
        <span className="sn__names">
          <span className="sn__name">{node.name}</span>
          <span className="sn__caption">{node.caption}</span>
        </span>
      </div>

      <AnimatePresence>
        {active && !compact ? (
          <motion.div
            className={`sn__panel sn__panel--${side}`}
            initial={{ opacity: 0, scaleX: 0.16, scaleY: 0.55, y: '-50%' }}
            animate={{ opacity: 1, scaleX: 1, scaleY: 1, y: '-50%' }}
            exit={{ opacity: 0, scaleX: 0.3, scaleY: 0.7, y: '-50%' }}
            transition={spring.split}
            style={{ transformOrigin: side === 'right' ? 'left center' : 'right center' }}
          >
            <span className={`sn__neck sn__neck--${side}`} aria-hidden="true" />
            <span className="sn__panel-title">{node.panel.title}</span>
            <dl className="sn__rows">
              {node.panel.rows.map((row) => (
                <div className="sn__row" key={row.k}>
                  <dt>{row.k}</dt>
                  <dd>{row.v}</dd>
                </div>
              ))}
            </dl>
            {node.panel.note ? <p className="sn__note">{node.panel.note}</p> : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </LiquidNode>
  );
}
