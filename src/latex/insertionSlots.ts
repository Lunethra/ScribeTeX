import type { PreviewBlockKind } from '../types/editor';
import { readBraceArg, readBracketArg } from './parser';

export interface StructuredCellSlot {
  id: string;
  rowIndex: number;
  colIndex: number;
  label: string;
  startOffset: number;
  endOffset: number;
  trimStartOffset: number;
  trimEndOffset: number;
  text: string;
}

export interface StructuredRegion {
  id: string;
  kind: 'matrix' | 'cases' | 'table' | 'align' | 'list';
  envName: string;
  title: string;
  startOffset: number;
  endOffset: number;
  bodyStartOffset: number;
  bodyEndOffset: number;
  cells: StructuredCellSlot[];
  columnCount: number;
  rowCount: number;
}

export interface SubPartSlot {
  id: string;
  label: string;
  groupLabel: string;
  startOffset: number;
  endOffset: number;
  trimStartOffset: number;
  trimEndOffset: number;
  text: string;
}

export interface InlineToken {
  id: string;
  text: string;
  startOffset: number;
  endOffset: number;
}

export interface TokenGap {
  id: string;
  offset: number;
  label: string;
}

export interface TokenPlacementStrip {
  rangeStart: number;
  rangeEnd: number;
  tokens: InlineToken[];
  gaps: TokenGap[];
}

export interface BlockPlacementModel {
  structuredRegions: StructuredRegion[];
  subPartSlots: SubPartSlot[];
  bodyRange: { start: number; end: number };
  bodyStrip: TokenPlacementStrip;
}

const MATRIX_ENVS = new Set([
  'pmatrix',
  'bmatrix',
  'vmatrix',
  'Bmatrix',
  'Vmatrix',
  'matrix',
  'smallmatrix',
]);

const ALIGN_ENVS = new Set(['align', 'align*', 'gather', 'gather*', 'multline', 'multline*', 'split']);
const LIST_ENVS = new Set(['itemize', 'enumerate']);

const MATH_ENVS = new Set([
  'equation',
  'equation*',
  'displaymath',
  'math',
  ...MATRIX_ENVS,
  ...ALIGN_ENVS,
  'cases',
  'array',
]);

/**
 * Determines whether a character offset inside a block's rawLatex is currently in math mode.
 */
export function isOffsetInMathMode(
  latex: string,
  offset: number,
  blockKind: PreviewBlockKind
): boolean {
  const clamped = Math.max(0, Math.min(offset, latex.length));
  if (blockKind === 'math') {
    // Check if inside a \text{...} / \textbf{...} wrapper before clamped offset
    let i = 0;
    while (i < clamped) {
      if (latex[i] === '\\') {
        const textCmd = latex.slice(i).match(/^\\(text|textbf|textit|textrm|textsf|texttt|mbox)\s*\{/);
        if (textCmd) {
          const braceIdx = i + textCmd[0].length - 1;
          const arg = readBraceArg(latex, braceIdx);
          if (arg && clamped > braceIdx && clamped < arg.nextIdx) {
            return false;
          }
          if (arg) {
            i = arg.nextIdx;
            continue;
          }
        }
        i += 2;
        continue;
      }
      i++;
    }
    return true;
  }

  let inSingleDollar = false;
  let inDoubleDollar = false;
  let inBracketMath = false;
  const envStack: string[] = [];

  let i = 0;
  while (i < clamped) {
    if (latex[i] === '\\') {
      if (latex.startsWith('\\[', i) && !inSingleDollar && !inDoubleDollar) {
        inBracketMath = true;
        i += 2;
        continue;
      }
      if (latex.startsWith('\\]', i) && inBracketMath) {
        inBracketMath = false;
        i += 2;
        continue;
      }
      const beginMatch = latex.slice(i).match(/^\\begin\{([^}]+)\}/);
      if (beginMatch) {
        envStack.push(beginMatch[1]);
        i += beginMatch[0].length;
        continue;
      }
      const endMatch = latex.slice(i).match(/^\\end\{([^}]+)\}/);
      if (endMatch) {
        const idx = envStack.lastIndexOf(endMatch[1]);
        if (idx !== -1) envStack.splice(idx, 1);
        i += endMatch[0].length;
        continue;
      }
      i += 2;
      continue;
    }

    if (latex[i] === '$') {
      if (latex[i + 1] === '$') {
        inDoubleDollar = !inDoubleDollar;
        i += 2;
        continue;
      }
      inSingleDollar = !inSingleDollar;
      i += 1;
      continue;
    }
    i++;
  }

  return (
    inSingleDollar ||
    inDoubleDollar ||
    inBracketMath ||
    envStack.some((env) => MATH_ENVS.has(env))
  );
}

