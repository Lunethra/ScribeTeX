import katex from 'katex';
import type { CompileDiagnostic, OutlineHeading, ParsedLaTeXResult } from '../types/editor';

export interface ParseOptions {
  equationNumbering?: boolean;
}

interface PreambleInfo {
  title: string;
  author: string;
  date: string;
  macros: Record<string, string>;
  bodyStartIndex: number;
  bodyEndIndex: number;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('mailto:') ||
    trimmed.startsWith('#')
  ) {
    return escapeHtml(trimmed);
  }
  return '#';
}

/**
 * Strips unescaped % line comments while preserving line count and verbatim blocks.
 */
export function stripComments(source: string): string {
  const lines = source.split('\n');
  let inVerbatim = false;

  return lines
    .map((line) => {
      if (/\\begin\{(verbatim|lstlisting|minted)\}/.test(line)) {
        inVerbatim = true;
        return line;
      }
      if (/\\end\{(verbatim|lstlisting|minted)\}/.test(line)) {
        inVerbatim = false;
        return line;
      }
      if (inVerbatim) return line;

      let out = '';
      let escaped = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (escaped) {
          out += ch;
          escaped = false;
          continue;
        }
        if (ch === '\\') {
          escaped = true;
          out += ch;
          continue;
        }
        if (ch === '%') {
          break;
        }
        out += ch;
      }
      return out;
    })
    .join('\n');
}

/**
 * Extracts a balanced { ... } argument starting at or after startIdx.
 */
export function readBraceArg(
  source: string,
  startIdx: number
): { value: string; nextIdx: number } | null {
  let i = startIdx;
  while (i < source.length && /\s/.test(source[i])) i++;
  if (source[i] !== '{') return null;

  let depth = 0;
  let value = '';
  for (let j = i; j < source.length; j++) {
    const ch = source[j];
    if (ch === '\\' && j + 1 < source.length) {
      if (depth > 0) value += ch + source[j + 1];
      j++;
      continue;
    }
    if (ch === '{') {
      if (depth > 0) value += ch;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return { value, nextIdx: j + 1 };
      }
      value += ch;
    } else {
      value += ch;
    }
  }
  return null;
}

/**
 * Extracts an optional [ ... ] argument starting at or after startIdx.
 */
export function readBracketArg(
  source: string,
  startIdx: number
): { value: string; nextIdx: number } | null {
  let i = startIdx;
  while (i < source.length && /\s/.test(source[i])) i++;
  if (source[i] !== '[') return null;

  let depth = 0;
  let value = '';
  for (let j = i; j < source.length; j++) {
    const ch = source[j];
    if (ch === '[') {
      if (depth > 0) value += ch;
      depth++;
    } else if (ch === ']') {
      depth--;
      if (depth === 0) {
        return { value, nextIdx: j + 1 };
      }
      value += ch;
    } else {
      value += ch;
    }
  }
  return null;
}

function extractCommandArg(source: string, cmdName: string): string {
  const regex = new RegExp(`\\\\${cmdName}\\s*\\{`);
  const match = regex.exec(source);
  if (!match) return '';
  const braceStart = match.index + match[0].length - 1;
  const parsed = readBraceArg(source, braceStart);
  return parsed ? parsed.value.trim() : '';
}

function extractMacros(source: string): Record<string, string> {
  const macros: Record<string, string> = {
    '\\coloneqq': '\\mathrel{\\vcenter{:}}=',
  };

  const cmdRegex = /\\(?:re)?newcommand\*?\s*\{?(\\[a-zA-Z]+)\}?\s*(?:\[(\d+)\])?\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = cmdRegex.exec(source)) !== null) {
    const macroName = match[1];
    const braceStart = match.index + match[0].length - 1;
    const def = readBraceArg(source, braceStart);
    if (def) {
      macros[macroName] = def.value;
    }
  }

  const mathOpRegex = /\\DeclareMathOperator\*?\s*\{(\\[a-zA-Z]+)\}\s*\{/g;
  while ((match = mathOpRegex.exec(source)) !== null) {
    const macroName = match[1];
    const braceStart = match.index + match[0].length - 1;
    const def = readBraceArg(source, braceStart);
    if (def) {
      macros[macroName] = `\\operatorname{${def.value}}`;
    }
  }

  return macros;
}

function extractPreamble(source: string): PreambleInfo {
  const beginDoc = source.indexOf('\\begin{document}');
  const endDoc = source.lastIndexOf('\\end{document}');

  const preambleText = beginDoc >= 0 ? source.slice(0, beginDoc) : source;
  const bodyStartIndex = beginDoc >= 0 ? beginDoc + '\\begin{document}'.length : 0;
  const bodyEndIndex = endDoc > bodyStartIndex ? endDoc : source.length;

  const title = extractCommandArg(preambleText, 'title') || extractCommandArg(source, 'title');
  const author = extractCommandArg(preambleText, 'author') || extractCommandArg(source, 'author');
  const rawDate = extractCommandArg(preambleText, 'date') || extractCommandArg(source, 'date');
  const date =
    rawDate === '\\today'
      ? new Date().toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : rawDate;

  const macros = extractMacros(source);

  return {
    title,
    author,
    date,
    macros,
    bodyStartIndex,
    bodyEndIndex,
  };
}

