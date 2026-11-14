import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import type { EditorSettings, ParsedLaTeXResult } from '../types/editor';

export interface LatexPreviewHandle {
  scrollToRatio: (ratio: number) => void;
  scrollToHeading: (headingId: string) => void;
}

interface LatexPreviewPaneProps {
  parsed: ParsedLaTeXResult;
  settings: EditorSettings;
}

export const LatexPreviewPane = forwardRef<LatexPreviewHandle, LatexPreviewPaneProps>(
  function LatexPreviewPane({ parsed, settings }, ref) {
    const scrollerRef = useRef<HTMLDivElement | null>(null);
    const [showErrors, setShowErrors] = useState(false);

    useImperativeHandle(ref, () => ({
      scrollToRatio(ratio: number) {
        const el = scrollerRef.current;
        if (!el || !settings.syncScroll) return;
        const max = el.scrollHeight - el.clientHeight;
        if (max > 0) {
          el.scrollTop = ratio * max;
        }
      },
      scrollToHeading(headingId: string) {
        const container = scrollerRef.current;
        if (!container) return;
        const target = container.querySelector(`#${CSS.escape(headingId)}`);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      },
    }));

    const paddingMap: Record<EditorSettings['paperMargin'], string> = {
      narrow: 'px-6 py-7 sm:px-9 sm:py-9',
      standard: 'px-8 py-10 sm:px-14 sm:py-12',
      wide: 'px-12 py-12 sm:px-20 sm:py-14',
    };

    const fontMap: Record<EditorSettings['previewFontFamily'], string> = {
      'Source Serif 4': '"Source Serif 4", Georgia, serif',
      Lora: '"Lora", Georgia, serif',
      'Plus Jakarta Sans': '"Plus Jakarta Sans", sans-serif',
    };

    const forceWhitePaper = settings.previewThemeSync === 'always-paper';
    const isPaginated = settings.previewLayout === 'paginated';
    const zoomScale = settings.previewZoom / 100;

    return (
      <div className="relative h-full w-full flex flex-col overflow-hidden bg-[var(--bg-canvas)]">
        {/* Real Math Diagnostics Strip (only rendered when parser reports real KaTeX errors) */}
        {parsed.diagnostics.length > 0 && (
          <div className="shrink-0 border-b border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 px-3 py-1.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <AlertTriangle size={14} className="shrink-0" />
                <span className="font-medium truncate">
                  {parsed.diagnostics.length} math syntax{' '}
                  {parsed.diagnostics.length === 1 ? 'issue' : 'issues'} detected
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowErrors((v) => !v)}
                className="flex items-center gap-1 font-medium hover:underline shrink-0 cursor-pointer"
              >
                {showErrors ? 'Hide' : 'Details'}
                {showErrors ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
            </div>
            {showErrors && (
              <ul className="mt-2 space-y-1 border-t border-amber-500/20 pt-2 max-h-28 overflow-y-auto">
                {parsed.diagnostics.map((d) => (
                  <li key={d.id} className="font-mono text-[11px] flex flex-col">
                    <span>{d.message}</span>
                    {d.snippet && <span className="opacity-70 truncate">Near: {d.snippet}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Scrollable Document Viewport */}
        <div
          ref={scrollerRef}
          data-testid="latex-preview-scroller"
          className={`flex-1 overflow-y-auto ${
            isPaginated ? 'p-4 sm:p-8' : 'p-0'
          }`}
        >
          {parsed.html.trim() === '' ? (
            <div className="h-full min-h-[260px] flex flex-col items-center justify-center text-center px-6">
              <p className="text-sm font-medium text-[var(--text-secondary)]">
                Your document preview is empty
              </p>
              <p className="mt-1 text-xs text-[var(--text-muted)] max-w-sm">
                Start typing LaTeX in the editor or insert equations and sections from the symbol
                keyboard above.
              </p>
            </div>
          ) : (
            <div
              className={`mx-auto transition-transform duration-150 origin-top ${
                isPaginated ? 'max-w-[820px]' : 'w-full max-w-none'
              }`}
              style={{
                transform: zoomScale !== 1 ? `scale(${zoomScale})` : undefined,
                width: zoomScale !== 1 && isPaginated ? `${100 / zoomScale}%` : undefined,
              }}
            >
              <article
                data-testid="latex-preview-article"
                className={`latex-preview-doc latex-print-area ${paddingMap[settings.paperMargin]} ${
                  isPaginated
                    ? 'rounded-lg border shadow-sm min-h-[920px]'
                    : 'min-h-full'
                } ${
                  forceWhitePaper
                    ? 'bg-white text-[#111113] border-[#D8D5CD]'
                    : 'bg-[var(--paper-bg)] text-[var(--paper-text)] border-[var(--paper-border)]'
                }`}
                style={{
                  fontFamily: fontMap[settings.previewFontFamily],
                  fontSize: `${settings.previewFontSize}px`,
                }}
                dangerouslySetInnerHTML={{ __html: parsed.html }}
              />
            </div>
          )}
        </div>
      </div>
    );
  }
);
