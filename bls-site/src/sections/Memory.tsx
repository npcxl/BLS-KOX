import { FileText, Folder } from 'lucide-react';
import { LINKS, MEMORY } from '../content/site';
import { LiquidPanel } from '../components/liquid/LiquidPanel';
import { SectionHead } from '../components/common/SectionHead';

export function Memory() {
  return (
    <section className="section memory" id="memory" aria-labelledby="memory-title">
      <div className="shell">
        <SectionHead
          eyebrow={MEMORY.eyebrow}
          title={MEMORY.title}
          lede={MEMORY.lede}
          headingId="memory-title"
        />

        <p className="memory__zh">{MEMORY.zh}</p>

        <div className="memory__structure">
          <LiquidPanel className="memory__tree" variant="soft" radius="xl" glow>
            <p className="memory__tree-root mono">{MEMORY.tree.root}</p>
            <ul className="memory__tree-list">
              {MEMORY.tree.entries.map((entry) => (
                <li
                  key={entry.path}
                  className="memory__tree-row"
                  style={{ paddingLeft: `${((('depth' in entry ? entry.depth : 0) as number) ?? 0) * 18}px` }}
                >
                  {entry.kind === 'dir' ? (
                    <Folder size={14} strokeWidth={1.8} aria-hidden="true" />
                  ) : (
                    <FileText size={14} strokeWidth={1.8} aria-hidden="true" />
                  )}
                  <span className="memory__tree-path mono">{entry.path}</span>
                  <span className="memory__tree-note">{entry.note}</span>
                </li>
              ))}
            </ul>
            <a className="memory__tree-link" href={LINKS.memoryIndex} target="_blank" rel="noreferrer noopener">
              bls-memory/README.md <span aria-hidden="true">→</span>
            </a>
          </LiquidPanel>

          <div className="memory__docs">
            {MEMORY.docs.map((doc) => (
              <LiquidPanel
                key={doc.file}
                className="memory__doc"
                variant="soft"
                radius="lg"
                interactive
                glow
              >
                <p className="memory__doc-file mono">{doc.file}</p>
                <p className="memory__doc-title">{doc.title}</p>
                <ul className="memory__doc-tags">
                  {doc.tags.map((tag) => (
                    <li key={tag}>{tag}</li>
                  ))}
                </ul>
              </LiquidPanel>
            ))}
          </div>
        </div>

        <div className="memory__records">
          <span className="memory__records-label">每页记录</span>
          <div className="memory__records-list">
            {MEMORY.records.map((record) => (
              <span className="chip chip--accent" key={record}>
                {record}
              </span>
            ))}
          </div>
        </div>

        <p className="memory__footnote">{MEMORY.footnote}</p>
      </div>
    </section>
  );
}