/**
 * Computes the editable body slice of a block (stripping outer \[...\], \begin{eq}...\end{eq}, \section{...}).
 */
export function getBlockEditableRange(
  rawLatex: string,
  kind: PreviewBlockKind
): { start: number; end: number } {
  if (kind === 'heading') {
    const cmdMatch = rawLatex.match(/^\\(?:section|subsection|subsubsection|paragraph)\*?\s*\{/);
    if (cmdMatch) {
      const braceIdx = cmdMatch[0].length - 1;
      const arg = readBraceArg(rawLatex, braceIdx);
      if (arg) {
        return { start: braceIdx + 1, end: arg.nextIdx - 1 };
      }
    }
  }

  if (kind === 'math') {
    if (rawLatex.startsWith('\\[') && rawLatex.endsWith('\\]')) {
      return { start: 2, end: rawLatex.length - 2 };
    }
    if (rawLatex.startsWith('$$') && rawLatex.endsWith('$$') && rawLatex.length >= 4) {
      return { start: 2, end: rawLatex.length - 2 };
    }
  }

  const envMatch = rawLatex.match(/^\\begin\{([^}]+)\}(?:\[[^\]]*\])?(?:\{[^}]*\})?/);
  if (envMatch) {
    const envName = envMatch[1];
    const endToken = `\\end{${envName}}`;
    const endIdx = rawLatex.lastIndexOf(endToken);
    if (endIdx !== -1 && endIdx >= envMatch[0].length) {
      return { start: envMatch[0].length, end: endIdx };
    }
  }

  return { start: 0, end: rawLatex.length };
}

function trimRange(str: string, start: number, end: number): { start: number; end: number } {
  let s = start;
  let e = end;
  while (s < e && /\s/.test(str[s])) s++;
  while (e > s && /\s/.test(str[e - 1])) e--;
  return { start: s, end: e };
}

/**
 * Splits a substring [rangeStart, rangeEnd] at top-level delimiter occurrences (e.g. '\\\\' or '&'),
 * respecting nested braces `{...}` and nested `\begin{...}...\end{...}`.
 */
function splitTopLevelRanges(
  source: string,
  rangeStart: number,
  rangeEnd: number,
  delimiter: string
): Array<{ start: number; end: number }> {
  const parts: Array<{ start: number; end: number }> = [];
  let braceDepth = 0;
  let envDepth = 0;
  let segStart = rangeStart;
  let i = rangeStart;

  while (i < rangeEnd) {
    const ch = source[i];
    if (ch === '\\') {
      if (delimiter === '\\\\' && braceDepth === 0 && envDepth === 0 && source.startsWith('\\\\', i)) {
        parts.push({ start: segStart, end: i });
        i += 2;
        segStart = i;
        continue;
      }
      if (source.startsWith('\\begin{', i)) {
        envDepth++;
        i += 7;
        continue;
      }
      if (source.startsWith('\\end{', i)) {
        envDepth = Math.max(0, envDepth - 1);
        i += 5;
        continue;
      }
      i += 2;
      continue;
    }

    if (ch === '{') {
      braceDepth++;
    } else if (ch === '}') {
      braceDepth = Math.max(0, braceDepth - 1);
    } else if (
      delimiter !== '\\\\' &&
      braceDepth === 0 &&
      envDepth === 0 &&
      source.startsWith(delimiter, i)
    ) {
      parts.push({ start: segStart, end: i });
      i += delimiter.length;
      segStart = i;
      continue;
    }

    i++;
  }

  parts.push({ start: segStart, end: rangeEnd });
  return parts;
}

/**
 * Finds all structured environments (matrices, piecewise cases, tables, align, lists)
 * inside rawLatex, returning clickable & droppable cell/branch/item slots.
 */
