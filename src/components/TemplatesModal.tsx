import { FilePlus2, Upload, X } from 'lucide-react';
import { DOCUMENT_TEMPLATES, type DocumentTemplate } from '../data/templates';

interface TemplatesModalProps {
  open: boolean;
  onClose: () => void;
  onSelectTemplate: (template: DocumentTemplate) => void;
  onImportTexFile: (title: string, content: string) => void;
}

export function TemplatesModal({
  open,
  onClose,
  onSelectTemplate,
  onImportTexFile,
}: TemplatesModalProps) {
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
              Choose a structured template or open an existing .tex file from your computer.
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

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {DOCUMENT_TEMPLATES.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => {
                  onSelectTemplate(tpl);
                  onClose();
                }}
                className="p-4 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] hover:border-[var(--accent-ring)] text-left transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2 font-semibold text-xs text-[var(--text-primary)] mb-1">
                  <FilePlus2 size={14} className="text-[var(--accent-primary)] dark:text-blue-400" />
                  <span>{tpl.name}</span>
                </div>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  {tpl.description}
                </p>
              </button>
            ))}
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
