import { motion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import { FOOTER, LINKS } from '../content/site';
import { EASE_GLIDE } from '../lib/motion';
import { LiquidButton } from '../components/liquid/LiquidButton';
import { BrandMark } from '../components/liquid/LiquidNav';

export function Footer() {
  return (
    <footer className="footer" role="contentinfo">
      <div className="shell">
        <div className="footer__cta">
          <motion.h2
            className="footer__headline"
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.85, ease: EASE_GLIDE as unknown as [number, number, number, number] }}
          >
            {FOOTER.headline.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </motion.h2>

          <motion.div
            className="footer__brand"
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{
              duration: 0.8,
              delay: 0.08,
              ease: EASE_GLIDE as unknown as [number, number, number, number],
            }}
          >
            <span className="footer__wordmark">
              <BrandMark size={28} />
              {FOOTER.brand}
            </span>
            <ul className="footer__badges">
              {FOOTER.badges.map((badge) => (
                <li key={badge}>{badge}</li>
              ))}
            </ul>
          </motion.div>

          <motion.div
            className="footer__actions"
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{
              duration: 0.8,
              delay: 0.16,
              ease: EASE_GLIDE as unknown as [number, number, number, number],
            }}
          >
            {FOOTER.primary.map((item, index) => (
              <LiquidButton
                key={item.label}
                variant={index === 0 ? 'primary' : 'glass'}
                size="md"
                href={item.href}
                external
                trailingIcon={<ArrowUpRight size={15} strokeWidth={2} />}
              >
                {item.label}
              </LiquidButton>
            ))}
          </motion.div>
        </div>

        <hr className="divider" />

        <div className="footer__base">
          <ul className="footer__links">
            {FOOTER.links.map((link) => (
              <li key={link.label}>
                <a href={link.href} target="_blank" rel="noreferrer noopener">
                  {link.label}
                </a>
              </li>
            ))}
            <li>
              <a href={LINKS.gitee} target="_blank" rel="noreferrer noopener">
                Gitee
              </a>
            </li>
            <li>
              <a href={LINKS.issues} target="_blank" rel="noreferrer noopener">
                Issues
              </a>
            </li>
          </ul>
          <p className="footer__meta">{FOOTER.meta}</p>
        </div>
      </div>
    </footer>
  );
}
