import { useMemo, useState } from 'react';
import katex from 'katex';
import { ChevronDown, ChevronUp, Search, Star, X } from 'lucide-react';
import {
  DEFAULT_SYMBOL_CATEGORY_ORDER,
  LATEX_SYMBOLS,
  SYMBOL_CATEGORIES,
  normalizeCategoryOrder,
  reorderCategoryOrder,
} from '../data/latexSymbols';
import { usePersistentState } from '../hooks/usePersistentState';
import type { SymbolCategoryId, SymbolItem } from '../types/editor';

interface SymbolKeyboardToolbarProps {
  onInsertSymbol: (symbol: SymbolItem) => void;
  onDragSymbolStart?: (symbol: SymbolItem) => void;
  onDragSymbolEnd?: () => void;
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
  onDragSymbolStart,
  onDragSymbolEnd,
  recentIds,
  favoriteIds,
  onToggleFavorite,
}: SymbolKeyboardToolbarProps) {
  const [activeCategory, setActiveCategory] = useState<SymbolCategoryId>('favorites');
  const [searchQuery, setSearchQuery] = useState('');
  const [isExpanded, setIsExpanded] = useState(true);
  const [categoryOrder, setCategoryOrder] = usePersistentState<SymbolCategoryId[]>(
    'scribetex:symbolTabOrder:v1',
    DEFAULT_SYMBOL_CATEGORY_ORDER
  );
  const [draggedTabId, setDraggedTabId] = useState<SymbolCategoryId | null>(null);
  const [dropIndicator, setDropIndicator] = useState<{
    targetId: SymbolCategoryId;
    position: 'before' | 'after';
  } | null>(null);

  const orderedCategories = useMemo(() => {
    const normalizedIds = normalizeCategoryOrder(categoryOrder);
    const byId = new Map(SYMBOL_CATEGORIES.map((c) => [c.id, c]));
    return normalizedIds
      .map((id) => byId.get(id))
      .filter((c): c is (typeof SYMBOL_CATEGORIES)[number] => Boolean(c));
  }, [categoryOrder]);

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
        return LATEX_SYMBOLS.filter((s) => s.category !== 'structure').slice(0, 14);
      }
      return combinedIds
        .map((id) => LATEX_SYMBOLS.find((s) => s.id === id))
        .filter((s): s is SymbolItem => Boolean(s));
    }

    if (activeCategory === 'document') {
      return LATEX_SYMBOLS.filter((sym) => sym.category === 'structure');
    }

    return LATEX_SYMBOLS.filter((sym) => sym.category === activeCategory);
  }, [activeCategory, searchQuery, favoriteIds, recentIds]);

  const renderSymbolKey = (sym: SymbolItem) => {
    const isFav = favoriteIds.includes(sym.id);
    const previewHtml = previewCache.get(sym.id);
    return (
      <div key={sym.id} className="group relative">
        <button
          type="button"
          draggable
          data-symbol-id={sym.id}
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'copy';
            e.dataTransfer.setData('application/x-scribetex-symbol', sym.id);
            e.dataTransfer.setData('text/plain', sym.command);
            onDragSymbolStart?.(sym);
          }}
          onDragEnd={() => {
            onDragSymbolEnd?.();
          }}
          onClick={() => onInsertSymbol(sym)}
          title={`${sym.description} — ${sym.command} (Click to insert or drag onto preview)`}
          aria-label={`Insert ${sym.description} (${sym.command})`}
          className="h-10 min-w-[46px] px-2.5 flex flex-col items-center justify-center rounded-md bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] border border-[var(--border-hairline)] hover:border-[var(--accent-ring)] text-[var(--text-primary)] transition-all duration-100 cursor-grab active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
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
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
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
  };

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
          data-testid="symbol-category-tablist"
          onDragOver={(e) => {
            const isTabDrag =
              Boolean(draggedTabId) ||
              e.dataTransfer.types.includes('application/x-scribetex-tab');
            if (!isTabDrag) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            const tabs = Array.from(
              e.currentTarget.querySelectorAll<HTMLElement>('[data-category-id]')
            );
            if (tabs.length === 0) return;
            let closestTab = tabs[0];
            let minDist = Infinity;
            for (const tabEl of tabs) {
              const r = tabEl.getBoundingClientRect();
              const dist =
                e.clientX < r.left ? r.left - e.clientX : e.clientX > r.right ? e.clientX - r.right : 0;
              if (dist < minDist) {
                minDist = dist;
                closestTab = tabEl;
              }
            }
            const targetId = closestTab.getAttribute('data-category-id') as SymbolCategoryId | null;
            if (!targetId) return;
            const rect = closestTab.getBoundingClientRect();
            const position: 'before' | 'after' =
              e.clientX < rect.left + rect.width / 2 ? 'before' : 'after';
            setDropIndicator((prev) =>
              prev && prev.targetId === targetId && prev.position === position
                ? prev
                : { targetId, position }
            );
          }}
          onDragLeave={(e) => {
            const related = e.relatedTarget;
            if (!(related instanceof Node) || !e.currentTarget.contains(related)) {
              setDropIndicator(null);
            }
          }}
          onDrop={(e) => {
            const rawDragged =
              (e.dataTransfer.getData('application/x-scribetex-tab') as SymbolCategoryId | '') ||
              draggedTabId;
            if (!rawDragged || !dropIndicator) {
              setDraggedTabId(null);
              setDropIndicator(null);
              return;
            }
            e.preventDefault();
            setCategoryOrder((prev) =>
              reorderCategoryOrder(prev, rawDragged, dropIndicator.targetId, dropIndicator.position)
            );
            setDraggedTabId(null);
            setDropIndicator(null);
          }}
          className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5 px-1"
        >
          {orderedCategories.map((cat) => {
            const isActive = !searchQuery && activeCategory === cat.id;
            const isDragging = draggedTabId === cat.id;
            const showBeforeBar =
              dropIndicator?.targetId === cat.id &&
              dropIndicator.position === 'before' &&
              draggedTabId !== cat.id;
            const showAfterBar =
              dropIndicator?.targetId === cat.id &&
              dropIndicator.position === 'after' &&
              draggedTabId !== cat.id;

            return (
              <button
                key={cat.id}
                role="tab"
                type="button"
                draggable
                data-category-id={cat.id}
                aria-selected={isActive}
                title={`${cat.label} — Drag to reorder`}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('application/x-scribetex-tab', cat.id);
                  setDraggedTabId(cat.id);
                }}
                onDragOver={(e) => {
                  const isTabDrag =
                    Boolean(draggedTabId) ||
                    e.dataTransfer.types.includes('application/x-scribetex-tab');
                  if (!isTabDrag) return;
                  e.preventDefault();
                  e.stopPropagation();
                  e.dataTransfer.dropEffect = 'move';
                  const rect = e.currentTarget.getBoundingClientRect();
                  const position: 'before' | 'after' =
                    e.clientX < rect.left + rect.width / 2 ? 'before' : 'after';
                  setDropIndicator((prev) =>
                    prev && prev.targetId === cat.id && prev.position === position
                      ? prev
                      : { targetId: cat.id, position }
                  );
                }}
                onDrop={(e) => {
                  const rawDragged =
                    (e.dataTransfer.getData('application/x-scribetex-tab') as
                      | SymbolCategoryId
                      | '') || draggedTabId;
                  if (!rawDragged) return;
                  e.preventDefault();
                  e.stopPropagation();
                  const rect = e.currentTarget.getBoundingClientRect();
                  const position: 'before' | 'after' =
                    e.clientX < rect.left + rect.width / 2 ? 'before' : 'after';
                  setCategoryOrder((prev) =>
                    reorderCategoryOrder(prev, rawDragged, cat.id, position)
                  );
                  setDraggedTabId(null);
                  setDropIndicator(null);
                }}
                onDragEnd={() => {
                  setDraggedTabId(null);
                  setDropIndicator(null);
                }}
                onKeyDown={(e) => {
                  if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
                    e.preventDefault();
                    const normalized = normalizeCategoryOrder(categoryOrder);
                    const idx = normalized.indexOf(cat.id);
                    const swapIdx = e.key === 'ArrowLeft' ? idx - 1 : idx + 1;
                    if (idx !== -1 && swapIdx >= 0 && swapIdx < normalized.length) {
                      const targetId = normalized[swapIdx];
                      setCategoryOrder((prev) =>
                        reorderCategoryOrder(
                          prev,
                          cat.id,
                          targetId,
                          e.key === 'ArrowLeft' ? 'before' : 'after'
                        )
                      );
                    }
                  }
                }}
                onClick={() => {
                  setSearchQuery('');
                  setActiveCategory(cat.id);
                  if (!isExpanded) setIsExpanded(true);
                }}
                className={`relative px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap shrink-0 transition-all cursor-pointer active:cursor-grabbing ${
                  isDragging ? 'opacity-45 scale-[0.97]' : ''
                } ${
                  isActive
                    ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-text)] shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                }`}
              >
                {showBeforeBar && (
                  <span
                    aria-hidden="true"
                    data-testid="tab-drop-indicator"
                    className="pointer-events-none absolute -left-[3px] top-1 bottom-1 w-0.5 rounded-full bg-[var(--accent-primary)]"
                  />
                )}
                {cat.shortLabel}
                {showAfterBar && (
                  <span
                    aria-hidden="true"
                    data-testid="tab-drop-indicator"
                    className="pointer-events-none absolute -right-[3px] top-1 bottom-1 w-0.5 rounded-full bg-[var(--accent-primary)]"
                  />
                )}
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
              {displayedSymbols.map((sym) => renderSymbolKey(sym))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
