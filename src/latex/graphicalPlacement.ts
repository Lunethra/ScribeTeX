import type { PreviewBlockKind } from '../types/editor';
import {
  extractStructuredRegions,
  extractSubPartSlots,
  getBlockEditableRange,
  insertAtLatexOffset,
  tokenizeForInsertion,
  type StructuredRegion,
  type TokenPlacementStrip,
} from './insertionSlots';
import { readBraceArg, readBracketArg } from './parser';
import { updateHeaderMetadata } from './previewMutations';

export type HeaderFieldKey = 'title' | 'author' | 'date';

export interface InlineMathSpan {
  mathIndex: number;
  outerStart: number;
  outerEnd: number;
  bodyStart: number;
  bodyEnd: number;
  isDisplay: boolean;
  visibleCharOffset: number;
}

export interface AtomicMacroSpan {
  atomIndex: number;
  startOffset: number;
  endOffset: number;
  visibleCharOffset: number;
}

export interface VisibleSourceIndex {
  sliceStart: number;
  sliceEnd: number;
  /** Length = visibleLength + 1; boundaries[v] is the rawLatex offset before visible char v */
  boundaries: number[];
  maths: InlineMathSpan[];
  atoms: AtomicMacroSpan[];
}

export interface CaretVisualRect {
  left: number;
  top: number;
  height: number;
}

export interface GraphicalHitResult {
  offset: number;
  label: string;
  headerField?: HeaderFieldKey;
  fieldOffset?: number;
  caretRect?: CaretVisualRect;
}

export interface ScopedEditTarget {
  startOffset: number;
  endOffset: number;
  label: string;
  code: string;
  headerField?: HeaderFieldKey;
  parentScope?: {
    startOffset: number;
    endOffset: number;
    label: string;
    code: string;
  };
}

function trimSliceBounds(source: string, start: number, end: number): { start: number; end: number } {
  let s = Math.max(0, start);
  let e = Math.min(source.length, end);
  while (s < e && /\s/.test(source[s])) s++;
  while (e > s && /\s/.test(source[e - 1])) e--;
  return { start: s, end: e };
}

function extractRawBraceCommand(source: string, cmdName: string): string {
  const regex = new RegExp(`\\\\${cmdName}\\s*\\{`);
  const match = regex.exec(source);
  if (!match) return '';
  const braceStart = match.index + match[0].length - 1;
  const parsed = readBraceArg(source, braceStart);
  return parsed ? parsed.value.trim() : '';
}

export function extractRawHeaderFields(rawSource: string): {
  title: string;
  author: string;
  date: string;
} {
  const beginDoc = rawSource.indexOf('\\begin{document}');
  const preambleText = beginDoc >= 0 ? rawSource.slice(0, beginDoc) : rawSource;
  return {
    title: extractRawBraceCommand(preambleText, 'title') || extractRawBraceCommand(rawSource, 'title'),
    author: extractRawBraceCommand(preambleText, 'author') || extractRawBraceCommand(rawSource, 'author'),
    date: extractRawBraceCommand(preambleText, 'date') || extractRawBraceCommand(rawSource, 'date'),
  };
}

export function insertAtHeaderField(
  rawSource: string,
  field: HeaderFieldKey,
  fieldOffset: number | undefined,
  snippet: string,
  isMathSymbol: boolean
): { nextSource: string; nextFieldOffset: number } {
  const fields = extractRawHeaderFields(rawSource);
  const current = fields[field];
  const targetOffset =
    fieldOffset === undefined ? current.length : Math.max(0, Math.min(fieldOffset, current.length));
  const { nextLatex, nextOffset } = insertAtLatexOffset(
    current,
    targetOffset,
    'paragraph',
    snippet,
    isMathSymbol
  );
  const nextSource = updateHeaderMetadata(rawSource, {
    ...fields,
    [field]: nextLatex,
  });
  return {
    nextSource,
    nextFieldOffset: nextOffset,
  };
}

/**
 * Walks rawLatex[sliceStart..sliceEnd] following parser.ts renderInline() rules
 * so every visible character position, inline .katex math element index, and
 * [data-latex-atom="true"] element index maps accurately back to a rawLatex offset.
 */
export function buildVisibleSourceIndex(
  rawLatex: string,
  sliceStart: number,
  sliceEnd: number
): VisibleSourceIndex {
  const clampedStart = Math.max(0, Math.min(sliceStart, rawLatex.length));
  const clampedEnd = Math.max(clampedStart, Math.min(sliceEnd, rawLatex.length));

  const boundaries: number[] = [clampedStart];
  const maths: InlineMathSpan[] = [];
  const atoms: AtomicMacroSpan[] = [];

  const pushVisibleChars = (count: number, endRawOffset: number) => {
    for (let k = 0; k < count; k++) {
      boundaries[boundaries.length - 1] =
        k === 0 ? boundaries[boundaries.length - 1] : endRawOffset;
      boundaries.push(endRawOffset);
    }
  };

  const pushPlainSlice = (start: number, end: number) => {
    for (let p = start; p < end; p++) {
      boundaries[boundaries.length - 1] = p;
      boundaries.push(p + 1);
    }
  };

  const walk = (start: number, end: number) => {
    let i = start;
    while (i < end) {
      // Escaped commands
      if (rawLatex[i] === '\\' && i + 1 < end) {
        const next = rawLatex[i + 1];

        // \[ ... \] display math inside text
        if (next === '[') {
          const closeIdx = rawLatex.indexOf('\\]', i + 2);
          if (closeIdx !== -1 && closeIdx + 2 <= end) {
            maths.push({
              mathIndex: maths.length,
              outerStart: i,
              outerEnd: closeIdx + 2,
              bodyStart: i + 2,
              bodyEnd: closeIdx,
              isDisplay: true,
              visibleCharOffset: boundaries.length - 1,
            });
            i = closeIdx + 2;
            boundaries[boundaries.length - 1] = i;
            continue;
          }
        }

        // \( ... \) inline math
        if (next === '(') {
          const closeIdx = rawLatex.indexOf('\\)', i + 2);
          if (closeIdx !== -1 && closeIdx + 2 <= end) {
            maths.push({
              mathIndex: maths.length,
              outerStart: i,
              outerEnd: closeIdx + 2,
              bodyStart: i + 2,
              bodyEnd: closeIdx,
              isDisplay: false,
              visibleCharOffset: boundaries.length - 1,
            });
            i = closeIdx + 2;
            boundaries[boundaries.length - 1] = i;
            continue;
          }
        }

        // \\ line break (0 visible chars)
        if (next === '\\') {
          i += 2;
          if (i < end && rawLatex[i] === '[') {
            const opt = readBracketArg(rawLatex.slice(0, end), i);
            if (opt) i = opt.nextIdx;
          }
          boundaries[boundaries.length - 1] = i;
          continue;
        }

        // Escaped literal characters -> 1 visible char
        if ('%$&#_{}'.includes(next)) {
          boundaries[boundaries.length - 1] = i;
          boundaries.push(i + 2);
          i += 2;
          continue;
        }

        // Diacritics \"{o}, \'e, etc. -> 1 visible char
        if (`"'~\`^=`.includes(next)) {
          const rest = rawLatex.slice(i + 2, end);
          const braced = rest.match(/^\{([a-zA-Z])\}/);
          const single = rest.match(/^([a-zA-Z])/);
          const ch = braced ? braced[1] : single ? single[1] : '';
          if (ch) {
            const nextPos = i + 2 + (braced ? braced[0].length : 1);
            boundaries[boundaries.length - 1] = i;
            boundaries.push(nextPos);
            i = nextPos;
            continue;
          }
        }

        // Named commands
        const cmdMatch = rawLatex.slice(i, end).match(/^\\([a-zA-Z]+\*?)/);
        if (cmdMatch) {
          const cmd = cmdMatch[1];
          const afterCmd = i + cmdMatch[0].length;
          const boundedSlice = rawLatex.slice(0, end);

          if (
            cmd === 'textbf' ||
            cmd === 'bf' ||
            cmd === 'textit' ||
            cmd === 'emph' ||
            cmd === 'it' ||
            cmd === 'underline' ||
            cmd === 'textsc' ||
            cmd === 'textsuperscript' ||
            cmd === 'textsubscript'
          ) {
            const arg = readBraceArg(boundedSlice, afterCmd);
            if (arg) {
              const openBrace = boundedSlice.indexOf('{', afterCmd);
              walk(openBrace + 1, arg.nextIdx - 1);
              i = arg.nextIdx;
              boundaries[boundaries.length - 1] = i;
              continue;
            }
          }

          if (cmd === 'texttt' || cmd === 'verb') {
            const arg = readBraceArg(boundedSlice, afterCmd);
            if (arg) {
              const openBrace = boundedSlice.indexOf('{', afterCmd);
              pushPlainSlice(openBrace + 1, arg.nextIdx - 1);
              i = arg.nextIdx;
              boundaries[boundaries.length - 1] = i;
              continue;
            }
          }

          if (cmd === 'textcolor' || cmd === 'colorbox') {
            const colorArg = readBraceArg(boundedSlice, afterCmd);
            if (colorArg) {
              const bodyArg = readBraceArg(boundedSlice, colorArg.nextIdx);
              if (bodyArg) {
                const bodyBrace = boundedSlice.indexOf('{', colorArg.nextIdx);
                walk(bodyBrace + 1, bodyArg.nextIdx - 1);
                i = bodyArg.nextIdx;
                boundaries[boundaries.length - 1] = i;
                continue;
              }
            }
          }

          if (cmd === 'href') {
            const urlArg = readBraceArg(boundedSlice, afterCmd);
            if (urlArg) {
              const labelArg = readBraceArg(boundedSlice, urlArg.nextIdx);
              if (labelArg) {
                const labelBrace = boundedSlice.indexOf('{', urlArg.nextIdx);
                walk(labelBrace + 1, labelArg.nextIdx - 1);
                i = labelArg.nextIdx;
                boundaries[boundaries.length - 1] = i;
                continue;
              }
            }
          }

          if (cmd === 'url') {
            const urlArg = readBraceArg(boundedSlice, afterCmd);
            if (urlArg) {
              const openBrace = boundedSlice.indexOf('{', afterCmd);
              pushPlainSlice(openBrace + 1, urlArg.nextIdx - 1);
              i = urlArg.nextIdx;
              boundaries[boundaries.length - 1] = i;
              continue;
            }
          }

          if (cmd === 'footnote' || cmd === 'ref' || cmd === 'eqref' || cmd === 'cite') {
            const arg = readBraceArg(boundedSlice, afterCmd);
            if (arg) {
              atoms.push({
                atomIndex: atoms.length,
                startOffset: i,
                endOffset: arg.nextIdx,
                visibleCharOffset: boundaries.length - 1,
              });
              i = arg.nextIdx;
              boundaries[boundaries.length - 1] = i;
              continue;
            }
          }

          if (
            cmd === 'LaTeX' ||
            cmd === 'TeX' ||
            cmd === 'today' ||
            cmd === 'newpage' ||
            cmd === 'clearpage' ||
            cmd === 'hrule'
          ) {
            atoms.push({
              atomIndex: atoms.length,
              startOffset: i,
              endOffset: afterCmd,
              visibleCharOffset: boundaries.length - 1,
            });
            i = afterCmd;
            boundaries[boundaries.length - 1] = i;
            continue;
          }

          if (cmd === 'label' || cmd === 'hspace' || cmd === 'vspace') {
            const arg = readBraceArg(boundedSlice, afterCmd);
            if (arg) {
              i = arg.nextIdx;
              boundaries[boundaries.length - 1] = i;
              continue;
            }
          }

          if (cmd === 'and') {
            pushVisibleChars(3, afterCmd);
            i = afterCmd;
            continue;
          }
          if (cmd === 'newline') {
            i = afterCmd;
            boundaries[boundaries.length - 1] = i;
            continue;
          }
          if (cmd === 'quad') {
            pushVisibleChars(1, afterCmd);
            i = afterCmd;
            continue;
          }
          if (cmd === 'qquad') {
            pushVisibleChars(2, afterCmd);
            i = afterCmd;
            continue;
          }
        }
      }

      // $$ ... $$ display math inside text
      if (rawLatex[i] === '$' && rawLatex[i + 1] === '$') {
        const closeIdx = rawLatex.indexOf('$$', i + 2);
        if (closeIdx !== -1 && closeIdx + 2 <= end) {
          maths.push({
            mathIndex: maths.length,
            outerStart: i,
            outerEnd: closeIdx + 2,
            bodyStart: i + 2,
            bodyEnd: closeIdx,
            isDisplay: true,
            visibleCharOffset: boundaries.length - 1,
          });
          i = closeIdx + 2;
          boundaries[boundaries.length - 1] = i;
          continue;
        }
      }

      // $ ... $ inline math
      if (rawLatex[i] === '$') {
        let closeIdx = -1;
        for (let j = i + 1; j < end; j++) {
          if (rawLatex[j] === '\\') {
            j++;
            continue;
          }
          if (rawLatex[j] === '$') {
            closeIdx = j;
            break;
          }
          if (rawLatex[j] === '\n' && rawLatex[j + 1] === '\n') {
            break;
          }
        }
        if (closeIdx !== -1) {
          maths.push({
            mathIndex: maths.length,
            outerStart: i,
            outerEnd: closeIdx + 1,
            bodyStart: i + 1,
            bodyEnd: closeIdx,
            isDisplay: false,
            visibleCharOffset: boundaries.length - 1,
          });
          i = closeIdx + 1;
          boundaries[boundaries.length - 1] = i;
          continue;
        }
      }

      // Scoped font size braces e.g. {\large Hello}
      if (rawLatex[i] === '{') {
        const boundedSlice = rawLatex.slice(0, end);
        const scoped = readBraceArg(boundedSlice, i);
        if (scoped) {
          const sizeMatch = scoped.value.match(
            /^(\s*\\(?:tiny|scriptsize|footnotesize|small|normalsize|large|Large|LARGE|huge|Huge)\b\s*)([\s\S]*)$/
          );
          if (sizeMatch) {
            const openBrace = boundedSlice.indexOf('{', i);
            const innerStart = openBrace + 1 + sizeMatch[1].length;
            walk(innerStart, scoped.nextIdx - 1);
            i = scoped.nextIdx;
            boundaries[boundaries.length - 1] = i;
            continue;
          }
        }
      }

      // Typographic ligatures
      if (rawLatex.startsWith('---', i) && i + 3 <= end) {
        boundaries[boundaries.length - 1] = i;
        boundaries.push(i + 3);
        i += 3;
        continue;
      }
      if (
        (rawLatex.startsWith('--', i) ||
          rawLatex.startsWith('``', i) ||
          rawLatex.startsWith("''", i)) &&
        i + 2 <= end
      ) {
        boundaries[boundaries.length - 1] = i;
        boundaries.push(i + 2);
        i += 2;
        continue;
      }
      if (rawLatex[i] === '~') {
        boundaries[boundaries.length - 1] = i;
        boundaries.push(i + 1);
        i += 1;
        continue;
      }

      // Regular visible character
      boundaries[boundaries.length - 1] = i;
      boundaries.push(i + 1);
      i++;
    }
  };

  walk(clampedStart, clampedEnd);

  return {
    sliceStart: clampedStart,
    sliceEnd: clampedEnd,
    boundaries,
    maths,
    atoms,
  };
}

