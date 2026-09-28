import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { EASE_GLIDE } from '../../lib/motion';
import { GooDefs } from './GooeyFilter';

/* ---------------------------------------------------------------------------
 * Geometry (viewBox units). The liquid spans the full card row; the three
 * droplets settle at the three column centres (1/6, 1/2, 5/6 of 1200) so the
 * droplets land on top of the three cards that then materialise.
 * ------------------------------------------------------------------------- */
const VB_W = 1200;
const VB_H = 170;
const CY = VB_H / 2;
const R = 58;
const DROP_X = [-400, 0, 400];
const GAP = 400;
const CAPSULE_W = 960;

/** Visible, translucent liquid fill — light blue on the light page background. */
const FILL = '#b9d4ff';

export interface LiquidSplitProps {
  children: ReactNode;
  /** Fires once when the section scrolls into view. */
  trigger: boolean;
  /** false (reduced motion / compact viewport) → show the cards immediately. */
  enabled?: boolean;
  className?: string;
}

/**
 * One wide liquid capsule → internal tension → the necks thin → it breaks into
 * three independent glass cards. Runs once and never merges back. Everything —
 * geometry and the final cards — is driven by the single `progress` value, so
 * the swap is synchronised with the actual animation, not a guessed timeout.
 */
export function LiquidSplit({ children, trigger, enabled = true, className }: LiquidSplitProps) {
  const [done, setDone] = useState(!enabled);
  const ranOnce = useRef(false);
  const progress = useMotionValue(enabled ? 0 : 1);

  useEffect(() => {
    if (!enabled) {
      setDone(true);
      progress.set(1);
      return;
    }
    if (ranOnce.current || !trigger) return;
    ranOnce.current = true;
    setDone(false);
    const controls = animate(progress, 1, {
      duration: 1.05,
      ease: EASE_GLIDE,
      onComplete: () => setDone(true),
    });
    return () => controls.stop();
  }, [trigger, enabled, progress]);

  const capsuleOpacity = useTransform(progress, [0.16, 0.34], [1, 0]);
  const capsuleScaleX = useTransform(progress, [0.1, 0.36], [1, 0.9]);
  const neckScaleY = useTransform(progress, [0.2, 0.62], [1, 0.05]);
  const neckOpacity = useTransform(progress, [0.18, 0.3, 0.55, 0.68], [0, 1, 1, 0]);
  const dropScale = useTransform(progress, [0.06, 0.26, 0.66, 0.82, 1], [0.4, 1, 1, 1.035, 1]);
  const gooOpacity = useTransform(progress, [0.8, 0.98], [1, 0]);

  const dx0 = useTransform(progress, [0.18, 0.72], [0, DROP_X[0]]);
  const dx1 = useTransform(progress, [0.18, 0.72], [0, DROP_X[1]]);
  const dx2 = useTransform(progress, [0.18, 0.72], [0, DROP_X[2]]);
  const dropX = [dx0, dx1, dx2];

  const so0 = useTransform(progress, [0.56, 0.76], [0, 1]);
  const so1 = useTransform(progress, [0.6, 0.8], [0, 1]);
  const so2 = useTransform(progress, [0.64, 0.84], [0, 1]);
  const slotOpacity = [so0, so1, so2];
  const slotScale = useTransform(progress, [0.52, 0.88], [0.94, 1]);

  const slots = Array.isArray(children) ? children : [children];
  const showGoo = enabled && !done;

  return (
    <div className={['lq-split', done ? 'is-done' : '', className ?? ''].filter(Boolean).join(' ')}>
      {showGoo ? (
        <motion.div className="lq-split__goo" style={{ opacity: gooOpacity }} aria-hidden="true">
          <svg
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            preserveAspectRatio="none"
            style={{ width: '100%', height: '100%' }}
          >
            <GooDefs id="bls-split-goo" />
            <g style={{ filter: 'url(#bls-split-goo)' }}>
              <motion.rect
                x={(VB_W - CAPSULE_W) / 2}
                y={CY - R}
                width={CAPSULE_W}
                height={R * 2}
                rx={R}
                fill={FILL}
                style={{
                  opacity: capsuleOpacity,
                  scaleX: capsuleScaleX,
                  transformBox: 'fill-box',
                  transformOrigin: 'center',
                }}
              />

              {DROP_X.slice(0, -1).map((target, index) => (
                <motion.rect
                  key={`neck-${index}`}
                  x={VB_W / 2 + target}
                  y={CY - R}
                  width={GAP}
                  height={R * 2}
                  fill={FILL}
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
                  fill={FILL}
                  style={{ x, scale: dropScale, transformBox: 'fill-box', transformOrigin: 'center' }}
                />
              ))}
            </g>
          </svg>
        </motion.div>
      ) : null}

      <div className="lq-split__outputs">
        {slots.map((slot, index) => (
          <motion.div
            key={index}
            className="lq-split__slot"
            style={{
              opacity: enabled ? slotOpacity[index] ?? so0 : 1,
              scale: enabled ? slotScale : 1,
            }}
          >
            {slot}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
