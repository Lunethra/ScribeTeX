import type { PreviewBlock, PreviewBlockKind, SymbolItem } from '../types/editor';
import { BLOCK_CREATOR_SYMBOL_IDS } from '../data/latexSymbols';
import { readBraceArg } from './parser';

const STRUCTURE_PREVIEW_DEFAULTS: Record<string, string> = {
  maketitle: '\\maketitle',
  inlineMath: '$x + y$',
  displayMath: '\\[\n  x = 0\n\\]',
  equation: '\\begin{equation}\n  E = mc^2\n\\end{equation}',
  align: '\\begin{align}\n  a &= b \\\\\n  c &= d\n\\end{align}',
  section: '\\section{New Section}',
  subsection: '\\subsection{New Subsection}',
  subsubsection: '\\subsubsection{New Subsubsection}',
  textbf: '\\textbf{Bold text}',
  textit: '\\textit{Italic text}',
  texttt: '\\texttt{Monospace text}',
  underline: '\\underline{Underlined text}',
  textcolor: '\\textcolor{blue}{Colored text}',
  itemize: '\\begin{itemize}\n  \\item First item\n  \\item Second item\n\\end{itemize}',
  enumerate: '\\begin{enumerate}\n  \\item First item\n  \\item Second item\n\\end{enumerate}',
  theorem: '\\begin{theorem}[Theorem]\n  State your theorem here.\n\\end{theorem}',
  definition: '\\begin{definition}[Definition]\n  Define the term here.\n\\end{definition}',
  proof: '\\begin{proof}\n  Outline the proof steps here.\n\\end{proof}',
  abstract: '\\begin{abstract}\n  Summarize the document here.\n\\end{abstract}',
  footnote: 'Note\\footnote{Footnote text.}',
  href: '\\href{https://example.com}{Link Text}',
  label: '\\label{sec:label}',
  eqref: '\\eqref{eq:1}',
  cite: '\\cite{ref1}',
};

const TEXT_INLINE_SYMBOL_IDS = new Set([
  'inlineMath',
  'textbf',
  'textit',
  'texttt',
  'underline',
  'textcolor',
  'footnote',
  'href',
  'label',
  'eqref',
  'cite',
]);

const MULTILINE_MATH_ENV_IDS = new Set(['pmatrix', 'bmatrix', 'vmatrix', 'cases']);

export function isBlockCreatorSymbol(sym: SymbolItem): boolean {
  return BLOCK_CREATOR_SYMBOL_IDS.has(sym.id);
}

export function isMultilineMathEnvSymbol(sym: SymbolItem): boolean {
  return MULTILINE_MATH_ENV_IDS.has(sym.id);
}

export function isMathInsertionSymbol(sym: SymbolItem): boolean {
  if (sym.category === 'structure' || BLOCK_CREATOR_SYMBOL_IDS.has(sym.id)) {
    return false;
  }
  return !TEXT_INLINE_SYMBOL_IDS.has(sym.id);
}

/**
 * Formats a symbol from the custom keyboard into a self-contained LaTeX block
 * when creating a new standalone box is explicitly requested.
 */
export function formatSymbolForPreviewInsertion(sym: SymbolItem): string {
  if (STRUCTURE_PREVIEW_DEFAULTS[sym.id]) {
    return STRUCTURE_PREVIEW_DEFAULTS[sym.id];
  }

  if (sym.category === 'structure' || sym.category === 'mathblocks') {
    return sym.snippet.replace(/\$0/g, '').trim();
  }

  if (MULTILINE_MATH_ENV_IDS.has(sym.id)) {
    const body = sym.snippet.replace(/\$0/g, '').trim();
    return `\\[\n${body}\n\\]`;
  }

  const mathExpr = (sym.previewLatex || sym.snippet.replace(/\$0/g, '')).trim();
  return `\\[\n  ${mathExpr}\n\\]`;
}

function collapseExcessNewlinesAround(text: string, approxIndex: number): string {
  const start = Math.max(0, approxIndex - 16);
  const end = Math.min(text.length, approxIndex + 16);
  const head = text.slice(0, start);
  const middle = text.slice(start, end).replace(/\n{3,}/g, '\n\n');
  const tail = text.slice(end);
  return head + middle + tail;
}

/**
 * Inserts a LaTeX block at the requested preview block slot (0..blocks.length).
 * Slots beyond blocks.length append cleanly at the end of the document body
 * (before \end{document} if present).
 */
