import { useMemo } from 'react';
import { FileText, Pencil, Plus, Trash2 } from 'lucide-react';
import { LATEX_SYMBOLS } from '../data/latexSymbols';
import type {
  LaTeXDocument,
  OutlineHeading,
  PreviewBlock,
  SymbolItem,
} from '../types/editor';

interface HeaderFields {
  title: string;
  author: string;
  date: string;
}

interface OutlineSidebarProps {
  hasActiveDoc: boolean;
  documents: LaTeXDocument[];
  activeDocId: string | null;
  outline: OutlineHeading[];
  headerFields: HeaderFields;
  blocks: PreviewBlock[];
  selectedBlockIndex: number | null;
  onSelectDoc: (id: string) => void;
  onNewFromTemplate: () => void;
  onDeleteDoc: (id: string) => void;
  onSelectHeading: (heading: OutlineHeading) => void;
  onUpdateHeader: (fields: HeaderFields) => void;
  onSelectBlock: (index: number | null) => void;
  onEditBlock: (index: number | null) => void;
  onRemoveBlock: (index: number) => void;
  onInsertSectionSymbol: (sym: SymbolItem) => void;
  onDragSymbolStart?: (sym: SymbolItem) => void;
  onDragSymbolEnd?: () => void;
  onCloseMobile?: () => void;
}