export function extractStructuredRegions(rawLatex: string): StructuredRegion[] {
  const regions: StructuredRegion[] = [];
  const targetEnvs = new Set([
    ...MATRIX_ENVS,
    'cases',
    'tabular',
    'array',
    ...ALIGN_ENVS,
    ...LIST_ENVS,
  ]);

  let cursor = 0;
  let regionIdx = 0;

  while (cursor < rawLatex.length) {
    const beginIdx = rawLatex.indexOf('\\begin{', cursor);
    if (beginIdx === -1) break;
    const envMatch = rawLatex.slice(beginIdx).match(/^\\begin\{([^}]+)\}/);
    if (!envMatch) {
      cursor = beginIdx + 7;
      continue;
    }

    const envName = envMatch[1];
    if (!targetEnvs.has(envName)) {
      cursor = beginIdx + envMatch[0].length;
      continue;
    }

    // Find matching \end{envName}
    let bodyStart = beginIdx + envMatch[0].length;
    if (envName === 'tabular' || envName === 'array') {
      const trimmed = rawLatex.slice(bodyStart).match(/^\s*\{/);
      if (trimmed) {
        const arg = readBraceArg(rawLatex, bodyStart + trimmed[0].length - 1);
        if (arg) bodyStart = arg.nextIdx;
      }
    } else if (rawLatex[bodyStart] === '[') {
      const opt = readBracketArg(rawLatex, bodyStart);
      if (opt) bodyStart = opt.nextIdx;
    }

    let searchPos = bodyStart;
    let depth = 1;
    let bodyEnd = rawLatex.length;
    let envEnd = rawLatex.length;

    while (searchPos < rawLatex.length && depth > 0) {
      const nextBegin = rawLatex.indexOf(`\\begin{${envName}}`, searchPos);
      const nextEnd = rawLatex.indexOf(`\\end{${envName}}`, searchPos);
      if (nextEnd === -1) break;
      if (nextBegin !== -1 && nextBegin < nextEnd) {
        depth++;
        searchPos = nextBegin + `\\begin{${envName}}`.length;
      } else {
        depth--;
        if (depth === 0) {
          bodyEnd = nextEnd;
          envEnd = nextEnd + `\\end{${envName}}`.length;
        }
        searchPos = nextEnd + `\\end{${envName}}`.length;
      }
    }

    const idPrefix = `region-${regionIdx++}`;

    if (LIST_ENVS.has(envName)) {
      const cells: StructuredCellSlot[] = [];
      let itemSearch = bodyStart;
      const itemPositions: Array<{ cmdStart: number; contentStart: number }> = [];
      while (itemSearch < bodyEnd) {
        const idx = rawLatex.indexOf('\\item', itemSearch);
        if (idx === -1 || idx >= bodyEnd) break;
        let cStart = idx + 5;
        if (rawLatex[cStart] === '[') {
          const opt = readBracketArg(rawLatex, cStart);
          if (opt) cStart = opt.nextIdx;
        }
        itemPositions.push({ cmdStart: idx, contentStart: cStart });
        itemSearch = cStart;
      }

      itemPositions.forEach((pos, idx) => {
        const contentEnd =
          idx + 1 < itemPositions.length ? itemPositions[idx + 1].cmdStart : bodyEnd;
        const trimmed = trimRange(rawLatex, pos.contentStart, contentEnd);
        cells.push({
          id: `${idPrefix}-item-${idx}`,
          rowIndex: idx,
          colIndex: 0,
          label: `Item ${idx + 1}`,
          startOffset: pos.contentStart,
          endOffset: contentEnd,
          trimStartOffset: trimmed.start,
          trimEndOffset: trimmed.end,
          text: rawLatex.slice(trimmed.start, trimmed.end),
        });
      });

      regions.push({
        id: idPrefix,
        kind: 'list',
        envName,
        title: envName === 'enumerate' ? 'Numbered List Items' : 'Bullet List Items',
        startOffset: beginIdx,
        endOffset: envEnd,
        bodyStartOffset: bodyStart,
        bodyEndOffset: bodyEnd,
        cells,
        columnCount: 1,
        rowCount: cells.length,
      });
    } else {
      const rawRows = splitTopLevelRanges(rawLatex, bodyStart, bodyEnd, '\\\\');
      const cells: StructuredCellSlot[] = [];
      let maxCols = 1;
      let logicalRow = 0;

      for (const row of rawRows) {
        let rowStart = row.start;
        let rowEnd = row.end;
        // Skip leading/trailing \hline or \cline{...}
        const leadingHline = rawLatex.slice(rowStart, rowEnd).match(/^(\s*\\hline\b)+/);
        if (leadingHline) {
          rowStart += leadingHline[0].length;
        }
        const trailingHline = rawLatex.slice(rowStart, rowEnd).match(/(\\hline\b\s*)+$/);
        if (trailingHline) {
          rowEnd -= trailingHline[0].length;
        }

        const rowSliceTrimmed = rawLatex.slice(rowStart, rowEnd).trim();
        if (!rowSliceTrimmed && rawRows.length > 1) {
          continue;
        }

        const cols = splitTopLevelRanges(rawLatex, rowStart, rowEnd, '&');
        maxCols = Math.max(maxCols, cols.length);

        cols.forEach((col, colIdx) => {
          const trimmed = trimRange(rawLatex, col.start, col.end);
          const cellLabel =
            envName === 'cases'
              ? colIdx === 0
                ? `Branch ${logicalRow + 1} value`
                : `Branch ${logicalRow + 1} condition`
              : ALIGN_ENVS.has(envName)
                ? `Eq ${logicalRow + 1}${cols.length > 1 ? ` · Col ${colIdx + 1}` : ''}`
                : `R${logicalRow + 1}, C${colIdx + 1}`;

          cells.push({
            id: `${idPrefix}-r${logicalRow}-c${colIdx}`,
            rowIndex: logicalRow,
            colIndex: colIdx,
            label: cellLabel,
            startOffset: col.start,
            endOffset: col.end,
            trimStartOffset: trimmed.start,
            trimEndOffset: trimmed.end,
            text: rawLatex.slice(trimmed.start, trimmed.end),
          });
        });

        logicalRow++;
      }

      const kind: StructuredRegion['kind'] =
        envName === 'cases'
          ? 'cases'
          : envName === 'tabular' || envName === 'array'
            ? 'table'
            : ALIGN_ENVS.has(envName)
              ? 'align'
              : 'matrix';

      const title =
        kind === 'cases'
          ? 'Piecewise Branches'
          : kind === 'table'
            ? 'Table Cells'
            : kind === 'align'
              ? 'Aligned Lines'
              : 'Matrix Cells';

      regions.push({
        id: idPrefix,
        kind,
        envName,
        title,
        startOffset: beginIdx,
        endOffset: envEnd,
        bodyStartOffset: bodyStart,
        bodyEndOffset: bodyEnd,
        cells,
        columnCount: maxCols,
        rowCount: logicalRow,
      });
    }

    cursor = envEnd;
  }

  return regions;
}

