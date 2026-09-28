import { RELIABILITY } from '../content/site';
import { useInViewOnce, usePrefersReducedMotion } from '../lib/hooks';
import { LiquidPanel } from '../components/liquid/LiquidPanel';
import { SectionHead } from '../components/common/SectionHead';

export function Reliability() {
  const [ref, inView] = useInViewOnce<HTMLDivElement>('0px 0px -20% 0px', 0.15);
  const reduceMotion = usePrefersReducedMotion();
  const running = inView && !reduceMotion;

  return (
    <section className="section reliability" id="reliability" aria-labelledby="reliability-title">
      <div className="shell">
        <SectionHead
          eyebrow={RELIABILITY.eyebrow}
          title={RELIABILITY.title}
          lede={RELIABILITY.lede}
          headingId="reliability-title"
        />

        <div className={`reliability__flow ${running ? 'is-running' : ''}`} ref={ref}>
          {RELIABILITY.flow.map((station, index) => (
            <div className="reliability__station-wrap" key={station.id}>
              <LiquidPanel className="reliability__station" variant="soft" radius="lg" interactive glow>
                <span className="reliability__station-index mono">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="reliability__station-name">{station.name}</span>
                <span className="reliability__station-sub mono">{station.sub}</span>
              </LiquidPanel>

              {index < RELIABILITY.flow.length - 1 ? (
                <span className="reliability__link" aria-hidden="true">
                  <span className="reliability__link-line" />
                  <span className="reliability__link-dot" style={{ animationDelay: `${index * 900}ms` }} />
                </span>
              ) : null}
            </div>
          ))}
        </div>

        <div className="reliability__caps">
          {RELIABILITY.capabilities.map((item) => (
            <div className="reliability__cap" key={item.name}>
              <span className="reliability__cap-name">{item.name}</span>
              <span className="reliability__cap-detail">{item.detail}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