export function resolveVisibleSourceOffset(
  index: VisibleSourceIndex,
  visibleCharIndex: number,
  mathBefore = Infinity,
  atomsBefore = Infinity
): number {
  const clamped = Math.max(0, Math.min(visibleCharIndex, index.boundaries.length - 1));
  const m = index.maths.find((item) => item.visibleCharOffset === clamped);
  if (m && mathBefore <= m.mathIndex) {
    return m.outerStart;
  }
  const a = index.atoms.find((item) => item.visibleCharOffset === clamped);
  if (a && atomsBefore <= a.atomIndex) {
    return a.startOffset;
  }
  return index.boundaries[clamped];
}

export function resolveVisibleTextOffset(
  rawLatex: string,
  sliceStart: number,
  sliceEnd: number,
  visibleCharIndex: number,
  mathBefore = Infinity,
  atomsBefore = Infinity
): number {
  const index = buildVisibleSourceIndex(rawLatex, sliceStart, sliceEnd);
  return resolveVisibleSourceOffset(index, visibleCharIndex, mathBefore, atomsBefore);
}

export function resolveBlockContainerSlice(
  rawLatex: string,
  kind: PreviewBlockKind,
  containerKind: 'block' | 'heading' | 'list-item' | 'table-cell' | 'header-field',
  itemIndex = 0,
  colIndex = 0
): { start: number; end: number; label: string } {
  if (containerKind === 'heading' || kind === 'heading') {
    const r = getBlockEditableRange(rawLatex, 'heading');
    return { ...r, label: 'Heading' };
  }

  if (containerKind === 'list-item') {
    const regions = extractStructuredRegions(rawLatex);
    const listRegion = regions.find((r) => r.kind === 'list');
    const cell = listRegion?.cells[itemIndex];
    if (cell) {
      return {
        start: cell.trimStartOffset,
        end: cell.trimEndOffset,
        label: cell.label,
      };
    }
  }

  if (containerKind === 'table-cell') {
    const regions = extractStructuredRegions(rawLatex);
    const tableRegion = regions.find((r) => r.kind === 'table');
    const cell = tableRegion?.cells.find(
      (c) => c.rowIndex === itemIndex && c.colIndex === colIndex
    );
    if (cell) {
      return {
        start: cell.trimStartOffset,
        end: cell.trimEndOffset,
        label: cell.label,
      };
    }
  }

  if (kind === 'environment') {
    const bodyRange = getBlockEditableRange(rawLatex, 'environment');
    let bodyStart = bodyRange.start;
    const bodyEnd = bodyRange.end;
    const envMatch = rawLatex.match(/^\\begin\{([^}]+)\}/);
    const envName = envMatch ? envMatch[1] : '';

    // Theorem/Proof optional [Subtitle] sits at start of body
    if (
      envName === 'proof' ||
      envName === 'theorem' ||
      envName === 'lemma' ||
      envName === 'proposition' ||
      envName === 'corollary' ||
      envName === 'definition' ||
      envName === 'remark' ||
      envName === 'example'
    ) {
      const trimmedStart = rawLatex.slice(bodyStart, bodyEnd).search(/\S/);
      if (trimmedStart !== -1) {
        const absStart = bodyStart + trimmedStart;
        if (rawLatex[absStart] === '[') {
          const opt = readBracketArg(rawLatex.slice(0, bodyEnd), absStart);
          if (opt) {
            bodyStart = opt.nextIdx;
          }
        }
      }
    }

    const t = trimSliceBounds(rawLatex, bodyStart, bodyEnd);
    return {
      start: t.start,
      end: t.end,
      label: envName ? `${envName} body` : 'Block',
    };
  }

  const bodyRange = getBlockEditableRange(rawLatex, kind);
  const t = trimSliceBounds(rawLatex, bodyRange.start, bodyRange.end);
  return { start: t.start, end: t.end, label: kind === 'paragraph' ? 'Paragraph text' : 'Text' };
}

function getCaretPositionFromPoint(
  clientX: number,
  clientY: number
): { node: Node; offset: number; rect: DOMRect | null } | null {
  const docWithCaret = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };

  if (typeof docWithCaret.caretRangeFromPoint === 'function') {
    const range = docWithCaret.caretRangeFromPoint(clientX, clientY);
    if (range) {
      const rects = range.getClientRects();
      const rect = rects.length > 0 ? rects[0] : range.getBoundingClientRect();
      return { node: range.startContainer, offset: range.startOffset, rect };
    }
  }

  if (typeof docWithCaret.caretPositionFromPoint === 'function') {
    const pos = docWithCaret.caretPositionFromPoint(clientX, clientY);
    if (pos) {
      const r = document.createRange();
      try {
        r.setStart(pos.offsetNode, pos.offset);
        r.collapse(true);
        return { node: pos.offsetNode, offset: pos.offset, rect: r.getBoundingClientRect() };
      } catch {
        return { node: pos.offsetNode, offset: pos.offset, rect: null };
      }
    }
  }

  return null;
}

/**
 * Counts visible characters, .katex elements, and [data-latex-atom="true"] elements
 * inside `containerEl` strictly before the caret (targetNode, targetOffset).
 */
function measureContainerCaret(
  containerEl: Element,
  targetNode: Node,
  targetOffset: number
): { visibleChars: number; mathBefore: number; atomsBefore: number } {
  let visibleChars = 0;
  let mathBefore = 0;
  let atomsBefore = 0;
  let reached = false;

  const walkDom = (node: Node) => {
    if (reached) return;

    if (node === targetNode) {
      if (node.nodeType === Node.TEXT_NODE) {
        visibleChars += Math.max(0, Math.min(targetOffset, (node.textContent ?? '').length));
        reached = true;
        return;
      }
      const kids = Array.from(node.childNodes);
      for (let idx = 0; idx < targetOffset && idx < kids.length; idx++) {
        walkDom(kids[idx]);
        if (reached) return;
      }
      reached = true;
      return;
    }

    if (node.nodeType === Node.TEXT_NODE) {
      visibleChars += (node.textContent ?? '').length;
      return;
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      if (el.getAttribute('data-preview-chrome') === 'true') {
        return;
      }
      if (el.classList.contains('katex')) {
        if (el.contains(targetNode)) {
          reached = true;
          return;
        }
        mathBefore++;
        return;
      }
      if (el.getAttribute('data-latex-atom') === 'true') {
        if (el.contains(targetNode)) {
          reached = true;
          return;
        }
        atomsBefore++;
        return;
      }
      for (const child of Array.from(el.childNodes)) {
        walkDom(child);
        if (reached) return;
      }
    }
  };

  walkDom(containerEl);
  return { visibleChars, mathBefore, atomsBefore };
}

function collectLeafMathSymbols(rootEl: Element): Array<{ el: HTMLElement; rect: DOMRect }> {
  const results: Array<{ el: HTMLElement; rect: DOMRect }> = [];
  const candidates = rootEl.querySelectorAll<HTMLElement>(
    '.katex-html span.mord, .katex-html span.mbin, .katex-html span.mrel, .katex-html span.mop, .katex-html span.mopen, .katex-html span.mclose, .katex-html span.mpunct'
  );
  const all = candidates.length > 0 ? Array.from(candidates) : Array.from(rootEl.querySelectorAll<HTMLElement>('span'));

  for (const el of all) {
    if (
      el.classList.contains('strut') ||
      el.classList.contains('pstrut') ||
      el.classList.contains('vlist-s') ||
      el.classList.contains('nulldelimiter') ||
      el.closest('.strut, .pstrut')
    ) {
      continue;
    }
    const hasChildSpan = el.querySelector(
      'span.mord, span.mbin, span.mrel, span.mop, span.mopen, span.mclose, span.mpunct'
    );
    if (hasChildSpan) continue;
    const text = (el.textContent ?? '').trim();
    if (!text) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    results.push({ el, rect });
  }

  results.sort((a, b) => a.rect.left - b.rect.left);
  return results;
}