export function insertLatexAtPreviewSlot(
  rawSource: string,
  blocks: PreviewBlock[],
  dropIndex: number,
  latexBlock: string
): string {
  const trimmedBlock = latexBlock.trim();
  if (!trimmedBlock) return rawSource;

  if (blocks.length === 0) {
    const endDocIdx = rawSource.lastIndexOf('\\end{document}');
    if (endDocIdx !== -1) {
      const before = rawSource.slice(0, endDocIdx).replace(/\s*$/, '');
      const after = rawSource.slice(endDocIdx);
      const separator = before.endsWith('\n') ? '\n' : '\n\n';
      return `${before}${separator}${trimmedBlock}\n\n${after}`;
    }
    const base = rawSource.replace(/\s*$/, '');
    return base ? `${base}\n\n${trimmedBlock}\n` : `${trimmedBlock}\n`;
  }

  const clampedIndex = Math.max(0, Math.min(dropIndex, blocks.length));

  if (clampedIndex === 0) {
    const anchor = blocks[0].startOffset;
    const before = rawSource.slice(0, anchor);
    const after = rawSource.slice(anchor);
    const prefixSep = before.length > 0 && !before.endsWith('\n') ? '\n' : '';
    const next = `${before}${prefixSep}${trimmedBlock}\n\n${after}`;
    return collapseExcessNewlinesAround(next, anchor + trimmedBlock.length);
  }

  const prevBlock = blocks[clampedIndex - 1];
  const anchor = prevBlock.endOffset;
  const before = rawSource.slice(0, anchor);
  const after = rawSource.slice(anchor);
  const suffixSep = after.startsWith('\n') ? '' : '\n';
  const next = `${before}\n\n${trimmedBlock}${suffixSep}${after}`;
  return collapseExcessNewlinesAround(next, anchor + trimmedBlock.length + 2);
}

/**
 * Picks an existing editable block when the user clicks a keyboard element
 * without creating a new box.
 */
export function findPreferredEditableBlockIndex(
  blocks: PreviewBlock[],
  selectedBlockIndex: number | null
): number | null {
  const isEditable = (b: PreviewBlock | undefined) =>
    Boolean(b && b.kind !== 'toc' && b.kind !== 'divider');

  if (selectedBlockIndex !== null && isEditable(blocks[selectedBlockIndex])) {
    return selectedBlockIndex;
  }

  for (let i = blocks.length - 1; i >= 0; i--) {
    if (isEditable(blocks[i]) && blocks[i].kind !== 'title') {
      return i;
    }
  }

  for (let i = blocks.length - 1; i >= 0; i--) {
    if (isEditable(blocks[i])) {
      return i;
    }
  }

  return null;
}

function appendTextOrMathToProse(existing: string, snippetText: string, isMath: boolean): string {
  const clean = snippetText.trim();
  if (!clean) return existing;

  if (!isMath) {
    if (!existing.trim()) return clean;
    return /\s$/.test(existing) ? `${existing}${clean}` : `${existing} ${clean}`;
  }

  // If the existing text ends with inline math `$...$`, merge right inside it
  const trimmedRight = existing.replace(/[ \t]+$/, '');
  if (trimmedRight.endsWith('$') && !trimmedRight.endsWith('\\$') && !trimmedRight.endsWith('$$')) {
    const beforeCloseDollar = trimmedRight.slice(0, -1);
    const innerContent = beforeCloseDollar.replace(/[ \t]+$/, '');
    const needsSpace =
      innerContent.length > 0 && !innerContent.endsWith('$') && !innerContent.endsWith('{');
    return `${beforeCloseDollar}${needsSpace ? ' ' : ''}${clean}$`;
  }

  if (!existing.trim()) {
    return `$${clean}$`;
  }
  return /\s$/.test(existing) ? `${existing}$${clean}$` : `${existing} $${clean}$`;
}

export function appendSymbolToHeaderValue(
  existing: string,
  snippet: string,
  isMath: boolean
): string {
  const clean = snippet.replace(/\$0/g, '').trim();
  if (!clean) return existing;
  return appendTextOrMathToProse(existing, clean, isMath);
}

/**
 * Inserts a LaTeX snippet directly inside an existing block's raw LaTeX
 * (preserving delimiters, heading braces, or environment endings) without creating a new box.
 */