/**
 * Extracts sub-slots inside fractions, binomials, roots, subscripts, and superscripts.
 */
export function extractSubPartSlots(rawLatex: string): SubPartSlot[] {
  const slots: SubPartSlot[] = [];
  let slotId = 0;
  let i = 0;

  while (i < rawLatex.length) {
    if (rawLatex[i] === '\\') {
      const fracMatch = rawLatex.slice(i).match(/^\\(dfrac|tfrac|frac|binom)\s*\{/);
      if (fracMatch) {
        const cmd = fracMatch[1];
        const firstBrace = i + fracMatch[0].length - 1;
        const arg1 = readBraceArg(rawLatex, firstBrace);
        if (arg1) {
          const t1 = trimRange(rawLatex, firstBrace + 1, arg1.nextIdx - 1);
          slots.push({
            id: `sub-${slotId++}`,
            groupLabel: cmd === 'binom' ? 'Binomial' : 'Fraction',
            label: cmd === 'binom' ? 'Top (n)' : 'Numerator',
            startOffset: firstBrace + 1,
            endOffset: arg1.nextIdx - 1,
            trimStartOffset: t1.start,
            trimEndOffset: t1.end,
            text: rawLatex.slice(t1.start, t1.end),
          });

          const restAfter1 = rawLatex.slice(arg1.nextIdx).match(/^\s*\{/);
          if (restAfter1) {
            const secondBrace = arg1.nextIdx + restAfter1[0].length - 1;
            const arg2 = readBraceArg(rawLatex, secondBrace);
            if (arg2) {
              const t2 = trimRange(rawLatex, secondBrace + 1, arg2.nextIdx - 1);
              slots.push({
                id: `sub-${slotId++}`,
                groupLabel: cmd === 'binom' ? 'Binomial' : 'Fraction',
                label: cmd === 'binom' ? 'Bottom (k)' : 'Denominator',
                startOffset: secondBrace + 1,
                endOffset: arg2.nextIdx - 1,
                trimStartOffset: t2.start,
                trimEndOffset: t2.end,
                text: rawLatex.slice(t2.start, t2.end),
              });
              i = firstBrace + 1;
              continue;
            }
          }
        }
      }

      const sqrtMatch = rawLatex.slice(i).match(/^\\sqrt\s*/);
      if (sqrtMatch) {
        let pos = i + sqrtMatch[0].length;
        if (rawLatex[pos] === '[') {
          const opt = readBracketArg(rawLatex, pos);
          if (opt) {
            const tOpt = trimRange(rawLatex, pos + 1, opt.nextIdx - 1);
            slots.push({
              id: `sub-${slotId++}`,
              groupLabel: 'Root',
              label: 'Root index',
              startOffset: pos + 1,
              endOffset: opt.nextIdx - 1,
              trimStartOffset: tOpt.start,
              trimEndOffset: tOpt.end,
              text: rawLatex.slice(tOpt.start, tOpt.end),
            });
            pos = opt.nextIdx;
          }
        }
        if (rawLatex[pos] === '{') {
          const bodyArg = readBraceArg(rawLatex, pos);
          if (bodyArg) {
            const tBody = trimRange(rawLatex, pos + 1, bodyArg.nextIdx - 1);
            slots.push({
              id: `sub-${slotId++}`,
              groupLabel: 'Root',
              label: 'Inside √',
              startOffset: pos + 1,
              endOffset: bodyArg.nextIdx - 1,
              trimStartOffset: tBody.start,
              trimEndOffset: tBody.end,
              text: rawLatex.slice(tBody.start, tBody.end),
            });
            i = pos + 1;
            continue;
          }
        }
      }

      i += 2;
      continue;
    }

    if ((rawLatex[i] === '_' || rawLatex[i] === '^') && rawLatex[i + 1] === '{') {
      const isSub = rawLatex[i] === '_';
      const arg = readBraceArg(rawLatex, i + 1);
      if (arg) {
        const t = trimRange(rawLatex, i + 2, arg.nextIdx - 1);
        slots.push({
          id: `sub-${slotId++}`,
          groupLabel: isSub ? 'Subscript' : 'Superscript',
          label: isSub ? 'Lower / Subscript' : 'Upper / Power',
          startOffset: i + 2,
          endOffset: arg.nextIdx - 1,
          trimStartOffset: t.start,
          trimEndOffset: t.end,
          text: rawLatex.slice(t.start, t.end),
        });
      }
      i += 2;
      continue;
    }

    i++;
  }

  return slots;
}

/**
 * Tokenizes any slice [rangeStart, rangeEnd] into top-level elements and all between-element gaps,
 * enabling placement before the first element, between any 2 arbitrary elements, or after the last element.
 */
export function tokenizeForInsertion(
  rawLatex: string,
  rangeStart: number,
  rangeEnd: number
): TokenPlacementStrip {
  const tokens: InlineToken[] = [];
  let i = rangeStart;
  let tokIdx = 0;

  while (i < rangeEnd) {
    if (/\s/.test(rawLatex[i])) {
      i++;
      continue;
    }

    const start = i;

    // \begin{...}...\end{...} as one top-level token
    const beginMatch = rawLatex.slice(i, rangeEnd).match(/^\\begin\{([^}]+)\}/);
    if (beginMatch) {
      const envName = beginMatch[1];
      let searchPos = i + beginMatch[0].length;
      let depth = 1;
      let tokenEnd = rangeEnd;
      while (searchPos < rangeEnd && depth > 0) {
        const nb = rawLatex.indexOf(`\\begin{${envName}}`, searchPos);
        const ne = rawLatex.indexOf(`\\end{${envName}}`, searchPos);
        if (ne === -1 || ne >= rangeEnd) break;
        if (nb !== -1 && nb < ne) {
          depth++;
          searchPos = nb + `\\begin{${envName}}`.length;
        } else {
          depth--;
          if (depth === 0) {
            tokenEnd = ne + `\\end{${envName}}`.length;
          }
          searchPos = ne + `\\end{${envName}}`.length;
        }
      }
      tokens.push({
        id: `tok-${tokIdx++}`,
        text: envName === 'cases' ? 'cases{…}' : `${envName}`,
        startOffset: start,
        endOffset: tokenEnd,
      });
      i = tokenEnd;
      continue;
    }

    // Inline math $...$ as one token when scanning outside math
    if (rawLatex[i] === '$' && rawLatex[i + 1] !== '$') {
      let end = i + 1;
      while (end < rangeEnd) {
        if (rawLatex[end] === '\\') {
          end += 2;
          continue;
        }
        if (rawLatex[end] === '$') {
          end++;
          break;
        }
        end++;
      }
      tokens.push({
        id: `tok-${tokIdx++}`,
        text: rawLatex.slice(start, end),
        startOffset: start,
        endOffset: end,
      });
      i = end;
      continue;
    }

    // LaTeX command + balanced args (\frac{a}{b}, \alpha, \sum_{i=1}^{n}, etc.)
    if (rawLatex[i] === '\\') {
      const cmdMatch = rawLatex.slice(i, rangeEnd).match(/^\\([a-zA-Z]+\*?|[^a-zA-Z\s])/);
      if (cmdMatch) {
        let end = i + cmdMatch[0].length;
        while (end < rangeEnd) {
          if (rawLatex[end] === '[') {
            const opt = readBracketArg(rawLatex, end);
            if (opt && opt.nextIdx <= rangeEnd) {
              end = opt.nextIdx;
              continue;
            }
          }
          if (rawLatex[end] === '{') {
            const arg = readBraceArg(rawLatex, end);
            if (arg && arg.nextIdx <= rangeEnd) {
              end = arg.nextIdx;
              continue;
            }
          }
          if ((rawLatex[end] === '_' || rawLatex[end] === '^') && end + 1 < rangeEnd) {
            if (rawLatex[end + 1] === '{') {
              const arg = readBraceArg(rawLatex, end + 1);
              if (arg && arg.nextIdx <= rangeEnd) {
                end = arg.nextIdx;
                continue;
              }
            } else if (rawLatex[end + 1] === '\\') {
              const subCmd = rawLatex.slice(end + 1, rangeEnd).match(/^\\([a-zA-Z]+\*?|[^a-zA-Z\s])/);
              if (subCmd) {
                end += 1 + subCmd[0].length;
                continue;
              }
            } else {
              end += 2;
              continue;
            }
          }
          break;
        }
        tokens.push({
          id: `tok-${tokIdx++}`,
          text: rawLatex.slice(start, end),
          startOffset: start,
          endOffset: end,
        });
        i = end;
        continue;
      }
    }

    // Braced group {...}
    if (rawLatex[i] === '{') {
      const arg = readBraceArg(rawLatex, i);
      if (arg && arg.nextIdx <= rangeEnd) {
        tokens.push({
          id: `tok-${tokIdx++}`,
          text: rawLatex.slice(start, arg.nextIdx),
          startOffset: start,
          endOffset: arg.nextIdx,
        });
        i = arg.nextIdx;
        continue;
      }
    }

    // Alphanumeric / number chunk, optionally followed by _ / ^ scripts
    if (/[a-zA-Z0-9.]/.test(rawLatex[i])) {
      let end = i + 1;
      while (end < rangeEnd && /[a-zA-Z0-9.]/.test(rawLatex[end])) {
        end++;
      }
      while (end < rangeEnd && (rawLatex[end] === '_' || rawLatex[end] === '^')) {
        if (rawLatex[end + 1] === '{') {
          const arg = readBraceArg(rawLatex, end + 1);
          if (arg && arg.nextIdx <= rangeEnd) {
            end = arg.nextIdx;
            continue;
          }
        } else if (rawLatex[end + 1] === '\\') {
          const subCmd = rawLatex.slice(end + 1, rangeEnd).match(/^\\([a-zA-Z]+\*?|[^a-zA-Z\s])/);
          if (subCmd) {
            end += 1 + subCmd[0].length;
            continue;
          }
        } else if (end + 1 < rangeEnd) {
          end += 2;
          continue;
        }
        break;
      }
      tokens.push({
        id: `tok-${tokIdx++}`,
        text: rawLatex.slice(start, end),
        startOffset: start,
        endOffset: end,
      });
      i = end;
      continue;
    }

    // Single operator / punctuation (+, -, =, <, >, (, ), etc.)
    tokens.push({
      id: `tok-${tokIdx++}`,
      text: rawLatex[i],
      startOffset: start,
      endOffset: start + 1,
    });
    i++;
  }

  const gaps: TokenGap[] = [];
  if (tokens.length === 0) {
    const t = trimRange(rawLatex, rangeStart, rangeEnd);
    gaps.push({
      id: 'gap-0',
      offset: t.start,
      label: 'Insert here',
    });
  } else {
    gaps.push({
      id: 'gap-0',
      offset: tokens[0].startOffset,
      label: `Before ${tokens[0].text}`,
    });
    for (let t = 0; t < tokens.length - 1; t++) {
      gaps.push({
        id: `gap-${t + 1}`,
        offset: tokens[t].endOffset,
        label: `Between ${tokens[t].text} and ${tokens[t + 1].text}`,
      });
    }
    const lastTok = tokens[tokens.length - 1];
    gaps.push({
      id: `gap-${tokens.length}`,
      offset: lastTok.endOffset,
      label: `After ${lastTok.text}`,
    });
  }

  return {
    rangeStart,
    rangeEnd,
    tokens,
    gaps,
  };
}

export function extractBlockPlacementModel(
  rawLatex: string,
  kind: PreviewBlockKind
): BlockPlacementModel {
  const structuredRegions = extractStructuredRegions(rawLatex);
  const subPartSlots = extractSubPartSlots(rawLatex);
  const bodyRange = getBlockEditableRange(rawLatex, kind);
  const bodyStrip = tokenizeForInsertion(rawLatex, bodyRange.start, bodyRange.end);

  return {
    structuredRegions,
    subPartSlots,
    bodyRange,
    bodyStrip,
  };
}

/**
 * Inserts a snippet cleanly at a specific character offset inside a block's rawLatex,
 * respecting math vs prose mode and $0 placeholder caret positioning.
 */
export function insertAtLatexOffset(
  rawLatex: string,
  offset: number,
  blockKind: PreviewBlockKind,
  snippet: string,
  isMathSymbol: boolean
): { nextLatex: string; nextOffset: number } {
  const clamped = Math.max(0, Math.min(offset, rawLatex.length));
  const inMath = isOffsetInMathMode(rawLatex, clamped, blockKind);

  let rawSnippet = snippet;
  if (rawSnippet === '$$0$') {
    rawSnippet = inMath ? '$0' : '$$0$';
  } else if (inMath && rawSnippet.startsWith('$') && rawSnippet.endsWith('$') && rawSnippet.length > 2) {
    rawSnippet = rawSnippet.slice(1, -1);
  }

  const markerIdx = rawSnippet.indexOf('$0');
  const cleanSnippet = rawSnippet.replace(/\$0/g, '');
  let inserted = cleanSnippet;
  let relativeCaret = markerIdx !== -1 ? markerIdx : cleanSnippet.length;

  const before = rawLatex.slice(0, clamped);
  const after = rawLatex.slice(clamped);

  if (isMathSymbol && !inMath) {
    // Check if clamping right against closing `$` or after `$...$`
    const wrapped = `$${cleanSnippet}$`;
    const needLeadingSpace =
      before.length > 0 && !/[\s{(\[$]$/.test(before);
    const needTrailingSpace =
      after.length > 0 && !/^[\s}),.\]$]/.test(after);
    inserted = `${needLeadingSpace ? ' ' : ''}${wrapped}${needTrailingSpace ? ' ' : ''}`;
    relativeCaret =
      (needLeadingSpace ? 1 : 0) +
      1 +
      (markerIdx !== -1 ? markerIdx : cleanSnippet.length);
  } else {
    const needLeadingSpace =
      before.length > 0 &&
      /[a-zA-Z0-9}]$/.test(before) &&
      (/^[a-zA-Z0-9]/.test(cleanSnippet) ||
        (before.endsWith('}') === false && /^\\[a-zA-Z]/.test(cleanSnippet) && /[a-zA-Z0-9]$/.test(before)));
    const needTrailingSpace =
      after.length > 0 &&
      /^\\[a-zA-Z]/.test(cleanSnippet) &&
      /^[a-zA-Z0-9]/.test(after) &&
      !cleanSnippet.endsWith('}') &&
      !cleanSnippet.endsWith(' ');

    const prefix = needLeadingSpace ? ' ' : '';
    const suffix = needTrailingSpace ? ' ' : '';
    inserted = `${prefix}${cleanSnippet}${suffix}`;
    relativeCaret = prefix.length + (markerIdx !== -1 ? markerIdx : cleanSnippet.length);
  }

  return {
    nextLatex: before + inserted + after,
    nextOffset: clamped + relativeCaret,
  };
}

