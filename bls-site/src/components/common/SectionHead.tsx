import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { EASE_GLIDE } from '../../lib/motion';

export interface SectionHeadProps {
  eyebrow: string;
  title: string;
  lede?: string;
  align?: 'start' | 'center';
  children?: ReactNode;
  /** Renders the title with real line breaks instead of one long line. */
  headingId?: string;
}

/** Shared section header: eyebrow → large heading → short engineering description. */
export function SectionHead({
  eyebrow,
  title,
  lede,
  align = 'start',
  children,
  headingId,
}: SectionHeadProps) {
  const lines = title.split('\n');

  return (
    <div className={`section-head ${align === 'center' ? 'section-head--center' : ''}`}>
      <motion.p
        className="eyebrow"
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.6 }}
        transition={{ duration: 0.6, ease: EASE_GLIDE as unknown as [number, number, number, number] }}
      >
        {eyebrow}
      </motion.p>

      <motion.h2
        id={headingId}
        className="h2"
        initial={{ opacity: 0, y: 16, clipPath: 'inset(0 0 26% 0)' }}
        whileInView={{ opacity: 1, y: 0, clipPath: 'inset(0 0 0% 0)' }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ duration: 0.8, ease: EASE_GLIDE as unknown as [number, number, number, number] }}
      >
        {lines.map((line, index) => (
          <span key={index} className="h2__line">
            {line}
          </span>
        ))}
      </motion.h2>

      {lede ? (
        <motion.p
          className="lede"
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{
            duration: 0.75,
            delay: 0.08,
            ease: EASE_GLIDE as unknown as [number, number, number, number],
          }}
        >
          {lede}
        </motion.p>
      ) : null}

      {children}
    </div>
  );
}