function renderKatexSafe(
  tex: string,
  displayMode: boolean,
  macros: Record<string, string>,
  diagnostics: CompileDiagnostic[]
): string {
  const cleaned = tex.trim();
  if (!cleaned) return '';

  try {
    return katex.renderToString(cleaned, {
      displayMode,
      throwOnError: true,
      strict: 'ignore',
      trust: false,
      macros: { ...macros },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'LaTeX math parse error';
    diagnostics.push({
      id: `diag-${diagnostics.length + 1}`,
      message: message.replace(/^KaTeX parse error:\s*/, ''),
      snippet: cleaned.slice(0, 80),
      severity: 'error',
    });

    const fallback = katex.renderToString(cleaned, {
      displayMode,
      throwOnError: false,
      strict: 'ignore',
      errorColor: '#ef4444',
      macros: { ...macros },
    });

    return `<span class="latex-math-error-wrap" title="${escapeHtml(message)}">${fallback}</span>`;
  }
}

interface RenderContext {
  macros: Record<string, string>;
  diagnostics: CompileDiagnostic[];
  labels: Map<string, string>;
  citations: Map<string, number>;
  footnotes: string[];
  outline: OutlineHeading[];
  sectionCounters: [number, number, number];
  equationCounter: number;
  theoremCounters: Record<string, number>;
  equationNumbering: boolean;
}

function cleanPlainTitle(raw: string): string {
  return raw
    .replace(/\\textbf\{([^}]*)\}/g, '$1')
    .replace(/\\textit\{([^}]*)\}/g, '$1')
    .replace(/\\emph\{([^}]*)\}/g, '$1')
    .replace(/\\texttt\{([^}]*)\}/g, '$1')
    .replace(/\\and/g, ' & ')
    .replace(/\\&/g, '&')
    .replace(/--/g, '–')
    .replace(/\s+/g, ' ')
    .trim();
}