/**
 * Adds a new row to a matrix, piecewise cases, table, or align region inside rawLatex.
 */
export function appendRowToStructuredRegion(
  rawLatex: string,
  region: StructuredRegion
): string {
  const beforeEnd = rawLatex.slice(0, region.bodyEndOffset).replace(/[ \t]+$/, '');
  const afterEnd = rawLatex.slice(region.bodyEndOffset);

  if (region.kind === 'list') {
    const sep = beforeEnd.endsWith('\n') ? '' : '\n';
    return `${beforeEnd}${sep}  \\item New item\n${afterEnd.replace(/^\n*/, '')}`;
  }

  let newRowText = '';
  if (region.kind === 'cases') {
    newRowText = '  0, & x < 0';
  } else if (region.kind === 'table') {
    const cols = Math.max(1, region.columnCount);
    newRowText = `  ${Array.from({ length: cols }, (_, i) => `Cell ${i + 1}`).join(' & ')}`;
  } else if (region.kind === 'align') {
    newRowText = '  y &= z';
  } else {
    const cols = Math.max(1, region.columnCount);
    newRowText = `  ${Array.from({ length: cols }, () => '0').join(' & ')}`;
  }

  const needsBackslash =
    beforeEnd.trim().length > 0 &&
    !beforeEnd.trimEnd().endsWith('\\\\') &&
    !beforeEnd.trimEnd().endsWith('\\hline');

  const prefix = needsBackslash ? ' \\\\\n' : beforeEnd.endsWith('\n') ? '' : '\n';
  const suffix = region.kind === 'table' && /\\hline\s*$/.test(beforeEnd) ? ' \\\\\n  \\hline\n' : '\n';

  // If table already ended with \hline, insert right before the trailing \hline
  if (region.kind === 'table') {
    const trailingHlineMatch = beforeEnd.match(/\n?[ \t]*\\hline\s*$/);
    if (trailingHlineMatch && trailingHlineMatch.index !== undefined) {
      const head = beforeEnd.slice(0, trailingHlineMatch.index).replace(/[ \t]+$/, '');
      const tailHline = trailingHlineMatch[0];
      const rowSep = head.trimEnd().endsWith('\\\\') ? '\n' : ' \\\\\n';
      return `${head}${rowSep}${newRowText} \\\\${tailHline}\n${afterEnd.replace(/^\n*/, '')}`;
    }
  }

  return `${beforeEnd}${prefix}${newRowText}${suffix}${afterEnd.replace(/^\n*/, '')}`;
}