export function OutlineSidebar({
  hasActiveDoc,
  documents,
  activeDocId,
  outline,
  headerFields,
  blocks,
  selectedBlockIndex,
  onSelectDoc,
  onNewFromTemplate,
  onDeleteDoc,
  onSelectHeading,
  onUpdateHeader,
  onSelectBlock,
  onEditBlock,
  onRemoveBlock,
  onInsertSectionSymbol,
  onDragSymbolStart,
  onDragSymbolEnd,
  onCloseMobile,
}: OutlineSidebarProps) {
  const sectionButtons = useMemo(
    () =>
      (['section', 'subsection', 'subsubsection'] as const)
        .map((id) => LATEX_SYMBOLS.find((s) => s.id === id))
        .filter((s): s is SymbolItem => Boolean(s)),
    []
  );

  const headingBlocks = useMemo(
    () =>
      blocks
        .map((block, index) => ({ block, index }))
        .filter(({ block }) => block.kind === 'heading'),
    [blocks]
  );

  return (
    <>
      <div
        className="fixed inset-0 z-30 bg-black/40 md:hidden"
        onClick={onCloseMobile}
        aria-hidden="true"
      />
      <aside
        aria-label="Document sidebar"
        className="fixed md:static inset-y-0 left-0 z-40 w-72 md:w-80 shrink-0 h-full flex flex-col border-r border-[var(--border-hairline)] bg-[var(--bg-surface)] select-none shadow-xl md:shadow-none overflow-y-auto"
      >
        {/* Document Header (Top-Down Labeled Form) */}
        <div
          data-testid="sidebar-document-header"
          className="p-3 border-b border-[var(--border-hairline)] space-y-2.5"
        >
          <div className="text-xs font-semibold text-[var(--text-secondary)]">
            Document Header
          </div>
          {!hasActiveDoc ? (
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              Open or create a file to edit its title, description, and date.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="sidebar-header-title"
                  className="text-[11px] font-medium text-[var(--text-secondary)]"
                >
                  Header title:
                </label>
                <input
                  id="sidebar-header-title"
                  type="text"
                  value={headerFields.title}
                  onChange={(e) =>
                    onUpdateHeader({ ...headerFields, title: e.target.value })
                  }
                  placeholder="Enter document header title..."
                  className="w-full px-2.5 py-1.5 text-xs rounded-md bg-[var(--bg-elevated)] border border-[var(--border-hairline)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-ring)]"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="sidebar-header-description"
                  className="text-[11px] font-medium text-[var(--text-secondary)]"
                >
                  Description:
                </label>
                <input
                  id="sidebar-header-description"
                  type="text"
                  value={headerFields.author}
                  onChange={(e) =>
                    onUpdateHeader({ ...headerFields, author: e.target.value })
                  }
                  placeholder="Enter author or subtitle description..."
                  className="w-full px-2.5 py-1.5 text-xs rounded-md bg-[var(--bg-elevated)] border border-[var(--border-hairline)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-ring)]"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="sidebar-header-date"
                  className="text-[11px] font-medium text-[var(--text-secondary)]"
                >
                  Date:
                </label>
                <input
                  id="sidebar-header-date"
                  type="text"
                  value={headerFields.date}
                  onChange={(e) =>
                    onUpdateHeader({ ...headerFields, date: e.target.value })
                  }
                  placeholder="Date (e.g. \today)"
                  className="w-full px-2.5 py-1.5 text-xs rounded-md bg-[var(--bg-elevated)] border border-[var(--border-hairline)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-ring)]"
                />
              </div>
            </div>
          )}
        </div>

        {/* Sections Manager */}
        <div
          data-testid="sidebar-sections"
          className="p-3 border-b border-[var(--border-hairline)] space-y-2.5"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-[var(--text-secondary)]">
              Sections
            </span>
          </div>

          {!hasActiveDoc ? (
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              Sections for the open document will appear here.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5">
                {sectionButtons.map((sym) => {
                  const shortText =
                    sym.id === 'section'
                      ? 'Section'
                      : sym.id === 'subsection'
                        ? 'Sub'
                        : 'Subsub';
                  return (
                    <button
                      key={sym.id}
                      type="button"
                      draggable
                      data-sidebar-symbol-id={sym.id}
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'copy';
                        e.dataTransfer.setData('application/x-scribetex-symbol', sym.id);
                        e.dataTransfer.setData('text/plain', sym.command);
                        onDragSymbolStart?.(sym);
                      }}
                      onDragEnd={() => onDragSymbolEnd?.()}
                      onClick={() => onInsertSectionSymbol(sym)}
                      title={`Add or drag ${sym.description}`}
                      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] border border-[var(--border-hairline)] hover:border-[var(--accent-ring)] text-[var(--text-primary)] cursor-grab active:cursor-grabbing"
                    >
                      <Plus size={11} />
                      <span>{shortText}</span>
                    </button>
                  );
                })}
              </div>

              {headingBlocks.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                  No sections yet. Use <span className="font-medium">+ Section</span> above to add one.
                </p>
              ) : (
                <ul className="space-y-1">
                  {headingBlocks.map(({ block, index }, headingIdx) => {
                    const isSel = selectedBlockIndex === index;
                    const match = block.rawLatex.match(
                      /^\\(section|subsection|subsubsection)\*?\s*\{([\s\S]*)\}$/
                    );
                    const cmdLabel = match ? match[1] : 'section';
                    const rawTitle = match ? match[2].trim() : '';
                    const outlineMatch = outline[headingIdx];
                    return (
                      <li
                        key={block.id}
                        className={`flex items-center justify-between gap-1.5 px-2 py-1.5 rounded-md border text-xs transition-colors ${
                          isSel
                            ? 'border-[var(--accent-primary)] bg-[var(--accent-subtle)]'
                            : 'border-[var(--border-hairline)] bg-[var(--bg-elevated)]'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            onSelectBlock(index);
                            if (outlineMatch) {
                              onSelectHeading(outlineMatch);
                            }
                          }}
                          className="flex items-center gap-1.5 min-w-0 flex-1 text-left cursor-pointer"
                        >
                          <span className="font-mono text-[10px] px-1 py-0.5 rounded bg-[var(--bg-surface)] text-[var(--text-muted)] border border-[var(--border-hairline)] shrink-0">
                            {outlineMatch?.numberLabel || cmdLabel}
                          </span>
                          <span className="truncate font-medium text-[var(--text-primary)]">
                            {rawTitle || 'Untitled section'}
                          </span>
                        </button>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              onSelectBlock(index);
                              onEditBlock(index);
                            }}
                            aria-label={`Edit ${rawTitle || cmdLabel}`}
                            title="Edit section"
                            className="p-1 rounded border border-[var(--border-hairline)] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                          >
                            <Pencil size={11} />
                          </button>
                          <button
                            type="button"
                            onClick={() => onRemoveBlock(index)}
                            aria-label={`Remove ${rawTitle || cmdLabel}`}
                            title="Remove section"
                            className="p-1 rounded border border-[var(--border-hairline)] bg-[var(--bg-surface)] hover:bg-red-500/15 hover:text-red-500 text-[var(--text-muted)] cursor-pointer"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </div>

        {/* Documents Section */}
        <div className="p-3 flex-1 min-h-0 flex flex-col">
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
            <ul className="space-y-1 overflow-y-auto">
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
      </aside>
    </>
  );
}
