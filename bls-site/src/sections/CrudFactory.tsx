import { useInViewOnce, usePrefersReducedMotion } from '../lib/hooks';
import { CRUD } from '../content/site';
import { LiquidPanel } from '../components/liquid/LiquidPanel';
import { SectionHead } from '../components/common/SectionHead';

export function CrudFactory() {
  const [ref, inView] = useInViewOnce<HTMLDivElement>('0px 0px -16% 0px', 0.25);
  const reduceMotion = usePrefersReducedMotion();
  const running = inView && !reduceMotion;

  return (
    <section className="section crud" id="crud" aria-labelledby="crud-title">
      <div className="shell">
        <SectionHead
          eyebrow={CRUD.eyebrow}
          title={CRUD.title}
          lede={CRUD.lede}
          headingId="crud-title"
        />

        <div className="crud__body" ref={ref}>
          <div className={`crud__pipeline ${running ? 'is-running' : ''}`}>
            <div className="crud__stage-col">
              <span className="crud__stage-tag mono">{CRUD.stage[0]}</span>
              <ul className="crud__fields">
                {['product_name', 'price', 'status'].map((field) => (
                  <li key={field} className="mono">
                    {field}
                  </li>
                ))}
              </ul>
            </div>

            <div className="crud__pipe" aria-hidden="true">
              <span className="crud__pipe-line" />
              <span className="crud__pipe-dot" style={{ animationDelay: '0ms' }} />
            </div>

            <div className="crud__stage-col crud__stage-col--slim">
              <span className="crud__module">{CRUD.stage[1]}</span>
              <span className="crud__module-note">Zod schema · 写入白名单 · 字段投影</span>
            </div>

            <div className="crud__pipe" aria-hidden="true">
              <span className="crud__pipe-line" />
              <span className="crud__pipe-dot" style={{ animationDelay: '1600ms' }} />
            </div>

            <div className="crud__stage-col crud__stage-col--slim">
              <span className="crud__module crud__module--brand">{CRUD.stage[2]}</span>
              <span className="crud__module-note">defineCrudConfig()</span>
            </div>

            <div className="crud__pipe" aria-hidden="true">
              <span className="crud__pipe-line" />
              <span className="crud__pipe-dot" style={{ animationDelay: '3200ms' }} />
            </div>

            <div className="crud__outputs">
              {CRUD.outputs.map((output) => (
                <span className="crud__output" key={output}>
                  {output}
                </span>
              ))}
            </div>
          </div>

          <LiquidPanel className="crud__code" variant="strong" radius="xl">
            <div className="crud__code-head">
              <span className="crud__code-dot" aria-hidden="true" />
              <span className="mono">src/api/business/product/index.ts</span>
            </div>
            <pre className="crud__code-body">
              <code>
                {CRUD.code.map((line, index) => (
                  <span className="crud__code-line" key={index}>
                    <span className="crud__code-gutter">{index + 1}</span>
                    {line}
                    {'\n'}
                  </span>
                ))}
              </code>
            </pre>
            <div className="crud__notes">
              {CRUD.notes.map((note) => (
                <div className="crud__note" key={note.k}>
                  <span className="crud__note-k">{note.k}</span>
                  <span className="crud__note-v">{note.v}</span>
                </div>
              ))}
            </div>
            <a className="crud__docs" href={CRUD.docs} target="_blank" rel="noreferrer noopener">
              docs/crud.md <span aria-hidden="true">→</span>
            </a>
          </LiquidPanel>
        </div>
      </div>
    </section>
  );
}