/**
 * Adds a new column to every row of a matrix or table region.
 */
export function appendColumnToStructuredRegion(
  rawLatex: string,
  region: StructuredRegion
): string {
  if (region.kind !== 'matrix' && region.kind !== 'table') {
    return rawLatex;
  }

  const rowGroups = new Map<number, StructuredCellSlot[]>();
  for (const cell of region.cells) {
    const list = rowGroups.get(cell.rowIndex) ?? [];
    list.push(cell);
    rowGroups.set(cell.rowIndex, list);
  }

  const insertions: Array<{ offset: number; text: string }> = [];
  for (const [, rowCells] of rowGroups) {
    const lastCell = rowCells[rowCells.length - 1];
    if (!lastCell) continue;
    insertions.push({
      offset: lastCell.trimEndOffset,
      text: region.kind === 'table' ? ' & Cell' : ' & 0',
    });
  }

  let updated = rawLatex;
  // Apply from right to left so earlier offsets remain intact
  insertions
    .sort((a, b) => b.offset - a.offset)
    .forEach((ins) => {
      updated = updated.slice(0, ins.offset) + ins.text + updated.slice(ins.offset);
    });

  // For tabular{l c r}, extend column specification
  if (region.kind === 'table') {
    updated = updated.replace(
      /\\begin\{(tabular|array)\}\{([^}]*)\}/,
      (_m, env, spec) => `\\begin{${env}}{${spec.trim()} c}`
    );
  }

  return updated;
}
