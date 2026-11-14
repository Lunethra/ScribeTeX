import { useMemo, useState } from 'react';
import katex from 'katex';
import { ChevronDown, ChevronUp, Search, Star, X } from 'lucide-react';
import { LATEX_SYMBOLS, SYMBOL_CATEGORIES } from '../data/latexSymbols';
import type { SymbolCategoryId, SymbolItem } from '../types/editor';

interface SymbolKeyboardToolbarProps {
  onInsertSymbol: (symbol: SymbolItem) => void;
  recentIds: string[];
  favoriteIds: string[];
  onToggleFavorite: (id: string) => void;
}

function renderSymbolPreviewHtml(latex: string): string {
  try {
    return katex.renderToString(latex, {
      displayMode: false,
      throwOnError: false,
      strict: 'ignore',
    });
  } catch {
    return latex;
  }
}

export function SymbolKeyboardToolbar({
  onInsertSymbol,
  recentIds,
  favoriteIds,
  onToggleFavorite,
}: SymbolKeyboardToolbarProps) {
  const [activeCategory, setActiveCategory] = useState<SymbolCategoryId>('greek');
  const [searchQuery, setSearchQuery] = useState('');
  const [isExpanded, setIsExpanded] = useState(true);

  const previewCache = useMemo(() => {
    const map = new Map<string, string>();
    for (const sym of LATEX_SYMBOLS) {
      if (sym.previewLatex) {
        map.set(sym.id, renderSymbolPreviewHtml(sym.previewLatex));
      }
    }
    return map;
  }, []);

  const displayedSymbols = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      return LATEX_SYMBOLS.filter(
        (sym) =>
          sym.label.toLowerCase().includes(q) ||
          sym.command.toLowerCase().includes(q) ||
          sym.description.toLowerCase().includes(q) ||
          sym.keywords.some((kw) => kw.toLowerCase().includes(q))
      );
    }

    if (activeCategory === 'favorites') {
      const combinedIds = Array.from(new Set([...favoriteIds, ...recentIds]));
      if (combinedIds.length === 0) {
        // Seed initial quick-access favorites if none yet
        return LATEX_SYMBOLS.slice(0, 14);
      }
      return combinedIds
        .map((id) => LATEX_SYMBOLS.find((s) => s.id === id))
        .filter((s): s is SymbolItem => Boolean(s));
    }

    return LATEX_SYMBOLS.filter((sym) => sym.category === activeCategory);
  }, [activeCategory, searchQuery, favoriteIds, recentIds]);

  return (
    <section
      aria-label="LaTeX Symbol Keyboard"
      className="border-b border-[var(--border-hairline)] bg-[var(--bg-surface)] transition-colors duration-150 select-none"
    >
      {/* Category Tabs + Search + Expand Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 border-b border-[var(--border-hairline)]">
        <div
          role="tablist"
          aria-label="Symbol categories"
          className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5"
        >
          {SYMBOL_CATEGORIES.map((cat) => {
            const isActive = !searchQuery && activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                role="tab"
                type="button"
                aria-selected={isActive}
                onClick={() => {
                  setSearchQuery('');
                  setActiveCategory(cat.id);
                  if (!isExpanded) setIsExpanded(true);
                }}
                className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-text)] shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                }`}
              >
                {cat.shortLabel}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="relative flex items-center">
            <Search
              size={13}
              className="absolute left-2.5 text-[var(--text-muted)] pointer-events-none"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (!isExpanded) setIsExpanded(true);
              }}
              placeholder="Search symbols..."
              aria-label="Search LaTeX symbols"
              className="w-44 sm:w-52 pl-7 pr-7 py-1 text-xs rounded-md bg-[var(--bg-elevated)] border border-[var(--border-hairline)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-ring)]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear symbol search"
                className="absolute right-1.5 p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <X size={12} />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setIsExpanded((v) => !v)}
            aria-expanded={isExpanded}
            aria-label={isExpanded ? 'Collapse symbol keyboard' : 'Expand symbol keyboard'}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-hairline)] whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            <span className="hidden sm:inline">{isExpanded ? 'Compact' : 'Expand'}</span>
          </button>
        </div>
      </div>

      {/* Symbol Keys Grid */}
      {isExpanded && (
        <div
          className="px-3 py-2 max-h-40 overflow-y-auto bg-[var(--bg-canvas)]/40"
          data-testid="symbol-keyboard-grid"
        >
          {displayedSymbols.length === 0 ? (
            <div className="py-4 text-center text-xs text-[var(--text-muted)]">
              No LaTeX symbols matched &ldquo;{searchQuery}&rdquo;. Try &ldquo;integral&rdquo;,
              &ldquo;matrix&rdquo;, or &ldquo;alpha&rdquo;.
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {displayedSymbols.map((sym) => {
                const isFav = favoriteIds.includes(sym.id);
                const previewHtml = previewCache.get(sym.id);
                return (
                  <div key={sym.id} className="group relative">
                    <button
                      type="button"
                      onClick={() => onInsertSymbol(sym)}
                      title={`${sym.description} — ${sym.command}`}
                      aria-label={`Insert ${sym.description} (${sym.command})`}
                      className="h-10 min-w-[46px] px-2.5 flex flex-col items-center justify-center rounded-md bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] border border-[var(--border-hairline)] hover:border-[var(--accent-ring)] text-[var(--text-primary)] transition-all duration-100 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                    >
                      {previewHtml ? (
                        <span
                          className="text-[14px] leading-none pointer-events-none"
                          dangerouslySetInnerHTML={{ __html: previewHtml }}
                        />
                      ) : (
                        <span className="text-xs font-mono font-semibold leading-none pointer-events-none">
                          {sym.previewText || sym.label}
                        </span>
                      )}
                      <span className="mt-0.5 text-[9px] font-mono text-[var(--text-muted)] leading-none max-w-[68px] truncate pointer-events-none">
                        {sym.label}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavorite(sym.id);
                      }}
                      aria-label={isFav ? `Unpin ${sym.label}` : `Pin ${sym.label} to favorites`}
                      className={`absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center border border-[var(--border-hairline)] bg-[var(--bg-surface)] transition-opacity cursor-pointer ${
                        isFav
                          ? 'opacity-100 text-zinc-900 dark:text-blue-400'
                          : 'opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      <Star size={9} fill={isFav ? 'currentColor' : 'none'} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