function resolveStripOffsetByHorizontalPoint(
  strip: TokenPlacementStrip,
  mathRootEl: Element,
  clientX: number,
  fallbackLabelPrefix: string
): { offset: number; label: string; caretRect: CaretVisualRect | null } {
  const gaps = strip.gaps;
  if (gaps.length === 0) {
    return {
      offset: strip.rangeStart,
      label: fallbackLabelPrefix,
      caretRect: null,
    };
  }

  const rootRect = mathRootEl.getBoundingClientRect();
  const leaves = collectLeafMathSymbols(mathRootEl);

  if (leaves.length === 0 || gaps.length === 1) {
    const firstGap = gaps[0];
    return {
      offset: firstGap.offset,
      label: `${fallbackLabelPrefix}${firstGap.label ? ` · ${firstGap.label}` : ''}`,
      caretRect:
        rootRect.width > 0
          ? {
              left: clientX >= rootRect.left + rootRect.width / 2 ? rootRect.right : rootRect.left,
              top: rootRect.top,
              height: Math.max(16, rootRect.height),
            }
          : null,
    };
  }

  // Deduplicate nearly identical x-columns (superscripts/stacked symbols)
  const columns: Array<{ left: number; right: number; top: number; bottom: number }> = [];
  for (const leaf of leaves) {
    const prev = columns[columns.length - 1];
    if (prev && Math.abs(leaf.rect.left - prev.left) < 4) {
      prev.left = Math.min(prev.left, leaf.rect.left);
      prev.right = Math.max(prev.right, leaf.rect.right);
      prev.top = Math.min(prev.top, leaf.rect.top);
      prev.bottom = Math.max(prev.bottom, leaf.rect.bottom);
    } else {
      columns.push({
        left: leaf.rect.left,
        right: leaf.rect.right,
        top: leaf.rect.top,
        bottom: leaf.rect.bottom,
      });
    }
  }

  let visualSlot = columns.length;
  for (let idx = 0; idx < columns.length; idx++) {
    const colMid = (columns[idx].left + columns[idx].right) / 2;
    if (clientX < colMid) {
      visualSlot = idx;
      break;
    }
  }

  const ratio = columns.length > 0 ? visualSlot / columns.length : 0;
  const gapIdx = Math.max(0, Math.min(gaps.length - 1, Math.round(ratio * (gaps.length - 1))));
  const chosenGap = gaps[gapIdx];

  let caretLeft: number;
  let caretTop = rootRect.top;
  let caretHeight = Math.max(18, rootRect.height);

  if (visualSlot === 0) {
    caretLeft = columns[0].left - 1;
    caretTop = columns[0].top;
    caretHeight = Math.max(16, columns[0].bottom - columns[0].top);
  } else if (visualSlot >= columns.length) {
    const lastCol = columns[columns.length - 1];
    caretLeft = lastCol.right + 1;
    caretTop = lastCol.top;
    caretHeight = Math.max(16, lastCol.bottom - lastCol.top);
  } else {
    const prevCol = columns[visualSlot - 1];
    const nextCol = columns[visualSlot];
    caretLeft = (prevCol.right + nextCol.left) / 2;
    caretTop = Math.min(prevCol.top, nextCol.top);
    caretHeight = Math.max(16, Math.max(prevCol.bottom, nextCol.bottom) - caretTop);
  }

  return {
    offset: chosenGap.offset,
    label: fallbackLabelPrefix
      ? `${fallbackLabelPrefix} (${chosenGap.label})`
      : chosenGap.label,
    caretRect: {
      left: caretLeft,
      top: caretTop,
      height: caretHeight,
    },
  };
}

function getMtableDirectRows(colEl: Element): Array<{ el: HTMLElement; rect: DOMRect }> {
  let spans = Array.from(
    colEl.querySelectorAll<HTMLElement>(
      ':scope > span > span:first-child > .vlist > span:not(.vlist-s)'
    )
  );
  if (spans.length === 0) {
    spans = Array.from(
      colEl.querySelectorAll<HTMLElement>('.vlist-r:first-child > .vlist > span:not(.vlist-s)')
    );
  }
  return spans
    .map((spanEl) => {
      const content =
        spanEl.querySelector<HTMLElement>(':scope > span:not(.pstrut)') ?? spanEl;
      return { el: content, rect: content.getBoundingClientRect() };
    })
    .filter((entry) => entry.rect.height > 0 || entry.rect.width > 0)
    .sort((a, b) => a.rect.top - b.rect.top);
}

function resolveClickedMtableCell(
  katexEl: Element,
  rawLatex: string,
  mathStart: number,
  mathEnd: number,
  clientX: number,
  clientY: number,
  hitEl: Element | null
): {
  region: StructuredRegion;
  matchedCell: StructuredRegion['cells'][number];
  matchedRowEl: Element;
} | null {
  const mtableEl = katexEl.querySelector('.mtable');
  if (!mtableEl) return null;

  const colEls = Array.from(mtableEl.children).filter((ch) => /col-align-/.test(ch.className));
  const baseRect = mtableEl.getBoundingClientRect();
  let minLeft = baseRect.left;
  let maxRight = baseRect.right;
  let minTop = baseRect.top;
  let maxBottom = baseRect.bottom;

  for (const colEl of colEls) {
    const colRect = colEl.getBoundingClientRect();
    minLeft = Math.min(minLeft, colRect.left);
    maxRight = Math.max(maxRight, colRect.right);
    for (const row of getMtableDirectRows(colEl)) {
      minTop = Math.min(minTop, row.rect.top);
      maxBottom = Math.max(maxBottom, row.rect.bottom);
    }
  }

  const hitInsideMtable = hitEl?.closest?.('.mtable') === mtableEl;
  const inVisualBounds =
    clientX >= minLeft - 8 &&
    clientX <= maxRight + 8 &&
    clientY >= minTop - 8 &&
    clientY <= maxBottom + 8;

  if (!hitInsideMtable && !inVisualBounds) return null;

  const regions = extractStructuredRegions(rawLatex);
  const region = regions.find(
    (r) =>
      (r.kind === 'matrix' || r.kind === 'cases' || r.kind === 'align' || r.kind === 'table') &&
      r.startOffset >= mathStart - 32 &&
      r.endOffset <= mathEnd + 32
  );
  if (!region || region.cells.length === 0) return null;

  let targetCol = 0;
  if (colEls.length > 0) {
    let bestColDist = Infinity;
    colEls.forEach((colEl, idx) => {
      const r = colEl.getBoundingClientRect();
      const dist =
        clientX < r.left ? r.left - clientX : clientX > r.right ? clientX - r.right : 0;
      if (dist < bestColDist) {
        bestColDist = dist;
        targetCol = idx;
      }
    });
  }

  const chosenColEl = colEls[targetCol] ?? mtableEl;
  const rowSpans = getMtableDirectRows(chosenColEl);

  let targetRow = 0;
  let matchedRowEl: Element = chosenColEl;
  if (rowSpans.length > 0) {
    let bestRowDist = Infinity;
    rowSpans.forEach((entry, idx) => {
      const centerY = entry.rect.top + entry.rect.height / 2;
      const dist = Math.abs(clientY - centerY);
      if (dist < bestRowDist) {
        bestRowDist = dist;
        targetRow = idx;
        matchedRowEl = entry.el;
      }
    });
  }

  const matchedCell =
    region.cells.find((c) => c.rowIndex === targetRow && c.colIndex === targetCol) ??
    region.cells.find((c) => c.rowIndex === targetRow) ??
    region.cells[0];

  return { region, matchedCell, matchedRowEl };
}

function resolveMathDomPoint(
  katexEl: Element,
  rawLatex: string,
  mathStart: number,
  mathEnd: number,
  clientX: number,
  clientY: number,
  labelPrefix = ''
): GraphicalHitResult {
  const hitEl = document.elementFromPoint(clientX, clientY);

  // 1. Check if pointer is inside an .mtable (matrix / cases / align / array)
  const mtableHit = resolveClickedMtableCell(
    katexEl,
    rawLatex,
    mathStart,
    mathEnd,
    clientX,
    clientY,
    hitEl
  );
  if (mtableHit) {
    const { matchedCell, matchedRowEl } = mtableHit;
    const cellStrip = tokenizeForInsertion(
      rawLatex,
      matchedCell.trimStartOffset,
      matchedCell.trimEndOffset
    );
    const resolved = resolveStripOffsetByHorizontalPoint(
      cellStrip,
      matchedRowEl,
      clientX,
      matchedCell.label
    );

    return {
      offset: resolved.offset,
      label: labelPrefix ? `${labelPrefix} · ${resolved.label}` : resolved.label,
      caretRect: resolved.caretRect ?? undefined,
    };
  }

  // 2. Check if pointer is inside an .mfrac (fraction)
  const mfracEl = hitEl?.closest?.('.mfrac');
  if (mfracEl && katexEl.contains(mfracEl)) {
    const fracLine = mfracEl.querySelector('.frac-line');
    if (fracLine) {
      const lineRect = fracLine.getBoundingClientRect();
      const fracIdx = Array.from(katexEl.querySelectorAll('.mfrac')).indexOf(mfracEl);
      const subSlots = extractSubPartSlots(rawLatex.slice(mathStart, mathEnd)).filter(
        (s) => s.groupLabel === 'Fraction' || s.groupLabel === 'Binomial'
      );
      const isNumerator = clientY < lineRect.top + lineRect.height / 2;
      const numSlot = subSlots[fracIdx * 2];
      const denSlot = subSlots[fracIdx * 2 + 1];
      const targetSub = isNumerator ? numSlot : denSlot;
      if (targetSub) {
        const absStart = mathStart + targetSub.trimStartOffset;
        const absEnd = mathStart + targetSub.trimEndOffset;
        const strip = tokenizeForInsertion(rawLatex, absStart, absEnd);
        const resolved = resolveStripOffsetByHorizontalPoint(
          strip,
          mfracEl,
          clientX,
          targetSub.label
        );
        const mfracRect = mfracEl.getBoundingClientRect();
        return {
          offset: resolved.offset,
          label: labelPrefix ? `${labelPrefix} · ${resolved.label}` : resolved.label,
          caretRect: {
            left: resolved.caretRect?.left ?? Math.max(mfracRect.left, Math.min(clientX, mfracRect.right)),
            top: isNumerator ? mfracRect.top : lineRect.bottom + 1,
            height: Math.max(
              14,
              isNumerator ? lineRect.top - mfracRect.top : mfracRect.bottom - lineRect.bottom
            ),
          },
        };
      }
    }
  }

  // 3. General math formula horizontal resolution
  const strip = tokenizeForInsertion(rawLatex, mathStart, mathEnd);
  const resolved = resolveStripOffsetByHorizontalPoint(strip, katexEl, clientX, labelPrefix);
  return {
    offset: resolved.offset,
    label: resolved.label || 'Equation',
    caretRect: resolved.caretRect ?? undefined,
  };
}

