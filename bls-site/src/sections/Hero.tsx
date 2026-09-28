import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { ArrowRight, BookOpen, Github, Play, Terminal } from 'lucide-react';
import { HERO, LINKS } from '../content/site';
import { EASE_GLIDE } from '../lib/motion';
import { useIsCompact, usePrefersReducedMotion } from '../lib/hooks';
import { LiquidButton } from '../components/liquid/LiquidButton';
import { LiquidIconButton } from '../components/liquid/LiquidIconButton';
import { LiquidSplitReveal } from '../components/liquid/LiquidSplitReveal';
import { SystemCore } from '../components/SystemCore';

const reveal = (delay: number) => ({
  initial: { opacity: 0, y: 18, clipPath: 'inset(0 0 30% 0)' },
  animate: { opacity: 1, y: 0, clipPath: 'inset(0 0 0% 0)' },
  transition: {
    duration: 0.8,
    delay,
    ease: EASE_GLIDE as unknown as [number, number, number, number],
  },
});

const QUICK_ICONS = [
  { id: 'docs', icon: <BookOpen size={17} strokeWidth={1.9} /> },
  { id: 'github', icon: <Github size={17} strokeWidth={1.9} /> },
  { id: 'demo', icon: <Play size={17} strokeWidth={1.9} /> },
  { id: 'deploy', icon: <Terminal size={17} strokeWidth={1.9} /> },
] as const;

export function Hero() {
  const heroRef = useRef<HTMLElement>(null);
  const reduceMotion = usePrefersReducedMotion();
  const compact = useIsCompact();

  /* Scroll continuity: the System Core shrinks and hands over to the
     architecture map instead of simply disappearing. */
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const coreScale = useTransform(scrollYProgress, [0, 1], [1, 0.66]);
  const coreOpacity = useTransform(scrollYProgress, [0, 0.9], [1, 0.12]);
  const copyY = useTransform(scrollYProgress, [0, 1], [0, -34]);
  const copyOpacity = useTransform(scrollYProgress, [0, 0.75], [1, 0.25]);

  return (
    <section className="hero" id="overview" ref={heroRef} aria-labelledby="hero-title">
      <div className="hero__grid shell shell-wide">
        <motion.div className="hero__copy" style={{ y: copyY, opacity: copyOpacity }}>
          <motion.p className="eyebrow hero__eyebrow" {...reveal(0.1)}>
            {HERO.eyebrow}
          </motion.p>

          <motion.h1 id="hero-title" className="hero__title" {...reveal(0.16)}>
            {HERO.title}
          </motion.h1>

          <div className="hero__subtitle">
            {HERO.subtitle.map((line, index) => (
              <motion.span key={line} className="hero__subtitle-line" {...reveal(0.26 + index * 0.09)}>
                {line}
              </motion.span>
            ))}
          </div>

          <motion.p className="hero__desc" {...reveal(0.56)}>
            {HERO.description}
          </motion.p>

          <motion.div className="hero__actions" {...reveal(0.66)}>
            <LiquidButton
              variant="primary"
              size="lg"
              href={HERO.primaryCta.href}
              external
              trailingIcon={<ArrowRight size={16} strokeWidth={2.1} />}
            >
              {HERO.primaryCta.label}
            </LiquidButton>
            <LiquidButton
              variant="glass"
              size="lg"
              href={HERO.secondaryCta.href}
              external
              leadingIcon={<Github size={17} strokeWidth={1.9} />}
            >
              {HERO.secondaryCta.label}
            </LiquidButton>
          </motion.div>

          <motion.div className="hero__quick" {...reveal(0.82)}>
            <LiquidSplitReveal
              delay={1450}
              enabled={!compact && !reduceMotion}
              label="快捷入口"
            >
              {HERO.quickActions.map((action, index) => (
                <LiquidIconButton
                  key={action.id}
                  icon={QUICK_ICONS[index].icon}
                  label={action.label}
                  href={action.href}
                  external={action.id !== 'docs'}
                  size="md"
                  className="hero__quick-btn"
                />
              ))}
            </LiquidSplitReveal>
          </motion.div>

          <motion.div className="hero__stack" {...reveal(0.92)}>
            {HERO.stack.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </motion.div>
        </motion.div>

        <motion.div className="hero__visual" style={{ scale: coreScale, opacity: coreOpacity }}>
          <SystemCore />
        </motion.div>
      </div>

      <motion.div
        className="hero__footnote"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.9, delay: 1.2 }}
      >
        <span className="hero__footnote-line" />
        <span>
          开源自 <a href={LINKS.github} target="_blank" rel="noreferrer noopener">GitHub</a> · 许可 Mulan PSL v2
        </span>
      </motion.div>
    </section>
  );
}