export function insertSnippetIntoBlockLatex(
  rawBlockLatex: string,
  kind: PreviewBlockKind,
  snippet: string,
  isMath = false
): string {
  let clean = snippet.replace(/\$0/g, '').trim();
  if (!clean) return rawBlockLatex;

  if (kind === 'math') {
    // Strip accidental outer $...$ if inserting inline-math snippet into an existing math block
    if (clean === '$$' || clean === '$  $') {
      clean = 'x';
    } else if (clean.startsWith('$') && clean.endsWith('$') && clean.length > 2) {
      clean = clean.slice(1, -1).trim();
    }

    if (rawBlockLatex.endsWith('\n\\]')) {
      const head = rawBlockLatex.slice(0, -3).replace(/[ \t]+$/, '');
      const sep = head.endsWith('\\[') ? '\n  ' : head.endsWith('\n') ? '  ' : ' ';
      return `${head}${sep}${clean}\n\\]`;
    }
    if (rawBlockLatex.endsWith('\\]')) {
      const head = rawBlockLatex.slice(0, -2).replace(/[ \t]+$/, '');
      const sep = head.endsWith('\\[') ? ' ' : ' ';
      return `${head}${sep}${clean} \\]`;
    }
    if (rawBlockLatex.endsWith('\n$$')) {
      const head = rawBlockLatex.slice(0, -3).replace(/[ \t]+$/, '');
      const sep = head.endsWith('$$') ? '\n  ' : ' ';
      return `${head}${sep}${clean}\n$$`;
    }
    if (rawBlockLatex.endsWith('$$') && rawBlockLatex.length > 4) {
      const head = rawBlockLatex.slice(0, -2).replace(/[ \t]+$/, '');
      return `${head} ${clean} $$`;
    }
    const endEnvMatch = rawBlockLatex.match(/(\n?[ \t]*\\end\{[^}]+\})$/);
    if (endEnvMatch && endEnvMatch.index !== undefined) {
      const head = rawBlockLatex.slice(0, endEnvMatch.index).replace(/[ \t]+$/, '');
      const tail = endEnvMatch[1];
      const sep = head.endsWith('}') || head.endsWith('\n') ? '\n  ' : ' ';
      return `${head}${sep}${clean}${tail}`;
    }
    return `${rawBlockLatex} ${clean}`;
  }

  if (kind === 'heading') {
    const cmdMatch = rawBlockLatex.match(/^(\\(?:section|subsection|subsubsection|paragraph)\*?\s*)\{/);
    if (cmdMatch) {
      const braceIdx = cmdMatch[0].length - 1;
      const parsedArg = readBraceArg(rawBlockLatex, braceIdx);
      if (parsedArg) {
        const nextInner = appendTextOrMathToProse(parsedArg.value, clean, isMath);
        return (
          rawBlockLatex.slice(0, braceIdx) +
          `{${nextInner}}` +
          rawBlockLatex.slice(parsedArg.nextIdx)
        );
      }
    }
    return appendTextOrMathToProse(rawBlockLatex, clean, isMath);
  }

  if (kind === 'environment') {
    const endEnvMatch = rawBlockLatex.match(/(\n?[ \t]*\\end\{([^}]+)\})$/);
    if (endEnvMatch && endEnvMatch.index !== undefined) {
      const envName = endEnvMatch[2];
      const head = rawBlockLatex.slice(0, endEnvMatch.index);
      const tail = endEnvMatch[1];

      if (envName === 'itemize' || envName === 'enumerate') {
        const trimmedHead = head.replace(/[ \t]+$/, '');
        if (/\\item\b/.test(trimmedHead)) {
          const updatedHead = appendTextOrMathToProse(trimmedHead, clean, isMath);
          return `${updatedHead}${tail}`;
        }
        const insertedItem = isMath ? `$${clean}$` : clean;
        return `${trimmedHead}\n  \\item ${insertedItem}${tail}`;
      }

      const updatedHead = appendTextOrMathToProse(head.replace(/[ \t]+$/, ''), clean, isMath);
      return `${updatedHead}${tail}`;
    }
    return appendTextOrMathToProse(rawBlockLatex, clean, isMath);
  }

  return appendTextOrMathToProse(rawBlockLatex, clean, isMath);
}