/**
 * Resolves a browser click or drag point directly inside a rendered preview block
 * into the exact LaTeX offset + visual caret coordinates inside the rendered preview!
 */
export function resolveGraphicalHitInBlock(
  blockEl: HTMLElement,
  rawLatex: string,
  kind: PreviewBlockKind,
  rawHeaderFields: { title: string; author: string; date: string },
  clientX: number,
  clientY: number
): GraphicalHitResult | null {
  const renderHost = blockEl.querySelector<HTMLElement>('[data-block-render-host="true"]');
  if (!renderHost) return null;

  const hitEl = document.elementFromPoint(clientX, clientY);

  // Special handling for Document Header fields (<header> with data-header-field)
  if (kind === 'title') {
    const fieldEl =
      hitEl?.closest<HTMLElement>('[data-header-field]') ??
      renderHost.querySelector<HTMLElement>('[data-header-field="title"]');
    if (!fieldEl) return null;
    const fieldAttr = fieldEl.getAttribute('data-header-field');
    const field: HeaderFieldKey =
      fieldAttr === 'author' ? 'author' : fieldAttr === 'date' ? 'date' : 'title';
    const fieldLabel =
      field === 'author' ? 'Description' : field === 'date' ? 'Date' : 'Header title';
    const rawVal = rawHeaderFields[field];
    const isEmpty = fieldEl.getAttribute('data-preview-empty') === 'true' || !rawVal;

    if (isEmpty) {
      const rect = fieldEl.getBoundingClientRect();
      return {
        offset: field === 'author' ? 1 : field === 'date' ? 2 : 0,
        fieldOffset: 0,
        headerField: field,
        label: fieldLabel,
        caretRect: {
          left: rect.left + rect.width / 2,
          top: rect.top + 2,
          height: Math.max(18, rect.height - 4),
        },
      };
    }

    if (field === 'date' && rawVal === '\\today') {
      const rect = fieldEl.getBoundingClientRect();
      return {
        offset: 2,
        fieldOffset: rawVal.length,
        headerField: 'date',
        label: 'Date',
        caretRect: {
          left: rect.right + 1,
          top: rect.top + 2,
          height: Math.max(16, rect.height - 4),
        },
      };
    }

    const katexEl = hitEl?.closest?.('.katex');
    const sourceIdx = buildVisibleSourceIndex(rawVal, 0, rawVal.length);
    if (katexEl && fieldEl.contains(katexEl)) {
      const allKatex = Array.from(fieldEl.querySelectorAll('.katex'));
      const kIdx = allKatex.indexOf(katexEl);
      const mathSpan = sourceIdx.maths[kIdx];
      if (mathSpan) {
        const res = resolveMathDomPoint(
          katexEl,
          rawVal,
          mathSpan.bodyStart,
          mathSpan.bodyEnd,
          clientX,
          clientY,
          fieldLabel
        );
        return {
          offset: field === 'author' ? 1 : field === 'date' ? 2 : 0,
          fieldOffset: res.offset,
          headerField: field,
          label: res.label,
          caretRect: res.caretRect,
        };
      }
    }

    const caretPos = getCaretPositionFromPoint(clientX, clientY);
    if (caretPos && fieldEl.contains(caretPos.node)) {
      const measured = measureContainerCaret(fieldEl, caretPos.node, caretPos.offset);
      const nextOffset = resolveVisibleSourceOffset(
        sourceIdx,
        measured.visibleChars,
        measured.mathBefore,
        measured.atomsBefore
      );
      const fieldRect = fieldEl.getBoundingClientRect();
      return {
        offset: field === 'author' ? 1 : field === 'date' ? 2 : 0,
        fieldOffset: nextOffset,
        headerField: field,
        label: fieldLabel,
        caretRect:
          caretPos.rect && caretPos.rect.height > 0
            ? {
                left: caretPos.rect.left,
                top: caretPos.rect.top,
                height: Math.max(16, caretPos.rect.height),
              }
            : {
                left: fieldRect.right,
                top: fieldRect.top + 2,
                height: Math.max(16, fieldRect.height - 4),
              },
      };
    }

    const fieldRect = fieldEl.getBoundingClientRect();
    return {
      offset: field === 'author' ? 1 : field === 'date' ? 2 : 0,
      fieldOffset: rawVal.length,
      headerField: field,
      label: fieldLabel,
      caretRect: {
        left: fieldRect.right,
        top: fieldRect.top + 2,
        height: Math.max(16, fieldRect.height - 4),
      },
    };
  }

  // Display math block
  if (kind === 'math') {
    const katexEl =
      hitEl?.closest?.('.katex') ?? renderHost.querySelector('.katex');
    const bodyRange = getBlockEditableRange(rawLatex, 'math');
    const trimmed = trimSliceBounds(rawLatex, bodyRange.start, bodyRange.end);

    if (katexEl) {
      return resolveMathDomPoint(
        katexEl,
        rawLatex,
        trimmed.start,
        trimmed.end,
        clientX,
        clientY,
        'Equation'
      );
    }
    const rect = renderHost.getBoundingClientRect();
    return {
      offset: trimmed.end,
      label: 'Equation',
      caretRect: {
        left: rect.left + rect.width / 2,
        top: rect.top + 4,
        height: Math.max(20, rect.height - 8),
      },
    };
  }

  // Prose / Heading / List / Table / Theorem / Proof / Abstract / Quote
  let containerEl: Element = renderHost;
  let slice: { start: number; end: number; label: string };

  const tdEl = hitEl?.closest?.('td, th');
  const liEl = hitEl?.closest?.('li');
  const headingEl = hitEl?.closest?.('h1, h2, h3, h4') ?? renderHost.querySelector('h2, h3, h4');

  if (tdEl && renderHost.contains(tdEl)) {
    const tableEl = tdEl.closest('table');
    const rows = tableEl ? Array.from(tableEl.querySelectorAll('tr')) : [];
    const trEl = tdEl.closest('tr');
    const rowIdx = trEl ? rows.indexOf(trEl) : 0;
    const cellsInRow = trEl ? Array.from(trEl.querySelectorAll('td, th')) : [];
    const colIdx = cellsInRow.indexOf(tdEl);
    containerEl = tdEl;
    slice = resolveBlockContainerSlice(rawLatex, kind, 'table-cell', Math.max(0, rowIdx), Math.max(0, colIdx));
  } else if (liEl && renderHost.contains(liEl)) {
    const listItems = Array.from(renderHost.querySelectorAll('li'));
    const liIdx = Math.max(0, listItems.indexOf(liEl));
    containerEl = liEl;
    slice = resolveBlockContainerSlice(rawLatex, kind, 'list-item', liIdx);
  } else if (kind === 'heading' && headingEl && renderHost.contains(headingEl)) {
    containerEl = headingEl;
    slice = resolveBlockContainerSlice(rawLatex, kind, 'heading');
  } else {
    slice = resolveBlockContainerSlice(rawLatex, kind, 'block');
    const pEl = hitEl?.closest?.('p');
    if (pEl && renderHost.contains(pEl)) {
      const allParas = Array.from(renderHost.querySelectorAll('p'));
      const pIdx = allParas.indexOf(pEl);
      containerEl = pEl;
      if (kind === 'environment' && pIdx >= 0 && allParas.length > 1) {
        // Scope slice to the N-th blank-line-separated paragraph inside environment body
        const innerText = rawLatex.slice(slice.start, slice.end);
        const parts = innerText.split(/\n\s*\n/);
        if (parts[pIdx]) {
          let offsetAcc = slice.start;
          const sepMatches = Array.from(innerText.matchAll(/\n\s*\n/g));
          const partStart = pIdx === 0 ? 0 : (sepMatches[pIdx - 1]?.index ?? 0) + (sepMatches[pIdx - 1]?.[0].length ?? 0);
          const partEnd = pIdx < sepMatches.length ? (sepMatches[pIdx].index ?? innerText.length) : innerText.length;
          const trimmedSub = trimSliceBounds(rawLatex, offsetAcc + partStart, offsetAcc + partEnd);
          slice = { ...slice, start: trimmedSub.start, end: trimmedSub.end };
        }
      }
    }
  }

  const sourceIdx = buildVisibleSourceIndex(rawLatex, slice.start, slice.end);

  // Check if user clicked/dragged directly inside an inline math expression ($...$)
  const inlineKatex = hitEl?.closest?.('.katex');
  if (inlineKatex && containerEl.contains(inlineKatex)) {
    const allKatex = Array.from(containerEl.querySelectorAll('.katex'));
    const kIdx = allKatex.indexOf(inlineKatex);
    const mathSpan = sourceIdx.maths[kIdx];
    if (mathSpan) {
      return resolveMathDomPoint(
        inlineKatex,
        rawLatex,
        mathSpan.bodyStart,
        mathSpan.bodyEnd,
        clientX,
        clientY,
        'Inline math'
      );
    }
  }

  // Otherwise resolve prose caret position cleanly
  const caretPos = getCaretPositionFromPoint(clientX, clientY);
  if (caretPos && containerEl.contains(caretPos.node)) {
    const measured = measureContainerCaret(containerEl, caretPos.node, caretPos.offset);
    const targetOffset = resolveVisibleSourceOffset(
      sourceIdx,
      measured.visibleChars,
      measured.mathBefore,
      measured.atomsBefore
    );

    // If caret sits right before/inside an atomic span, snap cleanly
    if (
      caretPos.rect &&
      caretPos.rect.height > 0 &&
      caretPos.rect.width <= 4
    ) {
      return {
        offset: targetOffset,
        label: slice.label,
        caretRect: {
          left: caretPos.rect.left,
          top: caretPos.rect.top,
          height: Math.max(16, caretPos.rect.height),
        },
      };
    }

    // Fallback when range.getBoundingClientRect spans an element edge
    const cRect = containerEl.getBoundingClientRect();
    const caretLeft =
      caretPos.rect && caretPos.rect.height > 0 ? caretPos.rect.left : clientX;
    const caretTop =
      caretPos.rect && caretPos.rect.height > 0 ? caretPos.rect.top : Math.max(cRect.top, clientY - 9);
    const caretHeight =
      caretPos.rect && caretPos.rect.height > 0 ? Math.max(16, caretPos.rect.height) : 18;

    return {
      offset: targetOffset,
      label: slice.label,
      caretRect: {
        left: caretLeft,
        top: caretTop,
        height: caretHeight,
      },
    };
  }

  // Fallback if pointer was on block padding next to a short line/empty heading
  const cRect = containerEl.getBoundingClientRect();
  const isNearStart = clientX <= cRect.left + Math.min(24, cRect.width * 0.25);
  return {
    offset: isNearStart ? slice.start : slice.end,
    label: slice.label,
    caretRect: {
      left: isNearStart ? cRect.left + 2 : Math.min(cRect.right, cRect.left + 12),
      top: cRect.top + 2,
      height: Math.max(16, Math.min(28, cRect.height - 4)),
    },
  };
}

const INLINE_FORMAT_COMMANDS = new Set([
  'textbf',
  'bf',
  'textit',
  'emph',
  'it',
  'underline',
  'textsc',
  'texttt',
  'verb',
  'textsuperscript',
  'textsubscript',
  'textcolor',
  'colorbox',
  'href',
  'url',
]);

function isWordChar(ch: string | undefined): boolean {
  if (!ch) return false;
  return /[a-zA-Z0-9''\u2019-]/.test(ch) || ch.charCodeAt(0) > 127;
}

