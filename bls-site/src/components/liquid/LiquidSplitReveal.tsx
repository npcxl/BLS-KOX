import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { EASE_GLIDE } from '../../lib/motion';
import { GOO_FILTER_ID } from './GooeyFilter';

/* Geometry is tuned so the four droplets land exactly on the four buttons:
   440px rail · centres at 20 / 152 / 284 / 416 → pitch 132. */
const VB_W = 440;
const VB_H = 64;
const CY = VB_H / 2;
const R = 20;
const GAP = 132;

export interface LiquidSplitRevealProps {
  children: ReactNode[];
  /** Fires once, `delay` ms after mount. The capsule never merges back. */
  delay?: number;
  enabled?: boolean;
  className?: string;
  label?: string;
}

/**
 * One horizontal liquid capsule that stretches, forms droplets, breaks and
 * becomes N independent glass icon buttons. Plays once — it is not a menu and
 * not a speed dial; afterwards the buttons are simply there.
 */
export function LiquidSplitReveal({
  children,
  delay = 0,
  enabled = true,
  className,
  label,
}: LiquidSplitRevealProps) {
  const count = children.length;
  const [started, setStarted] = useState(!enabled);
  const [settled, setSettled] = useState(!enabled);
  const progress = useMotionValue(0);

  const drops = Array.from({ length: count }, (_, i) => (i - (count - 1) / 2) * GAP);
  const capsuleW = (count - 1) * GAP + R * 2;

  useEffect(() => {
    if (!enabled) return;
    const startTimer = window.setTimeout(() => setStarted(true), delay);
    return () => window.clearTimeout(startTimer);
  }, [delay, enabled]);

  useEffect(() => {
    if (!started || !enabled) return;
    const controls = animate(progress, 1, { duration: 0.82, ease: EASE_GLIDE });
    const settleTimer = window.setTimeout(() => setSettled(true), 560);
    return () => {
      controls.stop();
      window.clearTimeout(settleTimer);
    };
  }, [started, enabled, progress]);

  const capsuleOpacity = useTransform(progress, [0.06, 0.3], [1, 0]);
  const capsuleScaleX = useTransform(progress, [0, 0.32], [1, 0.82]);
  const neckScaleY = useTransform(progress, [0.16, 0.56], [1, 0.06]);
  const neckOpacity = useTransform(progress, [0.14, 0.24, 0.5, 0.62], [0, 1, 1, 0]);
  const dropScale = useTransform(progress, [0.02, 0.22], [0.45, 1]);
  const gooOpacity = useTransform(progress, [0.72, 1], [1, 0]);

  /* Hooks are called unconditionally (max 4 droplets) — never inside a loop. */
  const dx0 = useTransform(progress, [0.14, 0.7], [0, drops[0] ?? 0]);
  const dx1 = useTransform(progress, [0.14, 0.7], [0, drops[1] ?? 0]);
  const dx2 = useTransform(progress, [0.14, 0.7], [0, drops[2] ?? 0]);
  const dx3 = useTransform(progress, [0.14, 0.7], [0, drops[3] ?? 0]);
  const dropX = [dx0, dx1, dx2, dx3].slice(0, count);

  return (
    <div className={['lq-reveal', settled ? 'is-settled' : '', className ?? ''].filter(Boolean).join(' ')}>
      {enabled ? (
        <motion.div className="lq-reveal__goo" style={{ opacity: started ? gooOpacity : 0 }} aria-hidden="true">
          <svg viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="xMidYMid meet">
            <g style={{ filter: `url(#${GOO_FILTER_ID})` }}>
              <motion.rect
                x={(VB_W - capsuleW) / 2}
                y={CY - R}
                width={capsuleW}
                height={R * 2}
                rx={R}
                fill="#ffffff"
                style={{
                  opacity: capsuleOpacity,
                  scaleX: capsuleScaleX,
                  transformBox: 'fill-box',
                  transformOrigin: 'center',
                }}
              />
              {drops.slice(0, -1).map((target, index) => (
                <motion.rect
                  key={`neck-${index}`}
                  x={VB_W / 2 + target}
                  y={CY - R}
                  width={GAP}
                  height={R * 2}
                  fill="#ffffff"
                  style={{
                    scaleY: neckScaleY,
                    opacity: neckOpacity,
                    transformBox: 'fill-box',
                    transformOrigin: 'center',
                  }}
                />
              ))}
              {dropX.map((x, index) => (
                <motion.circle
                  key={`drop-${index}`}
                  cx={VB_W / 2}
                  cy={CY}
                  r={R}
                  fill="#ffffff"
                  style={{ x, scale: dropScale, transformBox: 'fill-box', transformOrigin: 'center' }}
                />
              ))}
            </g>
          </svg>
        </motion.div>
      ) : null}

      <div className="lq-reveal__items" role={label ? 'group' : undefined} aria-label={label}>
        {children.map((child, index) => (
          <span
            key={index}
            className="lq-reveal__item"
            style={{ transitionDelay: enabled ? `${index * 80}ms` : '0ms' }}
          >
            {child}
          </span>
        ))}
      </div>
    </div>
  );
}
