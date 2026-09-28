import { motion } from 'framer-motion';
import { TECH_STACK } from '../content/site';
import { usePointerHighlight } from '../lib/pointer';
import { EASE_GLIDE } from '../lib/motion';

function TechItem({ name, version, index }: { name: string; version: string; index: number }) {
  const pointer = usePointerHighlight(true);

  return (
    <motion.span
      className="techstrip__item"
      onPointerMove={pointer.onPointerMove}
      onPointerLeave={pointer.onPointerLeave}
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.5 }}
      transition={{
        duration: 0.55,
        delay: index * 0.028,
        ease: EASE_GLIDE as unknown as [number, number, number, number],
      }}
    >
      <span className="techstrip__sheen" aria-hidden="true" />
      <span className="techstrip__name">{name}</span>
      <span className="techstrip__version">{version}</span>
    </motion.span>
  );
}

export function TechStrip() {
  return (
    <section className="section section--tight techstrip" aria-labelledby="techstack-title">
      <div className="shell">
        <div className="techstrip__head">
          <p className="eyebrow">Technology</p>
          <h2 className="techstrip__title" id="techstack-title">
            Every layer is a choice. The API contract is the only fixed point.
          </h2>
        </div>

        <div className="techstrip__rail">
          <span className="techstrip__track" aria-hidden="true" />
          <div className="techstrip__items">
            {TECH_STACK.map((tech, index) => (
              <TechItem key={tech.name} name={tech.name} version={tech.version} index={index} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
