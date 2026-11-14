import { FilePlus2, FileText, LayoutTemplate } from 'lucide-react';
import type { LaTeXDocument } from '../types/editor';

interface WelcomeScreenProps {
  recentDocuments: LaTeXDocument[];
  onNewFile: () => void;
  onUseTemplate: () => void;
  onOpenDocument: (id: string) => void;
}

export function WelcomeScreen({
  recentDocuments,
  onNewFile,
  onUseTemplate,
  onOpenDocument,
}: WelcomeScreenProps) {
  return (
    <div
      data-testid="welcome-screen"
      className="flex-1 h-full w-full overflow-y-auto bg-[var(--bg-canvas)] text-[var(--text-primary)] flex items-center justify-center px-6 py-12"
    >
      <div className="w-full max-w-2xl flex flex-col items-center text-center">
        {/* Clean Minimal Geometric Emblem */}
        <div
          aria-hidden="true"
          className="mb-6 w-14 h-14 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] flex items-center justify-center text-[var(--accent-primary)] dark:text-blue-400"
        >
          <span className="font-serif text-2xl font-bold tracking-tight select-none">
            T<sub className="text-sm font-normal">E</sub>X
          </span>
        </div>

        {/* VS Code Style Welcome Header */}
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-[var(--text-primary)]">
          Welcome
        </h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)] max-w-md">
          ScribeTeX real-time LaTeX workspace with live preview, custom symbol keyboard, and
          automatic local saving.
        </p>

        {/* Two Center-Aligned Primary Action Buttons */}
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={onNewFile}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-md bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-[var(--accent-primary-text)] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
          >
            <FilePlus2 size={16} />
            <span>New file</span>
          </button>

          <button
            type="button"
            onClick={onUseTemplate}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-md border border-[var(--border-hairline)] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
          >
            <LayoutTemplate size={16} />
            <span>Use a template</span>
          </button>
        </div>

        {/* VS Code Style Lower Section: Recent Files & Keyboard Shortcuts */}
        <div className="mt-12 w-full grid grid-cols-1 sm:grid-cols-2 gap-8 text-left border-t border-[var(--border-hairline)] pt-8">
          <div>
            <h2 className="text-xs font-semibold text-[var(--text-secondary)] mb-3">
              Recent
            </h2>
            {recentDocuments.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                No recent documents yet. Create a new file or start from a LaTeX template.
              </p>
            ) : (
              <ul className="space-y-1">
                {recentDocuments.slice(0, 5).map((doc) => (
                  <li key={doc.id}>
                    <button
                      type="button"
                      onClick={() => onOpenDocument(doc.id)}
                      className="w-full flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-md hover:bg-[var(--bg-surface)] text-xs text-[var(--accent-primary)] dark:text-blue-400 cursor-pointer transition-colors"
                    >
                      <span className="flex items-center gap-2 min-w-0 font-medium">
                        <FileText size={13} className="shrink-0 opacity-80" />
                        <span className="truncate">{doc.title}</span>
                      </span>
                      <span className="text-[11px] text-[var(--text-muted)] tabular-nums shrink-0">
                        {new Date(doc.updatedAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h2 className="text-xs font-semibold text-[var(--text-secondary)] mb-3">
              Quick Tips
            </h2>
            <ul className="space-y-2 text-xs text-[var(--text-muted)]">
              <li className="flex items-center justify-between gap-2">
                <span>Insert math &amp; symbols</span>
                <span className="font-mono text-[11px] text-[var(--text-secondary)]">
                  Symbol Bar
                </span>
              </li>
              <li className="flex items-center justify-between gap-2">
                <span>Command autocomplete</span>
                <span className="font-mono text-[11px] text-[var(--text-secondary)]">
                  Type \
                </span>
              </li>
              <li className="flex items-center justify-between gap-2">
                <span>Find &amp; replace</span>
                <span className="font-mono text-[11px] text-[var(--text-secondary)]">
                  Ctrl + F
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