function renderInline(text: string, ctx: RenderContext): string {
  let out = '';
  let i = 0;

  while (i < text.length) {
    // Escaped special chars
    if (text[i] === '\\' && i + 1 < text.length) {
      const next = text[i + 1];

      // Display math \[ ... \]
      if (next === '[') {
        const closeIdx = text.indexOf('\\]', i + 2);
        if (closeIdx !== -1) {
          const math = text.slice(i + 2, closeIdx);
          ctx.equationCounter++;
          const rendered = renderKatexSafe(math, true, ctx.macros, ctx.diagnostics);
          out += `<div class="latex-display-math">${rendered}</div>`;
          i = closeIdx + 2;
          continue;
        }
      }

      // Inline math \( ... \)
      if (next === '(') {
        const closeIdx = text.indexOf('\\)', i + 2);
        if (closeIdx !== -1) {
          const math = text.slice(i + 2, closeIdx);
          out += renderKatexSafe(math, false, ctx.macros, ctx.diagnostics);
          i = closeIdx + 2;
          continue;
        }
      }

      // Line break \\
      if (next === '\\') {
        out += '<br />';
        i += 2;
        if (text[i] === '[') {
          const opt = readBracketArg(text, i);
          if (opt) i = opt.nextIdx;
        }
        continue;
      }

      // Escaped literal characters
      if ('%$&#_{}'.includes(next)) {
        out += escapeHtml(next);
        i += 2;
        continue;
      }

      // LaTeX diacritics like \"{o} or \'e
      if (`"'~\`^=`.includes(next)) {
        const rest = text.slice(i + 2);
        const braced = rest.match(/^\{([a-zA-Z])\}/);
        const single = rest.match(/^([a-zA-Z])/);
        const ch = braced ? braced[1] : single ? single[1] : '';
        if (ch) {
          const umlautMap: Record<string, string> = {
            a: 'ä', o: 'ö', u: 'ü', A: 'Ä', O: 'Ö', U: 'Ü', e: 'ë', i: 'ï',
          };
          const acuteMap: Record<string, string> = {
            a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú', A: 'Á', E: 'É', I: 'Í', O: 'Ó', U: 'Ú',
          };
          const graveMap: Record<string, string> = {
            a: 'à', e: 'è', i: 'ì', o: 'ò', u: 'ù',
          };
          let mapped = ch;
          if (next === '"' && umlautMap[ch]) mapped = umlautMap[ch];
          else if (next === "'" && acuteMap[ch]) mapped = acuteMap[ch];
          else if (next === '`' && graveMap[ch]) mapped = graveMap[ch];
          out += mapped;
          i += 2 + (braced ? braced[0].length : 1);
          continue;
        }
      }

      // Named commands
      const cmdMatch = text.slice(i).match(/^\\([a-zA-Z]+\*?)/);
      if (cmdMatch) {
        const cmd = cmdMatch[1];
        const afterCmd = i + cmdMatch[0].length;

        if (cmd === 'textbf' || cmd === 'bf') {
          const arg = readBraceArg(text, afterCmd);
          if (arg) {
            out += `<strong>${renderInline(arg.value, ctx)}</strong>`;
            i = arg.nextIdx;
            continue;
          }
        }
        if (cmd === 'textit' || cmd === 'emph' || cmd === 'it') {
          const arg = readBraceArg(text, afterCmd);
          if (arg) {
            out += `<em>${renderInline(arg.value, ctx)}</em>`;
            i = arg.nextIdx;
            continue;
          }
        }
        if (cmd === 'texttt' || cmd === 'verb') {
          const arg = readBraceArg(text, afterCmd);
          if (arg) {
            out += `<code class="px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 font-mono text-[0.88em]">${escapeHtml(arg.value)}</code>`;
            i = arg.nextIdx;
            continue;
          }
        }
        if (cmd === 'underline') {
          const arg = readBraceArg(text, afterCmd);
          if (arg) {
            out += `<span class="underline underline-offset-2">${renderInline(arg.value, ctx)}</span>`;
            i = arg.nextIdx;
            continue;
          }
        }
        if (cmd === 'textsc') {
          const arg = readBraceArg(text, afterCmd);
          if (arg) {
            out += `<span style="font-variant: small-caps">${renderInline(arg.value, ctx)}</span>`;
            i = arg.nextIdx;
            continue;
          }
        }
        if (cmd === 'textsuperscript') {
          const arg = readBraceArg(text, afterCmd);
          if (arg) {
            out += `<sup>${renderInline(arg.value, ctx)}</sup>`;
            i = arg.nextIdx;
            continue;
          }
        }
        if (cmd === 'textsubscript') {
          const arg = readBraceArg(text, afterCmd);
          if (arg) {
            out += `<sub>${renderInline(arg.value, ctx)}</sub>`;
            i = arg.nextIdx;
            continue;
          }
        }
        if (cmd === 'textcolor') {
          const colorArg = readBraceArg(text, afterCmd);
          if (colorArg) {
            const bodyArg = readBraceArg(text, colorArg.nextIdx);
            if (bodyArg) {
              const safeColor = colorArg.value.replace(/[^a-zA-Z0-9#(),.% -]/g, '');
              out += `<span style="color: ${safeColor}">${renderInline(bodyArg.value, ctx)}</span>`;
              i = bodyArg.nextIdx;
              continue;
            }
          }
        }
        if (cmd === 'colorbox') {
          const colorArg = readBraceArg(text, afterCmd);
          if (colorArg) {
            const bodyArg = readBraceArg(text, colorArg.nextIdx);
            if (bodyArg) {
              const safeColor = colorArg.value.replace(/[^a-zA-Z0-9#(),.% -]/g, '');
              out += `<span class="px-1.5 py-0.5 rounded" style="background-color: ${safeColor}">${renderInline(bodyArg.value, ctx)}</span>`;
              i = bodyArg.nextIdx;
              continue;
            }
          }
        }
        if (cmd === 'href') {
          const urlArg = readBraceArg(text, afterCmd);
          if (urlArg) {
            const labelArg = readBraceArg(text, urlArg.nextIdx);
            if (labelArg) {
              out += `<a href="${sanitizeUrl(urlArg.value)}" target="_blank" rel="noopener noreferrer" class="underline decoration-zinc-500 text-zinc-900 dark:text-blue-400 dark:decoration-blue-500/60 hover:decoration-zinc-900 dark:hover:decoration-blue-400">${renderInline(labelArg.value, ctx)}</a>`;
              i = labelArg.nextIdx;
              continue;
            }
          }
        }
        if (cmd === 'url') {
          const urlArg = readBraceArg(text, afterCmd);
          if (urlArg) {
            const safe = sanitizeUrl(urlArg.value);
            out += `<a href="${safe}" target="_blank" rel="noopener noreferrer" class="font-mono text-[0.9em] underline decoration-zinc-500 text-zinc-900 dark:text-blue-400">${escapeHtml(urlArg.value)}</a>`;
            i = urlArg.nextIdx;
            continue;
          }
        }
        if (cmd === 'footnote') {
          const arg = readBraceArg(text, afterCmd);
          if (arg) {
            ctx.footnotes.push(renderInline(arg.value, ctx));
            const num = ctx.footnotes.length;
            out += `<sup class="text-zinc-900 dark:text-blue-400 font-semibold">[${num}]</sup>`;
            i = arg.nextIdx;
            continue;
          }
        }
        if (cmd === 'label') {
          const arg = readBraceArg(text, afterCmd);
          if (arg) {
            const id = arg.value.trim();
            out += `<span id="label-${escapeHtml(id)}"></span>`;
            i = arg.nextIdx;
            continue;
          }
        }
        if (cmd === 'ref' || cmd === 'eqref') {
          const arg = readBraceArg(text, afterCmd);
          if (arg) {
            const key = arg.value.trim();
            const resolved = ctx.labels.get(key) || '?';
            const display = cmd === 'eqref' ? `(${resolved})` : resolved;
            out += `<a href="#label-${escapeHtml(key)}" class="text-zinc-900 underline decoration-zinc-400 dark:no-underline dark:text-blue-400 hover:underline font-medium">${escapeHtml(display)}</a>`;
            i = arg.nextIdx;
            continue;
          }
        }
        if (cmd === 'cite') {
          const arg = readBraceArg(text, afterCmd);
          if (arg) {
            const keys = arg.value.split(',').map((k) => k.trim()).filter(Boolean);
            const nums = keys.map((k) => {
              if (!ctx.citations.has(k)) {
                ctx.citations.set(k, ctx.citations.size + 1);
              }
              return ctx.citations.get(k);
            });
            out += `<span class="text-zinc-900 dark:text-blue-400 font-medium">[${nums.join(', ')}]</span>`;
            i = arg.nextIdx;
            continue;
          }
        }
        if (cmd === 'LaTeX') {
          out += '<span class="font-serif tracking-tight">L<sup style="font-size:0.75em;margin-left:-0.15em">A</sup>T<sub style="font-size:0.8em;margin-left:-0.12em">E</sub>X</span>';
          i = afterCmd;
          continue;
        }
        if (cmd === 'TeX') {
          out += '<span class="font-serif tracking-tight">T<sub style="font-size:0.8em;margin-left:-0.12em">E</sub>X</span>';
          i = afterCmd;
          continue;
        }
        if (cmd === 'today') {
          out += new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          });
          i = afterCmd;
          continue;
        }
        if (cmd === 'and') {
          out += ' &middot; ';
          i = afterCmd;
          continue;
        }
        if (cmd === 'newline') {
          out += '<br />';
          i = afterCmd;
          continue;
        }
        if (cmd === 'quad') {
          out += '&emsp;';
          i = afterCmd;
          continue;
        }
        if (cmd === 'qquad') {
          out += '&emsp;&emsp;';
          i = afterCmd;
          continue;
        }
        if (cmd === 'hspace' || cmd === 'vspace') {
          const arg = readBraceArg(text, afterCmd);
          if (arg) {
            i = arg.nextIdx;
            continue;
          }
        }
      }
    }

    // Display math $$ ... $$
    if (text[i] === '$' && text[i + 1] === '$') {
      const closeIdx = text.indexOf('$$', i + 2);
      if (closeIdx !== -1) {
        const math = text.slice(i + 2, closeIdx);
        ctx.equationCounter++;
        const rendered = renderKatexSafe(math, true, ctx.macros, ctx.diagnostics);
        out += `<div class="latex-display-math">${rendered}</div>`;
        i = closeIdx + 2;
        continue;
      }
    }

    // Inline math $ ... $
    if (text[i] === '$') {
      let closeIdx = -1;
      for (let j = i + 1; j < text.length; j++) {
        if (text[j] === '\\') {
          j++;
          continue;
        }
        if (text[j] === '$') {
          closeIdx = j;
          break;
        }
        if (text[j] === '\n' && text[j + 1] === '\n') {
          break;
        }
      }
      if (closeIdx !== -1) {
        const math = text.slice(i + 1, closeIdx);
        out += renderKatexSafe(math, false, ctx.macros, ctx.diagnostics);
        i = closeIdx + 1;
        continue;
      }
    }

    // Scoped font size braces e.g. {\large Hello}
    if (text[i] === '{') {
      const scoped = readBraceArg(text, i);
      if (scoped) {
        const sizeMatch = scoped.value.match(
          /^\s*\\(tiny|scriptsize|footnotesize|small|normalsize|large|Large|LARGE|huge|Huge)\b\s*([\s\S]*)$/
        );
        if (sizeMatch) {
          const sizeMap: Record<string, string> = {
            tiny: '0.7em',
            scriptsize: '0.75em',
            footnotesize: '0.85em',
            small: '0.9em',
            normalsize: '1em',
            large: '1.15em',
            Large: '1.35em',
            LARGE: '1.6em',
            huge: '1.9em',
            Huge: '2.25em',
          };
          out += `<span style="font-size:${sizeMap[sizeMatch[1]] || '1em'}">${renderInline(sizeMatch[2], ctx)}</span>`;
          i = scoped.nextIdx;
          continue;
        }
      }
    }

    // Typographic dashes and quotes
    if (text.startsWith('---', i)) {
      out += '&mdash;';
      i += 3;
      continue;
    }
    if (text.startsWith('--', i)) {
      out += '&ndash;';
      i += 2;
      continue;
    }
    if (text.startsWith('``', i)) {
      out += '&ldquo;';
      i += 2;
      continue;
    }
    if (text.startsWith("''", i)) {
      out += '&rdquo;';
      i += 2;
      continue;
    }
    if (text[i] === '~') {
      out += '&nbsp;';
      i += 1;
      continue;
    }

    out += escapeHtml(text[i]);
    i++;
  }

  return out;
}

function renderTabular(content: string, ctx: RenderContext): string {
  const colSpec = readBraceArg(content, 0);
  const specStr = colSpec ? colSpec.value : 'l';
  const body = colSpec ? content.slice(colSpec.nextIdx) : content;

  const alignments: Array<'left' | 'center' | 'right'> = [];
  for (const ch of specStr) {
    if (ch === 'c') alignments.push('center');
    else if (ch === 'r') alignments.push('right');
    else if (ch === 'l' || ch === 'p') alignments.push('left');
  }

  const rawRows = body
    .replace(/\\toprule|\\midrule|\\bottomrule/g, '\\hline')
    .split(/\\\\/)
    .map((r) => r.trim())
    .filter(Boolean);

  let html = '<div class="overflow-x-auto my-5"><table class="w-auto min-w-[60%] mx-auto text-[0.94em] border-collapse">';
  let headerRendered = false;

  for (let idx = 0; idx < rawRows.length; idx++) {
    let row = rawRows[idx];
    const hasTopHline = row.includes('\\hline');
    row = row.replace(/\\hline/g, '').trim();
    if (!row) continue;

    const cells = row.split('&').map((c) => c.trim());
    const isHeader = !headerRendered && (idx === 0 || hasTopHline);
    if (isHeader) headerRendered = true;

    html += `<tr class="border-b border-black/15 dark:border-white/15 ${idx === 0 ? 'border-t-2 border-t-current' : ''}">`;
    cells.forEach((cell, colIdx) => {
      const align = alignments[colIdx] || 'left';
      const tag = isHeader ? 'th' : 'td';
      html += `<${tag} class="px-4 py-2 text-${align} ${isHeader ? 'font-semibold' : ''}">${renderInline(cell, ctx)}</${tag}>`;
    });
    html += '</tr>';
  }

  html += '</table></div>';
  return html;
}

function renderList(body: string, ordered: boolean, isDescription: boolean, ctx: RenderContext): string {
  // Split at top-level \item occurrences
  const items: Array<{ label?: string; content: string }> = [];
  const itemRegex = /\\item\b/g;
  const indices: number[] = [];
  let depth = 0;

  for (let i = 0; i < body.length; i++) {
    if (body.startsWith('\\begin{', i)) depth++;
    else if (body.startsWith('\\end{', i)) depth = Math.max(0, depth - 1);
    else if (depth === 0 && body.startsWith('\\item', i) && !/[a-zA-Z]/.test(body[i + 5] || '')) {
      indices.push(i);
    }
  }

  if (indices.length === 0) {
    return renderBlock(body, ctx);
  }

  for (let k = 0; k < indices.length; k++) {
    const start = indices[k] + 5;
    const end = k + 1 < indices.length ? indices[k + 1] : body.length;
    let slice = body.slice(start, end).trim();
    let label: string | undefined;
    if (slice.startsWith('[')) {
      const opt = readBracketArg(slice, 0);
      if (opt) {
        label = opt.value;
        slice = slice.slice(opt.nextIdx).trim();
      }
    }
    items.push({ label, content: slice });
  }
  void itemRegex;

  if (isDescription) {
    return `<dl class="my-3 space-y-2">${items
      .map(
        (it) =>
          `<div><dt class="inline font-semibold mr-2">${renderInline(it.label || '', ctx)}</dt><dd class="inline">${renderBlock(it.content, ctx, true)}</dd></div>`
      )
      .join('')}</dl>`;
  }

  const tag = ordered ? 'ol' : 'ul';
  return `<${tag} class="my-3 space-y-1.5">${items
    .map((it) => `<li>${renderBlock(it.content, ctx, true)}</li>`)
    .join('')}</${tag}>`;
}

const MATH_ENVIRONMENTS = new Set([
  'equation',
  'equation*',
  'align',
  'align*',
  'gather',
  'gather*',
  'multline',
  'multline*',
  'flalign',
  'flalign*',
  'alignat',
  'alignat*',
  'eqnarray',
  'eqnarray*',
]);

const THEOREM_TITLES: Record<string, string> = {
  theorem: 'Theorem',
  lemma: 'Lemma',
  proposition: 'Proposition',
  corollary: 'Corollary',
  definition: 'Definition',
  remark: 'Remark',
  example: 'Example',
};

function findMatchingEndEnv(source: string, envName: string, searchFrom: number): number {
  const openTag = `\\begin{${envName}}`;
  const closeTag = `\\end{${envName}}`;
  let depth = 1;
  let i = searchFrom;

  while (i < source.length) {
    const nextOpen = source.indexOf(openTag, i);
    const nextClose = source.indexOf(closeTag, i);
    if (nextClose === -1) return -1;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      i = nextOpen + openTag.length;
    } else {
      depth--;
      if (depth === 0) return nextClose;
      i = nextClose + closeTag.length;
    }
  }
  return -1;
}

function preScanLabels(body: string, ctx: RenderContext): void {
  const lines = body.split('\n');
  let sec1 = 0;
  let sec2 = 0;
  let sec3 = 0;
  let eq = 0;
  let lastNum = '1';

  for (const line of lines) {
    const secMatch = line.match(/\\(section|subsection|subsubsection)(?!\*)\s*\{/);
    if (secMatch) {
      if (secMatch[1] === 'section') {
        sec1++;
        sec2 = 0;
        sec3 = 0;
        lastNum = `${sec1}`;
      } else if (secMatch[1] === 'subsection') {
        sec2++;
        sec3 = 0;
        lastNum = `${sec1}.${sec2}`;
      } else {
        sec3++;
        lastNum = `${sec1}.${sec2}.${sec3}`;
      }
    }
    if (/\\begin\{(equation|align|gather|multline)\}/.test(line)) {
      eq++;
      lastNum = `${eq}`;
    }
    const lblMatch = line.match(/\\label\{([^}]+)\}/);
    if (lblMatch) {
      ctx.labels.set(lblMatch[1].trim(), lastNum);
    }
  }
}

function renderBlock(body: string, ctx: RenderContext, inlineSingleParagraph = false): string {
  const chunks: string[] = [];
  let cursor = 0;

  while (cursor < body.length) {
    // Check for \begin{...}
    const envMatch = body.slice(cursor).match(/^\\begin\{([a-zA-Z0-9*]+)\}/);
    if (envMatch) {
      const envName = envMatch[1];
      const innerStart = cursor + envMatch[0].length;
      const closeIdx = findMatchingEndEnv(body, envName, innerStart);

      if (closeIdx !== -1) {
        const innerRaw = body.slice(innerStart, closeIdx);
        cursor = closeIdx + `\\end{${envName}}`.length;

        if (MATH_ENVIRONMENTS.has(envName)) {
          const isStarred = envName.endsWith('*');
          const labelMatch = innerRaw.match(/\\label\{([^}]+)\}/);
          const cleanedMath = innerRaw.replace(/\\label\{[^}]+\}/g, '').trim();
          const katexEnv = envName.replace('*', '');
          const wrapped =
            katexEnv === 'equation'
              ? cleanedMath
              : `\\begin{${katexEnv === 'align' || katexEnv === 'flalign' || katexEnv === 'alignat' ? 'aligned' : katexEnv === 'gather' ? 'gathered' : katexEnv}}${cleanedMath}\\end{${katexEnv === 'align' || katexEnv === 'flalign' || katexEnv === 'alignat' ? 'aligned' : katexEnv === 'gather' ? 'gathered' : katexEnv}}`;

          let eqNumberHtml = '';
          if (!isStarred && ctx.equationNumbering) {
            ctx.equationCounter++;
            const num = ctx.equationCounter;
            if (labelMatch) {
              ctx.labels.set(labelMatch[1].trim(), `${num}`);
            }
            const anchorId = labelMatch ? ` id="label-${escapeHtml(labelMatch[1].trim())}"` : '';
            eqNumberHtml = `<span${anchorId} class="text-xs font-mono tabular-nums opacity-65 select-none shrink-0 ml-4">(${num})</span>`;
          }

          const mathHtml = renderKatexSafe(wrapped, true, ctx.macros, ctx.diagnostics);
          chunks.push(
            `<div class="flex items-center justify-between gap-4 my-4"><div class="flex-1 min-w-0 overflow-x-auto">${mathHtml}</div>${eqNumberHtml}</div>`
          );
          continue;
        }

        if (envName === 'abstract') {
          chunks.push(
            `<section class="my-6 px-6 py-4 rounded-lg border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02]"><div class="text-center text-xs font-semibold tracking-wider uppercase opacity-70 mb-2">Abstract</div><div class="text-[0.94em] leading-relaxed">${renderBlock(innerRaw.trim(), ctx)}</div></section>`
          );
          continue;
        }

        if (envName === 'itemize' || envName === 'enumerate' || envName === 'description') {
          chunks.push(
            renderList(innerRaw, envName === 'enumerate', envName === 'description', ctx)
          );
          continue;
        }

        if (envName === 'tabular') {
          chunks.push(renderTabular(innerRaw, ctx));
          continue;
        }

        if (envName === 'table' || envName === 'figure') {
          let inner = innerRaw;
          const capMatch = inner.match(/\\caption\{/);
          let captionHtml = '';
          if (capMatch && capMatch.index !== undefined) {
            const capArg = readBraceArg(inner, capMatch.index + capMatch[0].length - 1);
            if (capArg) {
              captionHtml = `<figcaption class="mt-2.5 text-center text-[0.88em] opacity-80">${renderInline(capArg.value, ctx)}</figcaption>`;
              inner = inner.slice(0, capMatch.index) + inner.slice(capArg.nextIdx);
            }
          }
          inner = inner.replace(/\\centering/g, '');
          if (envName === 'figure' && /\\includegraphics/.test(inner)) {
            inner = inner.replace(
              /\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/g,
              '<div class="mx-auto my-3 max-w-md rounded border border-dashed border-black/25 dark:border-white/25 p-6 text-center text-xs font-mono opacity-75">Figure Asset: $1</div>'
            );
          }
          chunks.push(`<figure class="my-6">${renderBlock(inner.trim(), ctx)}${captionHtml}</figure>`);
          continue;
        }

        if (envName === 'center') {
          chunks.push(`<div class="text-center my-4">${renderBlock(innerRaw.trim(), ctx)}</div>`);
          continue;
        }
        if (envName === 'flushleft') {
          chunks.push(`<div class="text-left my-4">${renderBlock(innerRaw.trim(), ctx)}</div>`);
          continue;
        }
        if (envName === 'flushright') {
          chunks.push(`<div class="text-right my-4">${renderBlock(innerRaw.trim(), ctx)}</div>`);
          continue;
        }

        if (envName === 'quote' || envName === 'quotation' || envName === 'verse') {
          chunks.push(
            `<blockquote class="my-4 px-5 py-3 rounded-md bg-black/[0.03] dark:bg-white/[0.03] border border-black/10 dark:border-white/10 italic">${renderBlock(innerRaw.trim(), ctx)}</blockquote>`
          );
          continue;
        }

        if (envName === 'verbatim' || envName === 'lstlisting' || envName === 'minted') {
          chunks.push(
            `<pre class="my-4 p-4 rounded-md bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 font-mono text-[0.86em] overflow-x-auto leading-relaxed"><code>${escapeHtml(innerRaw.replace(/^\n/, ''))}</code></pre>`
          );
          continue;
        }

        if (THEOREM_TITLES[envName]) {
          let trimmed = innerRaw.trim();
          let subtitle = '';
          if (trimmed.startsWith('[')) {
            const opt = readBracketArg(trimmed, 0);
            if (opt) {
              subtitle = ` (${renderInline(opt.value, ctx)})`;
              trimmed = trimmed.slice(opt.nextIdx).trim();
            }
          }
          ctx.theoremCounters[envName] = (ctx.theoremCounters[envName] || 0) + 1;
          const num = ctx.theoremCounters[envName];
          chunks.push(
            `<div class="my-5 px-4 py-3.5 rounded-lg border border-black/12 dark:border-white/12 bg-black/[0.02] dark:bg-white/[0.025]"><div class="font-semibold mb-1.5">${THEOREM_TITLES[envName]} ${num}${subtitle}.</div><div class="${envName === 'definition' || envName === 'remark' || envName === 'example' ? '' : 'italic'}">${renderBlock(trimmed, ctx)}</div></div>`
          );
          continue;
        }

        if (envName === 'proof') {
          let trimmed = innerRaw.trim();
          let title = 'Proof';
          if (trimmed.startsWith('[')) {
            const opt = readBracketArg(trimmed, 0);
            if (opt) {
              title = renderInline(opt.value, ctx);
              trimmed = trimmed.slice(opt.nextIdx).trim();
            }
          }
          chunks.push(
            `<div class="my-4"><span class="italic font-semibold mr-1.5">${title}. </span>${renderBlock(trimmed, ctx, true)} <span class="inline-block ml-2 float-right font-mono select-none" aria-label="QED">□</span><div class="clear-both"></div></div>`
          );
          continue;
        }

        if (envName === 'thebibliography') {
          const entries = innerRaw.split(/\\bibitem(?:\[[^\]]*\])?\{([^}]+)\}/).slice(1);
          let bibHtml = '<section class="mt-8 pt-4 border-t border-black/15 dark:border-white/15"><h2 class="text-lg font-bold mb-3">References</h2><ol class="space-y-1.5 text-[0.92em]">';
          for (let b = 0; b < entries.length; b += 2) {
            const key = entries[b];
            const text = entries[b + 1] || '';
            if (!ctx.citations.has(key)) {
              ctx.citations.set(key, ctx.citations.size + 1);
            }
            bibHtml += `<li>${renderInline(text.trim(), ctx)}</li>`;
          }
          bibHtml += '</ol></section>';
          chunks.push(bibHtml);
          continue;
        }

        // Generic fallback environment
        chunks.push(`<div>${renderBlock(innerRaw.trim(), ctx)}</div>`);
        continue;
      }
    }

    // Check for display math $$ ... $$ at block level
    if (body.startsWith('$$', cursor)) {
      const closeIdx = body.indexOf('$$', cursor + 2);
      if (closeIdx !== -1) {
        const math = body.slice(cursor + 2, closeIdx);
        chunks.push(
          `<div class="my-4 overflow-x-auto">${renderKatexSafe(math, true, ctx.macros, ctx.diagnostics)}</div>`
        );
        cursor = closeIdx + 2;
        continue;
      }
    }

    // Check for display math \[ ... \] at block level
    if (body.startsWith('\\[', cursor)) {
      const closeIdx = body.indexOf('\\]', cursor + 2);
      if (closeIdx !== -1) {
        const math = body.slice(cursor + 2, closeIdx);
        chunks.push(
          `<div class="my-4 overflow-x-auto">${renderKatexSafe(math, true, ctx.macros, ctx.diagnostics)}</div>`
        );
        cursor = closeIdx + 2;
        continue;
      }
    }

    // Check for section headings
    const secMatch = body.slice(cursor).match(/^\\(section|subsection|subsubsection|paragraph)(\*?)\s*\{/);
    if (secMatch) {
      const type = secMatch[1];
      const starred = secMatch[2] === '*';
      const braceStart = cursor + secMatch[0].length - 1;
      const arg = readBraceArg(body, braceStart);
      if (arg) {
        cursor = arg.nextIdx;
        let numLabel = '';
        let level = 1;
        if (!starred) {
          if (type === 'section') {
            ctx.sectionCounters[0]++;
            ctx.sectionCounters[1] = 0;
            ctx.sectionCounters[2] = 0;
            numLabel = `${ctx.sectionCounters[0]}`;
            level = 1;
          } else if (type === 'subsection') {
            ctx.sectionCounters[1]++;
            ctx.sectionCounters[2] = 0;
            numLabel = `${ctx.sectionCounters[0]}.${ctx.sectionCounters[1]}`;
            level = 2;
          } else if (type === 'subsubsection') {
            ctx.sectionCounters[2]++;
            numLabel = `${ctx.sectionCounters[0]}.${ctx.sectionCounters[1]}.${ctx.sectionCounters[2]}`;
            level = 3;
          } else {
            level = 4;
          }
        } else {
          level = type === 'section' ? 1 : type === 'subsection' ? 2 : 3;
        }

        const headingId = `sec-${ctx.outline.length + 1}`;
        const plainTitle = cleanPlainTitle(arg.value);
        if (level <= 3) {
          ctx.outline.push({
            id: headingId,
            level,
            title: plainTitle,
            numberLabel: numLabel,
            line: body.slice(0, cursor).split('\n').length,
          });
        }

        const renderedTitle = renderInline(arg.value, ctx);
        const prefix = numLabel ? `<span class="mr-2 tabular-nums opacity-75">${numLabel} </span>` : '';

        if (type === 'section') {
          chunks.push(
            `<h2 id="${headingId}" class="text-[1.4em] font-bold mt-8 mb-3 pb-1 border-b border-black/10 dark:border-white/10">${prefix}${renderedTitle}</h2>`
          );
        } else if (type === 'subsection') {
          chunks.push(`<h3 id="${headingId}" class="text-[1.18em] font-semibold mt-6 mb-2">${prefix}${renderedTitle}</h3>`);
        } else if (type === 'subsubsection') {
          chunks.push(`<h4 id="${headingId}" class="text-[1.04em] font-semibold mt-4 mb-1.5">${prefix}${renderedTitle}</h4>`);
        } else {
          chunks.push(`<p class="mt-3"><strong class="mr-2">${renderedTitle}</strong></p>`);
        }
        continue;
      }
    }

    // Special block commands
    if (body.startsWith('\\maketitle', cursor)) {
      cursor += '\\maketitle'.length;
      chunks.push('__SCRIBETEX_MAKETITLE__');
      continue;
    }
    if (body.startsWith('\\tableofcontents', cursor)) {
      cursor += '\\tableofcontents'.length;
      chunks.push('__SCRIBETEX_TOC__');
      continue;
    }
    if (body.startsWith('\\newpage', cursor) || body.startsWith('\\clearpage', cursor)) {
      const len = body.startsWith('\\newpage', cursor) ? '\\newpage'.length : '\\clearpage'.length;
      cursor += len;
      chunks.push(
        '<div class="my-8 flex items-center gap-3 select-none opacity-45"><div class="flex-1 border-t border-dashed border-current"></div><span class="text-[11px] font-mono uppercase tracking-wider">Page Break</span><div class="flex-1 border-t border-dashed border-current"></div></div>'
      );
      continue;
    }
    if (body.startsWith('\\hrule', cursor)) {
      cursor += '\\hrule'.length;
      chunks.push('<hr class="my-5 border-black/15 dark:border-white/15" />');
      continue;
    }

    // Consume plain text until next block token or blank line
    let nextToken = body.length;
    const candidates = [
      body.indexOf('\\begin{', cursor + 1),
      body.indexOf('$$', cursor + 1),
      body.indexOf('\\[', cursor + 1),
      body.indexOf('\\section', cursor + 1),
      body.indexOf('\\subsection', cursor + 1),
      body.indexOf('\\subsubsection', cursor + 1),
      body.indexOf('\\paragraph', cursor + 1),
      body.indexOf('\\maketitle', cursor + 1),
      body.indexOf('\\tableofcontents', cursor + 1),
      body.indexOf('\\newpage', cursor + 1),
      body.indexOf('\\clearpage', cursor + 1),
      body.indexOf('\\hrule', cursor + 1),
    ].filter((idx) => idx !== -1);

    if (candidates.length > 0) {
      nextToken = Math.min(...candidates);
    }

    const segment = body.slice(cursor, nextToken);
    cursor = nextToken;

    const paragraphs = segment.split(/\n\s*\n/);
    for (const para of paragraphs) {
      const trimmed = para.trim();
      if (!trimmed) continue;
      // Ignore stray preamble-like commands if no \begin{document} was used
      if (
        /^\\(documentclass|usepackage|newcommand|renewcommand|DeclareMathOperator|title|author|date|pagestyle)\b/.test(
          trimmed
        )
      ) {
        continue;
      }
      const rendered = renderInline(trimmed, ctx);
      if (rendered.trim()) {
        if (inlineSingleParagraph && paragraphs.length === 1) {
          chunks.push(rendered);
        } else {
          chunks.push(`<p class="my-2.5">${rendered}</p>`);
        }
      }
    }
  }

  return chunks.join('\n');
}

