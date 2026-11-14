import { FileText, Plus, Trash2 } from 'lucide-react';
import type { LaTeXDocument, OutlineHeading } from '../types/editor';

interface OutlineSidebarProps {
  documents: LaTeXDocument[];
  activeDocId: string | null;
  outline: OutlineHeading[];
  onSelectDoc: (id: string) => void;
  onNewFromTemplate: () => void;
  onDeleteDoc: (id: string) => void;
  onSelectHeading: (heading: OutlineHeading) => void;
}

export function OutlineSidebar({
  documents,
  activeDocId,
  outline,
  onSelectDoc,
  onNewFromTemplate,
  onDeleteDoc,
  onSelectHeading,
  onCloseMobile,
}: OutlineSidebarProps & { onCloseMobile?: () => void }) {
  return (
    <>
      <div
        className="fixed inset-0 z-30 bg-black/40 md:hidden"
        onClick={onCloseMobile}
        aria-hidden="true"
      />
      <aside
        aria-label="Documents and outline"
        className="fixed md:static inset-y-0 left-0 z-40 w-64 md:w-60 shrink-0 h-full flex flex-col border-r border-[var(--border-hairline)] bg-[var(--bg-surface)] select-none shadow-xl md:shadow-none"
      >
      {/* Documents Section */}
      <div className="p-3 border-b border-[var(--border-hairline)]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-[var(--text-secondary)]">Documents</span>
          <button
            type="button"
            onClick={onNewFromTemplate}
            aria-label="New document from template"
            className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] border border-[var(--border-hairline)] text-[var(--text-primary)] cursor-pointer"
          >
            <Plus size={12} />
            New
          </button>
        </div>

        {documents.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)] py-2">
            No saved documents yet.
          </p>
        ) : (
          <ul className="space-y-1 max-h-44 overflow-y-auto">
            {documents.map((doc) => {
              const active = doc.id === activeDocId;
              return (
                <li key={doc.id} className="group flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onSelectDoc(doc.id)}
                    className={`flex-1 flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-md text-left min-w-0 cursor-pointer transition-colors ${
                      active
                        ? 'bg-[var(--accent-subtle)] text-[var(--text-primary)] font-semibold'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <FileText size={13} className="shrink-0 opacity-75" />
                    <span className="truncate">{doc.title}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteDoc(doc.id)}
                    aria-label={`Delete ${doc.title}`}
                    className="p-1 rounded opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-red-500 cursor-pointer"
                  >
                    <Trash2 size={12} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Document Outline */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="text-xs font-semibold text-[var(--text-secondary)] mb-2">
          Section Outline
        </div>
        {outline.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            Add <code className="font-mono">\section&#123;...&#125;</code> commands to build a
            navigable outline.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {outline.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  onClick={() => onSelectHeading(h)}
                  style={{ paddingLeft: `${8 + (h.level - 1) * 12}px` }}
                  className="w-full text-left py-1.5 pr-2 text-xs rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] flex items-baseline gap-1.5 cursor-pointer"
                >
                  {h.numberLabel && (
                    <span className="font-mono text-[10px] tabular-nums opacity-65 shrink-0">
                      {h.numberLabel}
                    </span>
                  )}
                  <span className="truncate">
                    {h.title || (h.numberLabel ? `Section ${h.numberLabel}` : 'Untitled section')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
    </>
  );
}