export function insertSymbolIntoExistingBlock(
  rawSource: string,
  block: PreviewBlock,
  sym: SymbolItem
): string {
  const isMath = isMathInsertionSymbol(sym);
  const snippetToInsert =
    sym.id === 'inlineMath'
      ? '$x$'
      : sym.category === 'structure' && STRUCTURE_PREVIEW_DEFAULTS[sym.id]
        ? STRUCTURE_PREVIEW_DEFAULTS[sym.id]
        : sym.snippet;

  const nextBlockLatex = insertSnippetIntoBlockLatex(
    block.rawLatex,
    block.kind,
    snippetToInsert,
    isMath
  );
  return replacePreviewBlock(rawSource, block, nextBlockLatex);
}

export function insertSnippetIntoExistingBlock(
  rawSource: string,
  block: PreviewBlock,
  snippet: string,
  isMath = false
): string {
  const nextBlockLatex = insertSnippetIntoBlockLatex(block.rawLatex, block.kind, snippet, isMath);
  return replacePreviewBlock(rawSource, block, nextBlockLatex);
}

/**
 * Removes a rendered preview block cleanly from the LaTeX source.
 */
export function removePreviewBlock(rawSource: string, block: PreviewBlock): string {
  const before = rawSource.slice(0, block.startOffset).replace(/[ \t]+$/, '');
  const after = rawSource.slice(block.endOffset).replace(/^[ \t]*\n?/, '');
  const combined = `${before}${before && after && !before.endsWith('\n') ? '\n' : ''}${after}`;
  return collapseExcessNewlinesAround(combined, before.length);
}

/**
 * Replaces a rendered preview block's LaTeX slice with updated LaTeX (or removes it if blank).
 */
export function replacePreviewBlock(
  rawSource: string,
  block: PreviewBlock,
  nextLatex: string
): string {
  const trimmed = nextLatex.trim();
  if (!trimmed) {
    return removePreviewBlock(rawSource, block);
  }
  return rawSource.slice(0, block.startOffset) + trimmed + rawSource.slice(block.endOffset);
}

/**
 * Swaps two preview blocks in rawSource without disturbing surrounding source or preamble.
 */
export function swapPreviewBlocks(
  rawSource: string,
  blocks: PreviewBlock[],
  indexA: number,
  indexB: number
): string {
  if (
    indexA === indexB ||
    indexA < 0 ||
    indexB < 0 ||
    indexA >= blocks.length ||
    indexB >= blocks.length
  ) {
    return rawSource;
  }

  const first = blocks[Math.min(indexA, indexB)];
  const second = blocks[Math.max(indexA, indexB)];

  return (
    rawSource.slice(0, first.startOffset) +
    second.rawLatex +
    rawSource.slice(first.endOffset, second.startOffset) +
    first.rawLatex +
    rawSource.slice(second.endOffset)
  );
}

function replaceOrInsertPreambleCommand(
  source: string,
  cmdName: 'title' | 'author' | 'date',
  value: string
): string {
  const regex = new RegExp(`\\\\${cmdName}\\s*\\{`);
  const match = regex.exec(source);
  if (match) {
    const braceIdx = match.index + match[0].length - 1;
    const parsed = readBraceArg(source, braceIdx);
    if (parsed) {
      return `${source.slice(0, braceIdx)}{${value}}${source.slice(parsed.nextIdx)}`;
    }
  }

  const beginDocIdx = source.indexOf('\\begin{document}');
  if (beginDocIdx !== -1) {
    return `${source.slice(0, beginDocIdx)}\\${cmdName}{${value}}\n${source.slice(beginDocIdx)}`;
  }

  return `\\${cmdName}{${value}}\n${source}`;
}

export function updateHeaderMetadata(
  rawSource: string,
  fields: { title: string; author: string; date: string }
): string {
  let updated = replaceOrInsertPreambleCommand(rawSource, 'title', fields.title);
  updated = replaceOrInsertPreambleCommand(updated, 'author', fields.author);
  updated = replaceOrInsertPreambleCommand(updated, 'date', fields.date);

  const hasAnyField = Boolean(fields.title.trim() || fields.author.trim() || fields.date.trim());
  if (hasAnyField && !updated.includes('\\maketitle')) {
    const beginDocIdx = updated.indexOf('\\begin{document}');
    if (beginDocIdx !== -1) {
      const afterBegin = beginDocIdx + '\\begin{document}'.length;
      updated = `${updated.slice(0, afterBegin)}\n\\maketitle${updated.slice(afterBegin)}`;
    }
  }

  return updated;
}
