export interface SnippetInsertionResult {
  nextText: string;
  selectionStart: number;
  selectionEnd: number;
}

/**
 * Inserts a LaTeX snippet containing an optional $0 cursor marker into source text
 * at [from, to], wrapping any currently selected text at $0.
 */
export function applyLatexSnippet(
  source: string,
  from: number,
  to: number,
  snippet: string
): SnippetInsertionResult {
  const safeFrom = Math.max(0, Math.min(from, source.length));
  const safeTo = Math.max(safeFrom, Math.min(to, source.length));
  const selected = source.slice(safeFrom, safeTo);

  const markerIndex = snippet.indexOf('$0');
  let inserted: string;
  let cursorOffset: number;

  if (markerIndex !== -1) {
    inserted = snippet.slice(0, markerIndex) + selected + snippet.slice(markerIndex + 2);
    cursorOffset = markerIndex + selected.length;
  } else {
    inserted = snippet;
    cursorOffset = snippet.length;
  }

  const nextText = source.slice(0, safeFrom) + inserted + source.slice(safeTo);
  const newCursor = safeFrom + cursorOffset;

  return {
    nextText,
    selectionStart: newCursor,
    selectionEnd: newCursor,
  };
}
