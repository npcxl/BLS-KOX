import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Github, Menu, X } from 'lucide-react';
import { LINKS, NAV_EXTERNAL, NAV_ITEMS } from '../../content/site';
import { useActiveSection } from '../../lib/hooks';
import { spring } from '../../lib/motion';
import { LiquidButton } from './LiquidButton';
import { LiquidIconButton } from './LiquidIconButton';

export function BrandMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="lq-brand__mark">
      <defs>
        <radialGradient id="nav-core" cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="55%" stopColor="#69B1FF" />
          <stop offset="100%" stopColor="#1677FF" />
        </radialGradient>
      </defs>
      <g fill="none" stroke="#1677FF" strokeWidth="1.8">
        <ellipse cx="32" cy="32" rx="21" ry="8" opacity="0.32" />
        <ellipse cx="32" cy="32" rx="21" ry="8" opacity="0.48" transform="rotate(60 32 32)" />
        <ellipse cx="32" cy="32" rx="21" ry="8" opacity="0.66" transform="rotate(120 32 32)" />
      </g>
      <circle cx="32" cy="32" r="9" fill="url(#nav-core)" />
      <circle cx="32" cy="32" r="9" fill="none" stroke="#FFFFFF" strokeOpacity="0.72" />
    </svg>
  );
}

/**
 * Floating liquid-glass navigation. Not a full-width header bar — a slim glass
 * capsule that hovers over the page content.
 */
export function LiquidNav() {
  const [hovered, setHovered] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const sectionIds = useMemo(
    () => NAV_ITEMS.map((item) => item.href.replace('#', '')),
    [],
  );
  const activeSection = useActiveSection(sectionIds);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  const indicator = hovered ?? (activeSection ? `#${activeSection}` : null);

  const menuItem = (item: { label: string; href: string }, external = false) => (
    <li key={item.label} className="lq-nav__item">
      <a
        href={item.href}
        className={`lq-nav__link ${indicator === item.href ? 'is-current' : ''}`}
        onPointerEnter={() => setHovered(item.href)}
        onPointerLeave={() => setHovered(null)}
        onFocus={() => setHovered(item.href)}
        onBlur={() => setHovered(null)}
        {...(external ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
      >
        {indicator === item.href ? (
          <motion.span
            layoutId="bls-nav-liquid"
            className="lq-nav__liquid"
            transition={spring.nav}
          />
        ) : null}
        <span className="lq-nav__text">{item.label}</span>
      </a>
    </li>
  );

  return (
    <header className={`lq-nav ${scrolled ? 'is-scrolled' : ''}`}>
      <nav className="lq-nav__capsule" aria-label="主导航">
        <a className="lq-nav__brand" href="#overview" aria-label="BLS-KOX 首页">
          <BrandMark />
          <span className="lq-nav__wordmark">BLS-KOX</span>
        </a>

        <ul className="lq-nav__menu" onPointerLeave={() => setHovered(null)}>
          {NAV_ITEMS.map((item) => menuItem(item))}
          {menuItem(NAV_EXTERNAL, true)}
        </ul>

        <div className="lq-nav__actions">
          <LiquidIconButton
            icon={<Github size={17} strokeWidth={1.9} />}
            label="GitHub 仓库"
            href={LINKS.github}
            external
            size="sm"
          />
          <LiquidButton
            variant="primary"
            size="sm"
            href={LINKS.gettingStarted}
            external
            trailingIcon={<ArrowRight size={15} strokeWidth={2.1} />}
          >
            Get Started
          </LiquidButton>
          <LiquidIconButton
            icon={mobileOpen ? <X size={18} strokeWidth={1.9} /> : <Menu size={18} strokeWidth={1.9} />}
            label={mobileOpen ? '关闭菜单' : '打开菜单'}
            onClick={() => setMobileOpen((v) => !v)}
            size="sm"
            className="lq-nav__burger"
          />
        </div>
      </nav>

      <AnimatePresence>
        {mobileOpen ? (
          <motion.div
            className="lq-nav__sheet"
            initial={{ opacity: 0, y: -10, clipPath: 'inset(0 0 100% 0)' }}
            animate={{ opacity: 1, y: 0, clipPath: 'inset(0 0 0% 0)' }}
            exit={{ opacity: 0, y: -8, clipPath: 'inset(0 0 100% 0)' }}
            transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
          >
            {NAV_ITEMS.map((item) => (
              <a key={item.label} href={item.href} onClick={() => setMobileOpen(false)}>
                {item.label}
              </a>
            ))}
            <a href={NAV_EXTERNAL.href} target="_blank" rel="noreferrer noopener">
              {NAV_EXTERNAL.label}
            </a>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
}
