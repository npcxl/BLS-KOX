import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Check } from 'lucide-react';
import { SECURITY } from '../content/site';
import { usePrefersReducedMotion } from '../lib/hooks';
import { CoreGlyph } from '../components/SystemCore';
import { SectionHead } from '../components/common/SectionHead';

gsap.registerPlugin(ScrollTrigger);

/** Outermost → innermost. Layer 01 is the first gate a request meets. */
const INSETS = [1.5, 10.5, 19.5, 28.5, 37.5, 46.5];

export function Security() {
  const scopeRef = useRef<HTMLDivElement>(null);
  const ringRefs = useRef<(HTMLDivElement | null)[]>([]);
  const labelRefs = useRef<(HTMLLIElement | null)[]>([]);
  const coreRef = useRef<HTMLDivElement>(null);
  const reduceMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (reduceMotion) return;
    const scope = scopeRef.current;
    if (!scope) return;

    const ctx = gsap.context(() => {
      const rings = ringRefs.current.filter((el): el is HTMLDivElement => Boolean(el));
      const labels = labelRefs.current.filter((el): el is HTMLLIElement => Boolean(el));
      if (!rings.length) return;

      gsap.set([...rings, ...labels], { opacity: 0 });

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: scope,
          start: 'top 76%',
          end: 'bottom 58%',
          scrub: 0.6,
        },
      });

      rings.forEach((ring, index) => {
        tl.fromTo(
          ring,
          { opacity: 0, scale: 1.07, y: 12 },
          { opacity: 1, scale: 1, y: 0, duration: 1, ease: 'power2.out' },
          index * 0.62,
        );
        const label = labels[index];
        if (label) {
          tl.fromTo(
            label,
            { opacity: 0, x: -12 },
            { opacity: 1, x: 0, duration: 0.6, ease: 'power2.out' },
            index * 0.62 + 0.32,
          );
        }
      });

      if (coreRef.current) {
        gsap.fromTo(
          coreRef.current,
          { opacity: 0.35, scale: 0.9 },
          {
            opacity: 1,
            scale: 1,
            duration: 1.2,
            ease: 'power2.out',
            scrollTrigger: { trigger: scope, start: 'top 82%', end: 'top 45%', scrub: 0.8 },
          },
        );
      }
    }, scope);

    return () => ctx.revert();
  }, [reduceMotion]);

  return (
    <section className="section security" id="security" aria-labelledby="security-title">
      <div className="shell">
        <SectionHead
          eyebrow={SECURITY.eyebrow}
          title={SECURITY.title}
          lede={SECURITY.lede}
          headingId="security-title"
        />

        <div className="security__stage" ref={scopeRef}>
          <div className="security__stack" aria-hidden="true">
            {INSETS.map((inset, index) => (
              <div
                key={SECURITY.layers[index].id}
                className="security__ring"
                style={{ inset: `${inset}%`, zIndex: 20 - index }}
                ref={(el) => {
                  ringRefs.current[index] = el;
                }}
              >
                <span className="security__ring-corner" />
              </div>
            ))}

            <div className="security__core" ref={coreRef}>
              <CoreGlyph />
            </div>
          </div>

          <ol className="security__layers">
            {SECURITY.layers.map((layer, index) => (
              <li
                className="security__layer"
                key={layer.id}
                ref={(el) => {
                  labelRefs.current[index] = el;
                }}
              >
                <span className="security__index">{layer.index}</span>
                <span className="security__layer-body">
                  <span className="security__layer-name">{layer.name}</span>
                  <span className="security__layer-summary">{layer.summary}</span>
                  <span className="security__layer-detail">{layer.detail}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div className="security__capabilities">
          {SECURITY.capabilities.map((item) => (
            <span className="chip" key={item}>
              <Check size={13} strokeWidth={2.2} aria-hidden="true" />
              {item}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
