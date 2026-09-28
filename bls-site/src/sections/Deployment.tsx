import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Copy, ExternalLink } from 'lucide-react';
import { DEPLOYMENT, LINKS } from '../content/site';
import { useInViewOnce } from '../lib/hooks';
import { spring } from '../lib/motion';
import { LiquidPanel } from '../components/liquid/LiquidPanel';
import { LiquidButton } from '../components/liquid/LiquidButton';
import { LiquidIconButton } from '../components/liquid/LiquidIconButton';
import { SectionHead } from '../components/common/SectionHead';

export function Deployment() {
  const [ref, inView] = useInViewOnce<HTMLDivElement>('0px 0px -18% 0px', 0.2);
  const [healthy, setHealthy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!inView) return;
    const id = window.setTimeout(() => setHealthy(true), 1250);
    return () => window.clearTimeout(id);
  }, [inView]);

  const copyCommand = async () => {
    const text = DEPLOYMENT.command.join('\n');
    try {
      if (window.isSecureContext && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      } else {
        const area = document.createElement('textarea');
        area.value = text;
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        document.body.removeChild(area);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="section deployment" id="deployment" aria-labelledby="deployment-title">
      <div className="shell">
        <SectionHead
          eyebrow={DEPLOYMENT.eyebrow}
          title={DEPLOYMENT.title}
          lede={DEPLOYMENT.lede}
          headingId="deployment-title"
        />

        <div className="deployment__body" ref={ref}>
          <LiquidPanel className="deployment__terminal" variant="strong" radius="xl">
            <div className="deployment__terminal-head">
              <span className="deployment__terminal-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span className="mono">bash</span>
              <LiquidIconButton
                icon={copied ? <Check size={15} strokeWidth={2.2} /> : <Copy size={15} strokeWidth={1.9} />}
                label={copied ? '已复制' : '复制命令'}
                onClick={copyCommand}
                size="sm"
                className="deployment__copy"
              />
            </div>
            <pre className="deployment__command">
              {DEPLOYMENT.command.map((line) => (
                <span className="deployment__command-line" key={line}>
                  <span className="deployment__prompt" aria-hidden="true">
                    $
                  </span>
                  {line}
                </span>
              ))}
            </pre>
            <ul className="deployment__endpoints">
              {DEPLOYMENT.endpoints.map((item) => (
                <li key={item.k}>
                  <span>{item.k}</span>
                  <span className="mono">{item.v}</span>
                </li>
              ))}
            </ul>
          </LiquidPanel>

          <div className="deployment__stack">
            <motion.div
              className="deployment__container"
              initial={{ opacity: 0, scale: 0.96, borderRadius: 34 }}
              animate={inView ? { opacity: 1, scale: 1, borderRadius: 24 } : {}}
              transition={spring.split}
            >
              <div className="deployment__container-head">
                <span className="deployment__container-title">docker compose</span>
                <span className={`deployment__health ${healthy ? 'is-on' : ''}`}>
                  <span className="deployment__health-dot" aria-hidden="true" />
                  {healthy ? 'Healthy' : 'starting'}
                </span>
              </div>

              <div className="deployment__modules">
                {DEPLOYMENT.modules.map((module, index) => (
                  <motion.div
                    className="deployment__module"
                    key={module.id}
                    initial={{ opacity: 0, y: 14, scale: 0.94 }}
                    animate={inView ? { opacity: 1, y: 0, scale: 1 } : {}}
                    transition={{ ...spring.hover, delay: 0.1 + index * 0.075 }}
                  >
                    <span className="deployment__module-name">{module.name}</span>
                    <span className="deployment__module-sub mono">{module.sub}</span>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            <p className="deployment__headline">
              {DEPLOYMENT.headline.split('\n').map((line) => (
                <span key={line}>{line}</span>
              ))}
            </p>

            <div className="deployment__docs">
              {DEPLOYMENT.docs.map((doc) => (
                <LiquidButton
                  key={doc.label}
                  variant="glass"
                  size="sm"
                  href={doc.href}
                  external
                  trailingIcon={<ExternalLink size={14} strokeWidth={1.9} />}
                >
                  {doc.label}
                </LiquidButton>
              ))}
              <LiquidButton
                variant="ghost"
                size="sm"
                href={LINKS.demo}
                external
                trailingIcon={<ExternalLink size={14} strokeWidth={1.9} />}
              >
                在线演示
              </LiquidButton>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
