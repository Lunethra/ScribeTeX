import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, FilePlus2, Upload, X } from 'lucide-react';
import { DOCUMENT_TEMPLATES, type DocumentTemplate } from '../data/templates';

interface TemplatesModalProps {
  open: boolean;
  onClose: () => void;
  onNewBlankDocument: () => void;
  onSelectTemplate: (template: DocumentTemplate) => void;
  onImportTexFile: (title: string, content: string) => void;
}

export function TemplatesModal({
  open,
  onClose,
  onNewBlankDocument,
  onSelectTemplate,
  onImportTexFile,
}: TemplatesModalProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      setIsDropdownOpen(false);
    }
  }, [open]);

  if (!open) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    onImportTexFile(file.name, text);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/55 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="templates-dialog-title"
        className="relative z-10 w-full max-w-2xl rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-hairline)]">
          <div>
            <h2 id="templates-dialog-title" className="text-sm font-semibold">
              Create or Import LaTeX Document
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              Start with a blank document, choose a topic template, or import a .tex file.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close templates dialog"
            className="p-1.5 rounded-md hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Spacious Blank Div with Centered New Blank Document Button */}
          <div
            data-testid="new-blank-document-box"
            className="flex items-center justify-center min-h-[150px] px-8 py-12 rounded-lg border border-dashed border-[var(--border-hairline)] bg-[var(--bg-elevated)]/50"
          >
            <button
              type="button"
              onClick={() => {
                onNewBlankDocument();
                onClose();
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-md bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-[var(--accent-primary-text)] shadow-xs transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
            >
              <FilePlus2 size={16} />
              <span>New Blank Document</span>
            </button>
          </div>

          {/* Templates Dropdown List */}
          <div className="space-y-1.5 relative">
            <label
              id="templates-dropdown-label"
              className="block text-xs font-semibold text-[var(--text-secondary)]"
            >
              Templates
            </label>
            <button
              type="button"
              data-testid="templates-dropdown-trigger"
              aria-labelledby="templates-dropdown-label"
              aria-haspopup="listbox"
              aria-expanded={isDropdownOpen}
              onClick={() => setIsDropdownOpen((prev) => !prev)}
              className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                isDropdownOpen
                  ? 'border-[var(--accent-primary)] bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                  : 'border-[var(--border-hairline)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)]'
              }`}
            >
              <span>Choose a LaTeX template...</span>
              {isDropdownOpen ? (
                <ChevronUp size={15} className="shrink-0 text-[var(--text-secondary)]" />
              ) : (
                <ChevronDown size={15} className="shrink-0 text-[var(--text-secondary)]" />
              )}
            </button>

            {isDropdownOpen && (
              <div
                role="listbox"
                aria-labelledby="templates-dropdown-label"
                data-testid="templates-dropdown-list"
                className="max-h-60 overflow-y-auto rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-elevated)] shadow-lg divide-y divide-[var(--border-hairline)]"
              >
                {DOCUMENT_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    role="option"
                    aria-selected={false}
                    data-template-id={tpl.id}
                    onClick={() => {
                      onSelectTemplate(tpl);
                      onClose();
                    }}
                    className="w-full px-3.5 py-2.5 text-left hover:bg-[var(--bg-hover)] transition-colors cursor-pointer flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                        {tpl.name}
                      </div>
                      <p className="mt-0.5 text-[11px] text-[var(--text-secondary)] line-clamp-1">
                        {tpl.description}
                      </p>
                    </div>
                    <span className="shrink-0 px-2 py-0.5 text-[10px] font-medium rounded bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-[var(--text-muted)]">
                      {tpl.topic}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-[var(--border-hairline)] flex items-center justify-between gap-3">
            <span className="text-xs text-[var(--text-muted)]">
              Have an existing <code className="font-mono">.tex</code> file?
            </span>
            <label className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-md border border-[var(--border-hairline)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] cursor-pointer">
              <Upload size={13} />
              <span>Import .tex File</span>
              <input
                type="file"
                accept=".tex,.txt,.latex"
                onChange={handleFileChange}
                className="sr-only"
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
