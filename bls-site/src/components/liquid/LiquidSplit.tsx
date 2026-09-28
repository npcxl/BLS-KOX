import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { EASE_GLIDE } from '../../lib/motion';
import { GOO_FILTER_ID } from './GooeyFilter';

/* ---------------------------------------------------------------------------
 * Geometry of the goo layer (viewBox units).
 * One wide capsule → internal tension → the neck thins → three droplets break.
 * ------------------------------------------------------------------------- */
const VB_W = 1200;
const VB_H = 140;
const CY = VB_H / 2;
const R = 46;
const CAPSULE_W = 640;
const DROP_X = [-390, 0, 390];

export interface LiquidSplitProps {
  children: ReactNode;
  /** Flip to true (once) when the section scrolls into view. */
  trigger: boolean;
  /** false → reduced motion / compact viewport: no gooey filter, straight to the result. */
  enabled?: boolean;
  className?: string;
}

export function LiquidSplit({ children, trigger, enabled = true, className }: LiquidSplitProps) {
  const [revealed, setRevealed] = useState(!enabled);
  const progress = useMotionValue(0);

  useEffect(() => {
    if (!trigger) return;
    if (!enabled) {
      setRevealed(true);
      return;
    }
    const controls = animate(progress, 1, { duration: 0.95, ease: EASE_GLIDE });
    const revealTimer = window.setTimeout(() => setRevealed(true), 560);
    return () => {
      controls.stop();
      window.clearTimeout(revealTimer);
    };
  }, [trigger, enabled, progress]);

  /* --- capsule --- */
  const capsuleOpacity = useTransform(progress, [0.08, 0.3], [1, 0]);
  const capsuleScaleX = useTransform(progress, [0, 0.32], [1, 0.86]);

  /* --- droplets --- */
  const dropX0 = useTransform(progress, [0.16, 0.74], [0, DROP_X[0]]);
  const dropX1 = useTransform(progress, [0.16, 0.74], [0, DROP_X[1]]);
  const dropX2 = useTransform(progress, [0.16, 0.74], [0, DROP_X[2]]);
  const dropScale = useTransform(progress, [0.02, 0.24], [0.5, 1]);

  /* --- necks between the droplets --- */
  const neckScaleY = useTransform(progress, [0.18, 0.6], [1, 0.045]);
  const neckOpacity = useTransform(progress, [0.16, 0.26, 0.52, 0.64], [0, 0.95, 0.95, 0]);

  /* --- the whole goo layer dissolves as the glass modules settle in --- */
  const gooOpacity = useTransform(progress, [0.74, 1], [1, 0]);
  const gooSettle = useTransform(progress, [0.6, 0.86, 1], [1.03, 1.008, 1]);

  const drops = [dropX0, dropX1, dropX2];

  return (
    <div className={[`lq-split ${revealed ? 'is-revealed' : ''}`, className ?? ''].filter(Boolean).join(' ')}>
      {enabled ? (
        <motion.div className="lq-split__goo" style={{ opacity: gooOpacity }} aria-hidden="true">
          <motion.svg
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            preserveAspectRatio="none"
            style={{ filter: `url(#${GOO_FILTER_ID})`, scale: gooSettle }}
          >
            {/* the original capsule */}
            <motion.rect
              x={(VB_W - CAPSULE_W) / 2}
              y={CY - R}
              width={CAPSULE_W}
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

            {/* necks: full height while merged, thinned to a hairline before breaking */}
            {[
              { x: VB_W / 2 + DROP_X[0], w: -DROP_X[0] },
              { x: VB_W / 2, w: DROP_X[2] },
            ].map((neck, index) => (
              <motion.rect
                key={`neck-${index}`}
                x={neck.x}
                y={CY - R}
                width={neck.w}
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

            {/* the three droplets */}
            {drops.map((x, index) => (
              <motion.circle
                key={`drop-${index}`}
                cx={VB_W / 2}
                cy={CY}
                r={R}
                fill="#ffffff"
                style={{ x, scale: dropScale, transformBox: 'fill-box', transformOrigin: 'center' }}
              />
            ))}
          </motion.svg>
        </motion.div>
      ) : null}

      <div className="lq-split__outputs">
        {Array.isArray(children)
          ? children.map((child, index) => (
              <div
                key={index}
                className="lq-split__slot"
                style={{ transitionDelay: enabled ? `${index * 90}ms` : '0ms' }}
              >
                {child}
              </div>
            ))
          : children}
      </div>
    </div>
  );
}
