import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FEATURES, FEATURE_CATEGORIES } from '../content/site';
import type { FeatureItem } from '../content/site';
import { EASE_GLIDE, spring } from '../lib/motion';
import { LiquidTabs } from '../components/liquid/LiquidTabs';
import { LiquidPanel } from '../components/liquid/LiquidPanel';
import { SectionHead } from '../components/common/SectionHead';

type CategoryId = (typeof FEATURE_CATEGORIES)[number]['id'];

export function Features() {
  const [category, setCategory] = useState<CategoryId>('foundation');

  const current = useMemo(
    () => FEATURE_CATEGORIES.find((item) => item.id === category) ?? FEATURE_CATEGORIES[0],
    [category],
  );

  const tabs = useMemo(
    () => FEATURE_CATEGORIES.map((item) => ({ id: item.id, label: item.label, caption: item.caption })),
    [],
  );

  return (
    <section className="section features" id="features" aria-labelledby="features-title">
      <div className="shell">
        <SectionHead
          eyebrow={FEATURES.eyebrow}
          title={FEATURES.title}
          lede={FEATURES.lede}
          headingId="features-title"
        />

        <div className="features__explorer">
          <div className="features__rail">
            <LiquidTabs
              items={tabs}
              value={category}
              onChange={(id) => setCategory(id as CategoryId)}
              scope="features"
              ariaLabel="能力分类"
            />
          </div>

          <div className="features__stage">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={current.id}
                className="features__panel"
                initial={{ opacity: 0, clipPath: 'inset(0 0 42% 0)', scale: 0.985 }}
                animate={{ opacity: 1, clipPath: 'inset(0 0 0% 0)', scale: 1 }}
                exit={{ opacity: 0, clipPath: 'inset(24% 0 24% 0)', scale: 0.99 }}
                transition={{ duration: 0.52, ease: EASE_GLIDE as unknown as [number, number, number, number] }}
              >
                <motion.div
                  className="features__grid"
                  initial="hidden"
                  animate="show"
                  variants={{ hidden: {}, show: { transition: { staggerChildren: 0.055 } } }}
                >
                  {current.items.map((item: FeatureItem) => (
                    <motion.div
                      key={item.name}
                      variants={{
                        hidden: { opacity: 0, y: 14, scale: 0.985 },
                        show: { opacity: 1, y: 0, scale: 1, transition: spring.hover },
                      }}
                    >
                      <LiquidPanel className="feature-card" variant="soft" interactive glow radius="lg">
                        <h3 className="feature-card__name">{item.name}</h3>
                        <p className="feature-card__blurb">{item.blurb}</p>
                      </LiquidPanel>
                    </motion.div>
                  ))}
                </motion.div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
