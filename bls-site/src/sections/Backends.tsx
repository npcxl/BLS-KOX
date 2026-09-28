import { Link2, ShieldCheck } from 'lucide-react';
import { BACKENDS } from '../content/site';
import { useInViewOnce, useIsCompact, usePrefersReducedMotion } from '../lib/hooks';
import { LiquidPanel } from '../components/liquid/LiquidPanel';
import { LiquidSplit } from '../components/liquid/LiquidSplit';
import { SectionHead } from '../components/common/SectionHead';

export function Backends() {
  const [ref, inView] = useInViewOnce<HTMLDivElement>('0px 0px -18% 0px', 0.2);
  const compact = useIsCompact();
  const reduceMotion = usePrefersReducedMotion();

  return (
    <section className="section backends" id="backends" aria-labelledby="backends-title">
      <div className="shell">
        <SectionHead
          eyebrow={BACKENDS.eyebrow}
          title={BACKENDS.title}
          lede={BACKENDS.lede}
          headingId="backends-title"
        />

        <div ref={ref} className="backends__split">
          <LiquidSplit trigger={inView} enabled={!compact && !reduceMotion}>
            {BACKENDS.modules.map((module) => (
              <LiquidPanel
                key={module.id}
                className="backend-card"
                variant="soft"
                interactive
                glow
                radius="xl"
              >
                <div className="backend-card__head">
                  <h3 className="backend-card__name">{module.name}</h3>
                  <span className={`chip ${module.accent === 'primary' ? 'chip--accent' : ''}`}>
                    {module.badge}
                  </span>
                </div>

                <ul className="backend-card__stack">
                  {module.stack.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>

                <ul className="backend-card__points">
                  {module.points.map((point) => (
                    <li key={point}>
                      <ShieldCheck size={14} strokeWidth={1.9} aria-hidden="true" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>

                <a className="backend-card__link" href={module.docs} target="_blank" rel="noreferrer noopener">
                  {module.id === 'koa' ? 'backend-koa.md' : module.id === 'java' ? 'backend-java.md' : 'README.md'}
                  <span aria-hidden="true">→</span>
                </a>
              </LiquidPanel>
            ))}
          </LiquidSplit>
        </div>

        <div className="backends__invariants">
          {BACKENDS.invariants.map((item) => (
            <span className="chip" key={item}>
              <Link2 size={13} strokeWidth={1.9} aria-hidden="true" />
              {item}
            </span>
          ))}
        </div>

        <p className="backends__note">
          切换后端只需调整 <span className="mono">{BACKENDS.switchNote}</span>，前端代码零改动。
        </p>
      </div>
    </section>
  );
}