interface EnclosingFormatSpan {
  cmd: string;
  cmdStart: number;
  cmdEnd: number;
  innerStart: number;
  innerEnd: number;
}

function findEnclosingFormatSpan(
  rawLatex: string,
  sliceStart: number,
  sliceEnd: number,
  offset: number
): EnclosingFormatSpan | null {
  let i = sliceStart;
  while (i < sliceEnd) {
    if (rawLatex[i] === '\\') {
      const m = rawLatex.slice(i, sliceEnd).match(/^\\([a-zA-Z]+)/);
      if (m) {
        const cmd = m[1];
        const afterCmd = i + m[0].length;
        const bounded = rawLatex.slice(0, sliceEnd);
        if (INLINE_FORMAT_COMMANDS.has(cmd)) {
          const arg1 = readBraceArg(bounded, afterCmd);
          if (arg1) {
            if (cmd === 'textcolor' || cmd === 'colorbox' || cmd === 'href') {
              const arg2 = readBraceArg(bounded, arg1.nextIdx);
              if (arg2 && offset >= i && offset <= arg2.nextIdx) {
                const bodyBrace = bounded.indexOf('{', arg1.nextIdx);
                return {
                  cmd,
                  cmdStart: i,
                  cmdEnd: arg2.nextIdx,
                  innerStart: bodyBrace + 1,
                  innerEnd: arg2.nextIdx - 1,
                };
              }
              if (arg2) {
                i = arg2.nextIdx;
                continue;
              }
            } else if (offset >= i && offset <= arg1.nextIdx) {
              const openBrace = bounded.indexOf('{', afterCmd);
              return {
                cmd,
                cmdStart: i,
                cmdEnd: arg1.nextIdx,
                innerStart: openBrace + 1,
                innerEnd: arg1.nextIdx - 1,
              };
            }
            i = arg1.nextIdx;
            continue;
          }
        }
        i = afterCmd;
        continue;
      }
      i += 2;
      continue;
    }
    i++;
  }
  return null;
}

/**
 * Pure resolver: maps a hit offset inside a prose slice to the exact clicked word,
 * enclosing short formatting command, or atomic LaTeX macro (\cite, \ref, etc.).
 */