export function parseLatexDocument(
  rawSource: string,
  options: ParseOptions = {}
): ParsedLaTeXResult {
  const cleanSource = stripComments(rawSource);
  const preamble = extractPreamble(cleanSource);
  const body = cleanSource.slice(preamble.bodyStartIndex, preamble.bodyEndIndex);

  const ctx: RenderContext = {
    macros: preamble.macros,
    diagnostics: [],
    labels: new Map(),
    citations: new Map(),
    footnotes: [],
    outline: [],
    sectionCounters: [0, 0, 0],
    equationCounter: 0,
    theoremCounters: {},
    equationNumbering: options.equationNumbering ?? true,
  };

  preScanLabels(body, ctx);

  let html = renderBlock(body, ctx);

  // Inject \maketitle
  const titleHtml = preamble.title
    ? `<header class="text-center mb-8 pb-6 border-b border-black/10 dark:border-white/10">
        <h1 class="text-[1.9em] font-bold tracking-tight leading-tight">${renderInline(preamble.title, ctx)}</h1>
        ${preamble.author ? `<div class="mt-2.5 text-[1.02em] opacity-85">${renderInline(preamble.author, ctx)}</div>` : ''}
        ${preamble.date ? `<div class="mt-1 text-[0.9em] opacity-65">${renderInline(preamble.date, ctx)}</div>` : ''}
      </header>`
    : '';

  html = html.replace('__SCRIBETEX_MAKETITLE__', titleHtml);

  // Inject \tableofcontents
  const tocHtml =
    ctx.outline.length > 0
      ? `<nav aria-label="Table of contents" class="my-6 p-4 rounded-lg border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02]">
          <div class="font-bold text-[1.05em] mb-2.5">Contents</div>
          <ul class="space-y-1 text-[0.92em] !list-none !pl-0 !my-0">
            ${ctx.outline
              .map(
                (item) =>
                  `<li style="padding-left: ${(item.level - 1) * 1.15}rem">
                    <a href="#${item.id}" class="hover:underline flex items-baseline gap-2">
                      ${item.numberLabel ? `<span class="tabular-nums opacity-65 font-mono text-[0.88em]">${item.numberLabel}</span>` : ''}
                      <span>${escapeHtml(item.title)}</span>
                    </a>
                  </li>`
              )
              .join('')}
          </ul>
        </nav>`
      : '';

  html = html.replace('__SCRIBETEX_TOC__', tocHtml);

  // Append footnotes if present
  if (ctx.footnotes.length > 0) {
    html += `<footer class="mt-10 pt-4 border-t border-black/15 dark:border-white/15 text-[0.85em] space-y-1 opacity-85">
      ${ctx.footnotes
        .map((fn, idx) => `<div><sup class="font-semibold mr-1">[${idx + 1}]</sup>${fn}</div>`)
        .join('')}
    </footer>`;
  }

  // Word count from plain prose
  const plainText = body
    .replace(/\\[a-zA-Z]+\*?(?:\[[^\]]*\])?(?:\{[^}]*\})?/g, ' ')
    .replace(/[$\\{}[\]%]/g, ' ')
    .trim();
  const wordCount = plainText ? plainText.split(/\s+/).filter(Boolean).length : 0;

  return {
    html,
    outline: ctx.outline,
    diagnostics: ctx.diagnostics,
    wordCount,
    equationCount: ctx.equationCounter,
    title: cleanPlainTitle(preamble.title) || 'Untitled Document',
    author: cleanPlainTitle(preamble.author),
    date: preamble.date,
  };
}