export function resolveProseScopedSlice(
  rawLatex: string,
  sliceStart: number,
  sliceEnd: number,
  hitOffset: number,
  blockLabel = 'Text'
): ScopedEditTarget {
  const clampedStart = Math.max(0, Math.min(sliceStart, rawLatex.length));
  const clampedEnd = Math.max(clampedStart, Math.min(sliceEnd, rawLatex.length));
  const clampedHit = Math.max(clampedStart, Math.min(hitOffset, clampedEnd));

  const index = buildVisibleSourceIndex(rawLatex, clampedStart, clampedEnd);

  // 1. Check if hitOffset sits inside an atomic macro (\cite, \ref, \footnote, \LaTeX, etc.)
  const hitAtom = index.atoms.find(
    (a) => clampedHit >= a.startOffset && clampedHit <= a.endOffset
  );
  if (hitAtom) {
    return {
      startOffset: hitAtom.startOffset,
      endOffset: hitAtom.endOffset,
      label: 'LaTeX Command',
      code: rawLatex.slice(hitAtom.startOffset, hitAtom.endOffset),
      parentScope:
        clampedEnd - clampedStart > hitAtom.endOffset - hitAtom.startOffset
          ? {
              startOffset: clampedStart,
              endOffset: clampedEnd,
              label: blockLabel,
              code: rawLatex.slice(clampedStart, clampedEnd),
            }
          : undefined,
    };
  }

  // 1b. Check if clampedHit lands inside or directly on an inline math span ($...$, \(...\))
  const touchingMath = index.maths.find(
    (m) =>
      (clampedHit > m.outerStart && clampedHit < m.outerEnd) ||
      ((clampedHit === m.outerStart || clampedHit === m.outerEnd) &&
        !isWordChar(rawLatex[clampedHit]) &&
        !(clampedHit > clampedStart && isWordChar(rawLatex[clampedHit - 1])))
  );
  if (touchingMath) {
    return {
      startOffset: touchingMath.bodyStart,
      endOffset: touchingMath.bodyEnd,
      label: 'Inline Math',
      code: rawLatex.slice(touchingMath.bodyStart, touchingMath.bodyEnd),
      parentScope:
        clampedEnd - clampedStart > touchingMath.bodyEnd - touchingMath.bodyStart
          ? {
              startOffset: clampedStart,
              endOffset: clampedEnd,
              label: blockLabel,
              code: rawLatex.slice(clampedStart, clampedEnd),
            }
          : undefined,
    };
  }

  // 2. Check enclosing formatting command (\textbf{...}, \emph{...}, etc.)
  const fmt = findEnclosingFormatSpan(rawLatex, clampedStart, clampedEnd, clampedHit);
  const wordBoundsMin = fmt ? fmt.innerStart : clampedStart;
  const wordBoundsMax = fmt ? fmt.innerEnd : clampedEnd;

  // 2b. Check if clampedHit sits directly on a backslash LaTeX command in prose (e.g. \eta, \alpha, \newpage)
  if (rawLatex[clampedHit] === '\\') {
    const rawCmdMatch = rawLatex.slice(clampedHit, wordBoundsMax).match(/^\\([a-zA-Z]+\*?)/);
    if (rawCmdMatch) {
      const cmdEnd = clampedHit + rawCmdMatch[0].length;
      return {
        startOffset: clampedHit,
        endOffset: cmdEnd,
        label: 'LaTeX Command',
        code: rawCmdMatch[0],
        parentScope:
          clampedEnd - clampedStart > rawCmdMatch[0].length
            ? {
                startOffset: clampedStart,
                endOffset: clampedEnd,
                label: blockLabel,
                code: rawLatex.slice(clampedStart, clampedEnd),
              }
            : undefined,
      };
    }
  }

  // 3. Expand around clampedHit to get exact clicked word
  let anchor = clampedHit;
  if (!isWordChar(rawLatex[anchor]) && anchor > wordBoundsMin && isWordChar(rawLatex[anchor - 1])) {
    anchor = anchor - 1;
  }

  if (isWordChar(rawLatex[anchor])) {
    let wStart = anchor;
    let wEnd = anchor + 1;
    while (wStart > wordBoundsMin && isWordChar(rawLatex[wStart - 1])) {
      wStart--;
    }
    while (wEnd < wordBoundsMax && isWordChar(rawLatex[wEnd])) {
      wEnd++;
    }
    // Trim leading/trailing hyphens or apostrophes
    while (wStart < wEnd && /^[-'\u2019]$/.test(rawLatex[wStart])) wStart++;
    while (wEnd > wStart && /^[-'\u2019]$/.test(rawLatex[wEnd - 1])) wEnd--;

    // If the word is immediately preceded by '\', it's a raw LaTeX command (e.g. \eta)
    if (
      wEnd > wStart &&
      wStart > wordBoundsMin &&
      rawLatex[wStart - 1] === '\\' &&
      /^[a-zA-Z]+$/.test(rawLatex.slice(wStart, wEnd))
    ) {
      const cmdStart = wStart - 1;
      const cmdEnd = rawLatex[wEnd] === '*' ? wEnd + 1 : wEnd;
      return {
        startOffset: cmdStart,
        endOffset: cmdEnd,
        label: 'LaTeX Command',
        code: rawLatex.slice(cmdStart, cmdEnd),
        parentScope:
          clampedEnd - clampedStart > cmdEnd - cmdStart
            ? {
                startOffset: clampedStart,
                endOffset: clampedEnd,
                label: blockLabel,
                code: rawLatex.slice(clampedStart, clampedEnd),
              }
            : undefined,
      };
    }

    if (wEnd > wStart) {
      // If a formatting command wraps a single word or short tag (<= 24 chars and no spaces inside), select the full formatted tag
      if (
        fmt &&
        fmt.cmdEnd - fmt.cmdStart <= 36 &&
        !/\s/.test(rawLatex.slice(fmt.innerStart, fmt.innerEnd).trim())
      ) {
        return {
          startOffset: fmt.cmdStart,
          endOffset: fmt.cmdEnd,
          label: `Formatted (\\${fmt.cmd})`,
          code: rawLatex.slice(fmt.cmdStart, fmt.cmdEnd),
          parentScope: {
            startOffset: clampedStart,
            endOffset: clampedEnd,
            label: blockLabel,
            code: rawLatex.slice(clampedStart, clampedEnd),
          },
        };
      }

      const parent =
        fmt && fmt.cmdEnd - fmt.cmdStart > wEnd - wStart
          ? {
              startOffset: fmt.cmdStart,
              endOffset: fmt.cmdEnd,
              label: `\\${fmt.cmd}{…}`,
              code: rawLatex.slice(fmt.cmdStart, fmt.cmdEnd),
            }
          : clampedEnd - clampedStart > wEnd - wStart
            ? {
                startOffset: clampedStart,
                endOffset: clampedEnd,
                label: blockLabel,
                code: rawLatex.slice(clampedStart, clampedEnd),
              }
            : undefined;

      return {
        startOffset: wStart,
        endOffset: wEnd,
        label: 'Selected Word',
        code: rawLatex.slice(wStart, wEnd),
        parentScope: parent,
      };
    }
  }

  // 4. Fallback to enclosing format command or trimmed slice
  if (fmt) {
    return {
      startOffset: fmt.cmdStart,
      endOffset: fmt.cmdEnd,
      label: `Formatted (\\${fmt.cmd})`,
      code: rawLatex.slice(fmt.cmdStart, fmt.cmdEnd),
      parentScope:
        clampedEnd - clampedStart > fmt.cmdEnd - fmt.cmdStart
          ? {
              startOffset: clampedStart,
              endOffset: clampedEnd,
              label: blockLabel,
              code: rawLatex.slice(clampedStart, clampedEnd),
            }
          : undefined,
    };
  }

  return {
    startOffset: clampedStart,
    endOffset: clampedEnd,
    label: blockLabel,
    code: rawLatex.slice(clampedStart, clampedEnd),
  };
}

const MATH_SPACING_COMMANDS = new Set([
  'quad',
  'qquad',
  ',',
  ';',
  ':',
  '!',
  ' ',
  'enspace',
  'thinspace',
  'medspace',
  'thickspace',
  'hspace',
  'vspace',
  'phantom',
  'hphantom',
  'vphantom',
  'limits',
  'nolimits',
  'displaystyle',
  'textstyle',
  'scriptstyle',
  'scriptscriptstyle',
  'nonumber',
  'notag',
]);

const MATH_WRAPPER_COMMANDS = new Set([
  'mathbb',
  'mathbf',
  'mathrm',
  'mathit',
  'mathcal',
  'mathfrak',
  'mathsf',
  'mathtt',
  'boldsymbol',
  'operatorname',
  'text',
  'textbf',
  'textit',
  'textrm',
  'textsf',
  'texttt',
  'mbox',
  'frac',
  'dfrac',
  'tfrac',
  'binom',
  'sqrt',
  'overline',
  'underline',
  'widehat',
  'widetilde',
  'overbrace',
  'underbrace',
  'boxed',
  'left',
  'right',
  'big',
  'Big',
  'bigg',
  'Bigg',
  'hat',
  'tilde',
  'bar',
  'vec',
  'dot',
  'ddot',
  'check',
  'acute',
  'grave',
  'breve',
]);

const LATEX_COMMAND_GLYPHS: Record<string, string> = {
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  epsilon: 'ϵ',
  varepsilon: 'ε',
  zeta: 'ζ',
  eta: 'η',
  theta: 'θ',
  vartheta: 'ϑ',
  iota: 'ι',
  kappa: 'κ',
  lambda: 'λ',
  mu: 'μ',
  nu: 'ν',
  xi: 'ξ',
  pi: 'π',
  varpi: 'ϖ',
  rho: 'ρ',
  varrho: 'ϱ',
  sigma: 'σ',
  varsigma: 'ς',
  tau: 'τ',
  upsilon: 'υ',
  phi: 'ϕ',
  varphi: 'φ',
  chi: 'χ',
  psi: 'ψ',
  omega: 'ω',
  Gamma: 'Γ',
  Delta: 'Δ',
  Theta: 'Θ',
  Lambda: 'Λ',
  Xi: 'Ξ',
  Pi: 'Π',
  Sigma: 'Σ',
  Upsilon: 'Υ',
  Phi: 'Φ',
  Psi: 'Ψ',
  Omega: 'Ω',
  nabla: '∇',
  partial: '∂',
  infty: '∞',
  sum: '∑',
  prod: '∏',
  coprod: '∐',
  int: '∫',
  iint: '∬',
  iiint: '∭',
  oint: '∮',
  in: '∈',
  notin: '∉',
  ni: '∋',
  subset: '⊂',
  supset: '⊃',
  subseteq: '⊆',
  supseteq: '⊇',
  cup: '∪',
  cap: '∩',
  bigcup: '⋃',
  bigcap: '⋂',
  le: '≤',
  leq: '≤',
  ge: '≥',
  geq: '≥',
  ne: '≠',
  neq: '≠',
  approx: '≈',
  equiv: '≡',
  sim: '∼',
  simeq: '≃',
  cong: '≅',
  propto: '∝',
  pm: '±',
  mp: '∓',
  times: '×',
  div: '÷',
  cdot: '⋅',
  circ: '∘',
  bullet: '•',
  to: '→',
  rightarrow: '→',
  leftarrow: '←',
  leftrightarrow: '↔',
  Rightarrow: '⇒',
  Leftarrow: '⇐',
  Leftrightarrow: '⇔',
  mapsto: '↦',
  forall: '∀',
  exists: '∃',
  neg: '¬',
  lnot: '¬',
  wedge: '∧',
  land: '∧',
  vee: '∨',
  lor: '∨',
  emptyset: '∅',
  varnothing: '∅',
  ell: 'ℓ',
  hbar: 'ℏ',
  Re: 'ℜ',
  Im: 'ℑ',
  aleph: 'ℵ',
  wp: '℘',
  top: '⊤',
  bot: '⊥',
  mid: '∣',
  parallel: '∥',
  perp: '⊥',
  angle: '∠',
  triangle: '△',
  cdots: '⋯',
  ldots: '…',
  dots: '…',
  vdots: '⋮',
  ddots: '⋱',
  langle: '⟨',
  rangle: '⟩',
  lceil: '⌈',
  rceil: '⌉',
  lfloor: '⌊',
  rfloor: '⌋',
  dagger: '†',
  ddagger: '‡',
  star: '⋆',
  ast: '∗',
  '{': '{',
  '}': '}',
  '|': '∥',
  '%': '%',
  '&': '&',
  '#': '#',
  _: '_',
};

function normalizeMathGlyphText(ch: string): string {
  if (ch === '-' || ch === '\u2212') return '−';
  if (ch === '*' || ch === '\u2217') return '∗';
  return ch;
}

export function extractExpectedMathGlyphs(tokenText: string): string[] {
  const glyphs: string[] = [];
  let i = 0;

  while (i < tokenText.length) {
    const ch = tokenText[i];
    if (ch === '{' || ch === '}' || ch === '_' || ch === '^' || /\s/.test(ch)) {
      i++;
      continue;
    }

    if (ch === '\\') {
      const m = tokenText.slice(i).match(/^\\([a-zA-Z]+|[^a-zA-Z\s])/);
      if (m) {
        const cmd = m[1];
        let nextPos = i + m[0].length;

        if (MATH_SPACING_COMMANDS.has(cmd)) {
          if (
            (cmd === 'hspace' ||
              cmd === 'vspace' ||
              cmd === 'phantom' ||
              cmd === 'hphantom' ||
              cmd === 'vphantom') &&
            tokenText[nextPos] === '{'
          ) {
            const skipped = readBraceArg(tokenText, nextPos);
            if (skipped) nextPos = skipped.nextIdx;
          }
          i = nextPos;
          continue;
        }

        if (MATH_WRAPPER_COMMANDS.has(cmd)) {
          if ((cmd === 'left' || cmd === 'right') && tokenText[nextPos] === '.') {
            nextPos++;
          }
          i = nextPos;
          continue;
        }

        if (LATEX_COMMAND_GLYPHS[cmd]) {
          glyphs.push(LATEX_COMMAND_GLYPHS[cmd]);
          i = nextPos;
          continue;
        }

        // Standard named math operators like \sin, \cos, \log, \lim, \det
        if (/^[a-zA-Z]{2,}$/.test(cmd)) {
          for (const c of cmd) glyphs.push(c);
          i = nextPos;
          continue;
        }

        glyphs.push(cmd);
        i = nextPos;
        continue;
      }

      i++;
      continue;
    }

    glyphs.push(normalizeMathGlyphText(ch));
    i++;
  }

  return glyphs;
}

export function estimateMathTokenVisualWeight(tokenText: string): number {
  return extractExpectedMathGlyphs(tokenText).length;
}

/**
 * Aligns rendered KaTeX DOM leaf texts against non-spacing tokens from tokenizeForInsertion
 * so clicking a leaf (like η or α) resolves to the exact corresponding LaTeX token without
 * cumulative weight drift.
 */
export function resolveMathTokenFromLeaves(
  rawLatex: string,
  mathStart: number,
  mathEnd: number,
  leafTexts: string[],
  leafIndex: number
): { startOffset: number; endOffset: number; code: string } | null {
  const strip = tokenizeForInsertion(rawLatex, mathStart, mathEnd);
  if (strip.tokens.length === 0) return null;

  const tokenEntries = strip.tokens.map((t) => {
    const code = rawLatex.slice(t.startOffset, t.endOffset);
    const glyphs = extractExpectedMathGlyphs(code);
    return { token: t, code, glyphs };
  });

  const selectable = tokenEntries.filter((entry) => entry.glyphs.length > 0);
  const candidates = selectable.length > 0 ? selectable : tokenEntries;

  if (candidates.length === 1 || leafTexts.length === 0) {
    const first = candidates[0];
    return {
      startOffset: first.token.startOffset,
      endOffset: first.token.endOffset,
      code: first.code,
    };
  }

  const clampedLeaf = Math.max(0, Math.min(leafIndex, leafTexts.length - 1));
  const flattened: Array<{ glyph: string; candIdx: number }> = [];
  candidates.forEach((cand, candIdx) => {
    const gs = cand.glyphs.length > 0 ? cand.glyphs : [cand.code];
    for (const g of gs) {
      flattened.push({ glyph: normalizeMathGlyphText(g), candIdx });
    }
  });

  const L = leafTexts.length;
  const G = flattened.length;

  // Dynamic programming alignment between rendered DOM leaves (L) and expected token glyphs (G)
  if (L > 0 && G > 0 && L * G <= 12000) {
    const normLeaves = leafTexts.map((t) => normalizeMathGlyphText(t.trim()));
    const rows = L + 1;
    const cols = G + 1;
    const dp = new Float64Array(rows * cols);
    const move = new Uint8Array(rows * cols); // 1 = diag, 2 = skip leaf (up), 3 = skip expected (left)

    for (let i = 1; i <= L; i++) {
      dp[i * cols] = i * 1.5;
      move[i * cols] = 2;
    }
    for (let j = 1; j <= G; j++) {
      dp[j] = j * 1.5;
      move[j] = 3;
    }

    for (let i = 1; i <= L; i++) {
      const leafChar = normLeaves[i - 1];
      for (let j = 1; j <= G; j++) {
        const expChar = flattened[j - 1].glyph;
        const subCost = leafChar === expChar ? 0 : 2;
        const diag = dp[(i - 1) * cols + (j - 1)] + subCost;
        const skipLeaf = dp[(i - 1) * cols + j] + 1.5;
        const skipExp = dp[i * cols + (j - 1)] + 1.5;

        if (diag <= skipLeaf && diag <= skipExp) {
          dp[i * cols + j] = diag;
          move[i * cols + j] = 1;
        } else if (skipLeaf <= skipExp) {
          dp[i * cols + j] = skipLeaf;
          move[i * cols + j] = 2;
        } else {
          dp[i * cols + j] = skipExp;
          move[i * cols + j] = 3;
        }
      }
    }

    const leafToCand = new Array<number>(L).fill(-1);
    let i = L;
    let j = G;
    while (i > 0 || j > 0) {
      const m = move[i * cols + j];
      if (m === 1 && i > 0 && j > 0) {
        leafToCand[i - 1] = flattened[j - 1].candIdx;
        i--;
        j--;
      } else if (m === 2 && i > 0) {
        i--;
      } else if (j > 0) {
        j--;
      } else {
        break;
      }
    }

    // If the clicked leaf itself matched an expected glyph directly, return it
    if (leafToCand[clampedLeaf] >= 0) {
      const matched = candidates[leafToCand[clampedLeaf]];
      return {
        startOffset: matched.token.startOffset,
        endOffset: matched.token.endOffset,
        code: matched.code,
      };
    }

    // Otherwise check nearest matched neighbor leaf (e.g. accent span sitting on a symbol)
    for (let dist = 1; dist < L; dist++) {
      if (clampedLeaf - dist >= 0 && leafToCand[clampedLeaf - dist] >= 0) {
        const matched = candidates[leafToCand[clampedLeaf - dist]];
        return {
          startOffset: matched.token.startOffset,
          endOffset: matched.token.endOffset,
          code: matched.code,
        };
      }
      if (clampedLeaf + dist < L && leafToCand[clampedLeaf + dist] >= 0) {
        const matched = candidates[leafToCand[clampedLeaf + dist]];
        return {
          startOffset: matched.token.startOffset,
          endOffset: matched.token.endOffset,
          code: matched.code,
        };
      }
    }
  }

  // Fallback proportional resolution over selectable (non-spacing) tokens
  const weights = candidates.map((c) => Math.max(1, c.glyphs.length));
  const totalWeight = weights.reduce((acc, w) => acc + w, 0);
  const targetWeight = ((clampedLeaf + 0.5) / leafTexts.length) * totalWeight;

  let acc = 0;
  for (let i = 0; i < candidates.length; i++) {
    acc += weights[i];
    if (targetWeight <= acc || i === candidates.length - 1) {
      return {
        startOffset: candidates[i].token.startOffset,
        endOffset: candidates[i].token.endOffset,
        code: candidates[i].code,
      };
    }
  }
  return null;
}

/**
 * Maps a clicked KaTeX leaf index (0..totalLeaves-1) to the exact top-level token
 * inside tokenizeForInsertion(rawLatex, mathStart, mathEnd).
 */
export function resolveMathTokenByLeafIndex(
  rawLatex: string,
  mathStart: number,
  mathEnd: number,
  leafIndex: number,
  totalLeaves: number
): { startOffset: number; endOffset: number; code: string } | null {
  const strip = tokenizeForInsertion(rawLatex, mathStart, mathEnd);
  if (strip.tokens.length === 0) return null;

  const entries = strip.tokens.map((t) => {
    const code = rawLatex.slice(t.startOffset, t.endOffset);
    return { token: t, code, weight: estimateMathTokenVisualWeight(code) };
  });
  const selectable = entries.filter((e) => e.weight > 0);
  const candidates = selectable.length > 0 ? selectable : entries;

  if (candidates.length === 1 || totalLeaves <= 0) {
    const first = candidates[0];
    return { startOffset: first.token.startOffset, endOffset: first.token.endOffset, code: first.code };
  }

  const weights = candidates.map((c) => Math.max(1, c.weight));
  const totalWeight = weights.reduce((acc, w) => acc + w, 0);
  const clampedLeaf = Math.max(0, Math.min(leafIndex, totalLeaves - 1));
  const targetWeight = ((clampedLeaf + 0.5) / totalLeaves) * totalWeight;

  let acc = 0;
  for (let i = 0; i < candidates.length; i++) {
    acc += weights[i];
    if (targetWeight <= acc || i === candidates.length - 1) {
      return {
        startOffset: candidates[i].token.startOffset,
        endOffset: candidates[i].token.endOffset,
        code: candidates[i].code,
      };
    }
  }
  return null;
}

function findClickedMathLeaf(
  mathRootEl: Element,
  clientX: number,
  clientY: number,
  filterFn?: (entry: { el: HTMLElement; rect: DOMRect }) => boolean
): { leafIndex: number; leafTexts: string[] } {
  const allLeaves = collectLeafMathSymbols(mathRootEl);
  const leaves = filterFn ? allLeaves.filter(filterFn) : allLeaves;
  if (leaves.length === 0) return { leafIndex: 0, leafTexts: [] };

  let bestIdx = 0;
  let bestDist = Infinity;
  leaves.forEach((leaf, idx) => {
    const dx =
      clientX < leaf.rect.left
        ? leaf.rect.left - clientX
        : clientX > leaf.rect.right
          ? clientX - leaf.rect.right
          : 0;
    const dy =
      clientY < leaf.rect.top
        ? leaf.rect.top - clientY
        : clientY > leaf.rect.bottom
          ? clientY - leaf.rect.bottom
          : 0;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = idx;
    }
  });
  return {
    leafIndex: bestIdx,
    leafTexts: leaves.map((l) => (l.el.textContent ?? '').trim()),
  };
}

function resolveMathDoubleClickScope(
  katexEl: Element,
  rawLatex: string,
  mathStart: number,
  mathEnd: number,
  clientX: number,
  clientY: number,
  mathLabel: string
): ScopedEditTarget {
  const hitEl = document.elementFromPoint(clientX, clientY);
  const mathBodyCode = rawLatex.slice(mathStart, mathEnd);
  const fullMathParent = {
    startOffset: mathStart,
    endOffset: mathEnd,
    label: mathLabel,
    code: mathBodyCode,
  };

  // 1. Inside matrix / cases / align / array (.mtable)
  const mtableHit = resolveClickedMtableCell(
    katexEl,
    rawLatex,
    mathStart,
    mathEnd,
    clientX,
    clientY,
    hitEl
  );
  if (mtableHit) {
    const { region, matchedCell, matchedRowEl } = mtableHit;
    const cellLabel = `${region.kind === 'cases' ? 'Cases' : region.kind === 'align' ? 'Align' : 'Matrix'} · ${matchedCell.label}`;
    const cellParent = {
      startOffset: matchedCell.trimStartOffset,
      endOffset: matchedCell.trimEndOffset,
      label: cellLabel,
      code: rawLatex.slice(matchedCell.trimStartOffset, matchedCell.trimEndOffset),
    };

    // If the cell itself contains a clicked fraction, allow targeting numerator/denominator or token inside
    const cellFracEl = hitEl?.closest?.('.mfrac');
    if (cellFracEl && matchedRowEl.contains(cellFracEl)) {
      const fracLine = cellFracEl.querySelector('.frac-line');
      if (fracLine) {
        const lineRect = fracLine.getBoundingClientRect();
        const fracIdx = Array.from(matchedRowEl.querySelectorAll('.mfrac')).indexOf(cellFracEl);
        const subSlots = extractSubPartSlots(
          rawLatex.slice(matchedCell.trimStartOffset, matchedCell.trimEndOffset)
        ).filter((s) => s.groupLabel === 'Fraction' || s.groupLabel === 'Binomial');
        const isNum = clientY < lineRect.top + lineRect.height / 2;
        const targetSub = subSlots[fracIdx * 2 + (isNum ? 0 : 1)];
        if (targetSub) {
          const sStart = matchedCell.trimStartOffset + targetSub.trimStartOffset;
          const sEnd = matchedCell.trimStartOffset + targetSub.trimEndOffset;
          const { leafIndex, leafTexts } = findClickedMathLeaf(cellFracEl, clientX, clientY, (entry) => {
            const cy = entry.rect.top + entry.rect.height / 2;
            return isNum ? cy < lineRect.top + lineRect.height / 2 : cy >= lineRect.top + lineRect.height / 2;
          });
          const tok = resolveMathTokenFromLeaves(rawLatex, sStart, sEnd, leafTexts, leafIndex);
          if (tok && (tok.startOffset > sStart || tok.endOffset < sEnd)) {
            return {
              startOffset: tok.startOffset,
              endOffset: tok.endOffset,
              label: `${matchedCell.label} · ${targetSub.label} Term`,
              code: tok.code,
              parentScope: {
                startOffset: sStart,
                endOffset: sEnd,
                label: `${matchedCell.label} · ${targetSub.label}`,
                code: rawLatex.slice(sStart, sEnd),
              },
            };
          }
          return {
            startOffset: sStart,
            endOffset: sEnd,
            label: `${matchedCell.label} · ${targetSub.label}`,
            code: rawLatex.slice(sStart, sEnd),
            parentScope: cellParent,
          };
        }
      }
    }

    // Narrow down to the specific clicked math term inside the cell when the cell has multiple tokens
    const { leafIndex, leafTexts } = findClickedMathLeaf(matchedRowEl, clientX, clientY);
    const cellTok = resolveMathTokenFromLeaves(
      rawLatex,
      matchedCell.trimStartOffset,
      matchedCell.trimEndOffset,
      leafTexts,
      leafIndex
    );
    if (
      cellTok &&
      (cellTok.startOffset > matchedCell.trimStartOffset ||
        cellTok.endOffset < matchedCell.trimEndOffset)
    ) {
      return {
        startOffset: cellTok.startOffset,
        endOffset: cellTok.endOffset,
        label: `${cellLabel} Term`,
        code: cellTok.code,
        parentScope: cellParent,
      };
    }

    return {
      startOffset: matchedCell.trimStartOffset,
      endOffset: matchedCell.trimEndOffset,
      label: cellLabel,
      code: rawLatex.slice(matchedCell.trimStartOffset, matchedCell.trimEndOffset),
      parentScope: fullMathParent,
    };
  }

  // 2. Fraction / Binomial (.mfrac)
  const mfracEl = hitEl?.closest?.('.mfrac');
  if (mfracEl && katexEl.contains(mfracEl)) {
    const fracLine = mfracEl.querySelector('.frac-line');
    if (fracLine) {
      const lineRect = fracLine.getBoundingClientRect();
      const fracIdx = Array.from(katexEl.querySelectorAll('.mfrac')).indexOf(mfracEl);
      const subSlots = extractSubPartSlots(rawLatex.slice(mathStart, mathEnd)).filter(
        (s) => s.groupLabel === 'Fraction' || s.groupLabel === 'Binomial'
      );
      const isNumerator = clientY < lineRect.top + lineRect.height / 2;
      const targetSub = subSlots[fracIdx * 2 + (isNumerator ? 0 : 1)];
      if (targetSub) {
        const absStart = mathStart + targetSub.trimStartOffset;
        const absEnd = mathStart + targetSub.trimEndOffset;
        const { leafIndex, leafTexts } = findClickedMathLeaf(mfracEl, clientX, clientY, (entry) => {
          const cy = entry.rect.top + entry.rect.height / 2;
          return isNumerator
            ? cy < lineRect.top + lineRect.height / 2
            : cy >= lineRect.top + lineRect.height / 2;
        });
        const tok = resolveMathTokenFromLeaves(rawLatex, absStart, absEnd, leafTexts, leafIndex);
        if (tok && (tok.startOffset > absStart || tok.endOffset < absEnd)) {
          return {
            startOffset: tok.startOffset,
            endOffset: tok.endOffset,
            label: `${targetSub.groupLabel} ${targetSub.label} Term`,
            code: tok.code,
            parentScope: {
              startOffset: absStart,
              endOffset: absEnd,
              label: `${targetSub.groupLabel} ${targetSub.label}`,
              code: rawLatex.slice(absStart, absEnd),
            },
          };
        }
        return {
          startOffset: absStart,
          endOffset: absEnd,
          label: `${targetSub.groupLabel} ${targetSub.label}`,
          code: rawLatex.slice(absStart, absEnd),
          parentScope: fullMathParent,
        };
      }
    }
  }

  // 3. Specific math token at clicked leaf (if expression has multiple tokens)
  const { leafIndex, leafTexts } = findClickedMathLeaf(katexEl, clientX, clientY);
  const tok = resolveMathTokenFromLeaves(rawLatex, mathStart, mathEnd, leafTexts, leafIndex);
  if (tok && (tok.startOffset > mathStart || tok.endOffset < mathEnd)) {
    return {
      startOffset: tok.startOffset,
      endOffset: tok.endOffset,
      label: `${mathLabel} Term`,
      code: tok.code,
      parentScope: fullMathParent,
    };
  }

  return {
    startOffset: mathStart,
    endOffset: mathEnd,
    label: mathLabel,
    code: mathBodyCode,
  };
}

/**
 * Resolves a double-click directly on normal or mathematical preview text into ONLY
 * the exact selected sub-part's real LaTeX source slice.
 */
export function resolveDoubleClickTargetInBlock(
  blockEl: HTMLElement,
  rawLatex: string,
  kind: PreviewBlockKind,
  rawHeaderFields: { title: string; author: string; date: string },
  clientX: number,
  clientY: number
): ScopedEditTarget | null {
  const renderHost = blockEl.querySelector<HTMLElement>('[data-block-render-host="true"]');
  if (!renderHost) return null;

  const hitEl = document.elementFromPoint(clientX, clientY);

  // Document Header
  if (kind === 'title') {
    const fieldEl =
      hitEl?.closest<HTMLElement>('[data-header-field]') ??
      renderHost.querySelector<HTMLElement>('[data-header-field="title"]');
    if (!fieldEl) return null;
    const fieldAttr = fieldEl.getAttribute('data-header-field');
    const field: HeaderFieldKey =
      fieldAttr === 'author' ? 'author' : fieldAttr === 'date' ? 'date' : 'title';
    const fieldLabel =
      field === 'author' ? 'Description' : field === 'date' ? 'Date' : 'Header Title';
    const rawVal = rawHeaderFields[field];
    const isEmpty = fieldEl.getAttribute('data-preview-empty') === 'true' || !rawVal;

    if (isEmpty) {
      return {
        startOffset: 0,
        endOffset: 0,
        label: fieldLabel,
        code: '',
        headerField: field,
      };
    }

    const katexEl = hitEl?.closest?.('.katex');
    const sourceIdx = buildVisibleSourceIndex(rawVal, 0, rawVal.length);
    if (katexEl && fieldEl.contains(katexEl)) {
      const kIdx = Array.from(fieldEl.querySelectorAll('.katex')).indexOf(katexEl);
      const mathSpan = sourceIdx.maths[kIdx];
      if (mathSpan) {
        const scoped = resolveMathDoubleClickScope(
          katexEl,
          rawVal,
          mathSpan.bodyStart,
          mathSpan.bodyEnd,
          clientX,
          clientY,
          'Inline Math'
        );
        return {
          ...scoped,
          headerField: field,
          parentScope: {
            startOffset: 0,
            endOffset: rawVal.length,
            label: fieldLabel,
            code: rawVal,
          },
        };
      }
    }

    const caretPos = getCaretPositionFromPoint(clientX, clientY);
    if (caretPos && fieldEl.contains(caretPos.node)) {
      const measured = measureContainerCaret(fieldEl, caretPos.node, caretPos.offset);
      const hitOffset = resolveVisibleSourceOffset(
        sourceIdx,
        measured.visibleChars,
        measured.mathBefore,
        measured.atomsBefore
      );
      const scoped = resolveProseScopedSlice(rawVal, 0, rawVal.length, hitOffset, fieldLabel);
      return {
        ...scoped,
        headerField: field,
      };
    }

    return {
      startOffset: 0,
      endOffset: rawVal.length,
      label: fieldLabel,
      code: rawVal,
      headerField: field,
    };
  }

  // Divider blocks (\newpage, \clearpage, \hrule) and Table of Contents (\tableofcontents)
  if (kind === 'divider') {
    const trimmed = rawLatex.trim();
    return {
      startOffset: 0,
      endOffset: rawLatex.length,
      label: trimmed === '\\hrule' ? 'Horizontal Rule' : 'Page Break',
      code: rawLatex,
    };
  }

  if (kind === 'toc') {
    return {
      startOffset: 0,
      endOffset: rawLatex.length,
      label: 'Table of Contents',
      code: rawLatex,
    };
  }

  // Display Math block
  if (kind === 'math') {
    const katexEl = hitEl?.closest?.('.katex') ?? renderHost.querySelector('.katex');
    const bodyRange = getBlockEditableRange(rawLatex, 'math');
    const trimmed = trimSliceBounds(rawLatex, bodyRange.start, bodyRange.end);
    if (katexEl) {
      return resolveMathDoubleClickScope(
        katexEl,
        rawLatex,
        trimmed.start,
        trimmed.end,
        clientX,
        clientY,
        'Equation'
      );
    }
    return {
      startOffset: trimmed.start,
      endOffset: trimmed.end,
      label: 'Equation',
      code: rawLatex.slice(trimmed.start, trimmed.end),
    };
  }

  // Prose / Heading / List / Table / Theorem / Proof / Abstract / Quote
  let containerEl: Element = renderHost;
  let slice: { start: number; end: number; label: string };

  const tdEl = hitEl?.closest?.('td, th');
  const liEl = hitEl?.closest?.('li');
  const headingEl = hitEl?.closest?.('h1, h2, h3, h4') ?? renderHost.querySelector('h2, h3, h4');

  if (tdEl && renderHost.contains(tdEl)) {
    const tableEl = tdEl.closest('table');
    const rows = tableEl ? Array.from(tableEl.querySelectorAll('tr')) : [];
    const trEl = tdEl.closest('tr');
    const rowIdx = trEl ? rows.indexOf(trEl) : 0;
    const cellsInRow = trEl ? Array.from(trEl.querySelectorAll('td, th')) : [];
    const colIdx = cellsInRow.indexOf(tdEl);
    containerEl = tdEl;
    slice = resolveBlockContainerSlice(rawLatex, kind, 'table-cell', Math.max(0, rowIdx), Math.max(0, colIdx));
  } else if (liEl && renderHost.contains(liEl)) {
    const listItems = Array.from(renderHost.querySelectorAll('li'));
    const liIdx = Math.max(0, listItems.indexOf(liEl));
    containerEl = liEl;
    slice = resolveBlockContainerSlice(rawLatex, kind, 'list-item', liIdx);
  } else if (kind === 'heading' && headingEl && renderHost.contains(headingEl)) {
    containerEl = headingEl;
    slice = resolveBlockContainerSlice(rawLatex, kind, 'heading');
  } else {
    slice = resolveBlockContainerSlice(rawLatex, kind, 'block');
    const pEl = hitEl?.closest?.('p');
    if (pEl && renderHost.contains(pEl)) {
      const allParas = Array.from(renderHost.querySelectorAll('p'));
      const pIdx = allParas.indexOf(pEl);
      containerEl = pEl;
      if (kind === 'environment' && pIdx >= 0 && allParas.length > 1) {
        const innerText = rawLatex.slice(slice.start, slice.end);
        const parts = innerText.split(/\n\s*\n/);
        if (parts[pIdx]) {
          const sepMatches = Array.from(innerText.matchAll(/\n\s*\n/g));
          const partStart = pIdx === 0 ? 0 : (sepMatches[pIdx - 1]?.index ?? 0) + (sepMatches[pIdx - 1]?.[0].length ?? 0);
          const partEnd = pIdx < sepMatches.length ? (sepMatches[pIdx].index ?? innerText.length) : innerText.length;
          const trimmedSub = trimSliceBounds(rawLatex, slice.start + partStart, slice.start + partEnd);
          slice = { ...slice, start: trimmedSub.start, end: trimmedSub.end };
        }
      }
    }
  }

  const sourceIdx = buildVisibleSourceIndex(rawLatex, slice.start, slice.end);
  const allKatex = Array.from(containerEl.querySelectorAll('.katex')).filter(
    (el) => !el.closest('[data-preview-chrome="true"]')
  );
  const allAtoms = Array.from(containerEl.querySelectorAll('[data-latex-atom="true"]')).filter(
    (el) => !el.closest('[data-preview-chrome="true"]')
  );

  // Check if user double-clicked inside inline math ($...$)
  let inlineKatex = hitEl?.closest?.('.katex') ?? null;

  // Handle inline math sitting inside Theorem/Proof [Subtitle] chrome header
  const chromeHost = hitEl?.closest?.('[data-preview-chrome="true"]');
  if (inlineKatex && chromeHost && containerEl.contains(chromeHost)) {
    const bodyRange = getBlockEditableRange(rawLatex, kind);
    const trimmedStart = rawLatex.slice(bodyRange.start, bodyRange.end).search(/\S/);
    if (trimmedStart !== -1) {
      const absStart = bodyRange.start + trimmedStart;
      if (rawLatex[absStart] === '[') {
        const opt = readBracketArg(rawLatex.slice(0, bodyRange.end), absStart);
        if (opt) {
          const optIdx = buildVisibleSourceIndex(rawLatex, absStart + 1, opt.nextIdx - 1);
          const chromeKatex = Array.from(chromeHost.querySelectorAll('.katex'));
          const ckIdx = chromeKatex.indexOf(inlineKatex);
          const chromeMath = optIdx.maths[ckIdx];
          if (chromeMath) {
            const scoped = resolveMathDoubleClickScope(
              inlineKatex,
              rawLatex,
              chromeMath.bodyStart,
              chromeMath.bodyEnd,
              clientX,
              clientY,
              'Inline Math'
            );
            return {
              ...scoped,
              parentScope: scoped.parentScope ?? {
                startOffset: absStart + 1,
                endOffset: opt.nextIdx - 1,
                label: 'Subtitle',
                code: rawLatex.slice(absStart + 1, opt.nextIdx - 1),
              },
            };
          }
        }
      }
    }
  }

  // Proximity match for narrow 1-glyph math symbols (e.g., η) if pointer missed by a couple pixels
  if (!inlineKatex && allKatex.length > 0) {
    let bestEl: Element | null = null;
    let bestDistSq = 36; // 6px radius
    for (const kEl of allKatex) {
      const r = kEl.getBoundingClientRect();
      const dx = clientX < r.left ? r.left - clientX : clientX > r.right ? clientX - r.right : 0;
      const dy = clientY < r.top ? r.top - clientY : clientY > r.bottom ? clientY - r.bottom : 0;
      const d2 = dx * dx + dy * dy;
      if (d2 <= bestDistSq) {
        bestDistSq = d2;
        bestEl = kEl;
      }
    }
    if (bestEl) {
      inlineKatex = bestEl;
    }
  }

  if (inlineKatex && containerEl.contains(inlineKatex)) {
    const kIdx = allKatex.indexOf(inlineKatex);
    const mathSpan = sourceIdx.maths[kIdx];
    if (mathSpan) {
      const scoped = resolveMathDoubleClickScope(
        inlineKatex,
        rawLatex,
        mathSpan.bodyStart,
        mathSpan.bodyEnd,
        clientX,
        clientY,
        'Inline Math'
      );
      return {
        ...scoped,
        parentScope:
          scoped.parentScope ??
          (slice.end - slice.start > scoped.endOffset - scoped.startOffset
            ? {
                startOffset: slice.start,
                endOffset: slice.end,
                label: slice.label,
                code: rawLatex.slice(slice.start, slice.end),
              }
            : undefined),
      };
    }
  }

  // Check if user double-clicked an atomic macro ([data-latex-atom="true"]), including nested \newpage / \hrule
  const atomEl = hitEl?.closest?.('[data-latex-atom="true"]');
  if (atomEl && containerEl.contains(atomEl) && !atomEl.closest('[data-preview-chrome="true"]')) {
    const aIdx = allAtoms.indexOf(atomEl);
    const atomSpan = sourceIdx.atoms[aIdx];
    if (atomSpan) {
      const atomCode = rawLatex.slice(atomSpan.startOffset, atomSpan.endOffset);
      const atomLabel =
        atomCode === '\\newpage' || atomCode === '\\clearpage'
          ? 'Page Break'
          : atomCode === '\\hrule'
            ? 'Horizontal Rule'
            : 'LaTeX Command';
      return {
        startOffset: atomSpan.startOffset,
        endOffset: atomSpan.endOffset,
        label: atomLabel,
        code: atomCode,
        parentScope:
          slice.end - slice.start > atomSpan.endOffset - atomSpan.startOffset
            ? {
                startOffset: slice.start,
                endOffset: slice.end,
                label: slice.label,
                code: rawLatex.slice(slice.start, slice.end),
              }
            : undefined,
      };
    }
  }

  // Otherwise resolve prose word / formatted span / raw LaTeX command
  const caretPos = getCaretPositionFromPoint(clientX, clientY);
  if (caretPos && containerEl.contains(caretPos.node)) {
    const measured = measureContainerCaret(containerEl, caretPos.node, caretPos.offset);
    const hitOffset = resolveVisibleSourceOffset(
      sourceIdx,
      measured.visibleChars,
      measured.mathBefore,
      measured.atomsBefore
    );
    return resolveProseScopedSlice(rawLatex, slice.start, slice.end, hitOffset, slice.label);
  }

  return {
    startOffset: slice.start,
    endOffset: slice.end,
    label: slice.label,
    code: rawLatex.slice(slice.start, slice.end),
  };
}

