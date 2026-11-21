import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildVisibleSourceIndex,
  extractRawHeaderFields,
  insertAtHeaderField,
  resolveBlockContainerSlice,
  resolveMathTokenByLeafIndex,
  resolveProseScopedSlice,
  resolveVisibleSourceOffset,
  resolveVisibleTextOffset,
} from './graphicalPlacement';
import { insertAtLatexOffset } from './insertionSlots';

test('resolveVisibleTextOffset maps plain prose and formatting wrappers accurately', () => {
  const latex = 'Consider \\textbf{spectral} methods for \\emph{fast} convergence.';
  // Visible string: "Consider spectral methods for fast convergence."
  // Position 13 is inside \textbf{spec|tral}
  const offMidBold = resolveVisibleTextOffset(latex, 0, latex.length, 13);
  assert.equal(latex.slice(offMidBold, offMidBold + 4), 'tral');

  // Position 17 is right after \textbf{spectral} (before " methods")
  const offAfterBold = resolveVisibleTextOffset(latex, 0, latex.length, 17);
  const inserted = insertAtLatexOffset(latex, offAfterBold, 'paragraph', '\\alpha', true);
  assert.equal(
    inserted.nextLatex,
    'Consider \\textbf{spectral} $\\alpha$ methods for \\emph{fast} convergence.'
  );

  // Position 30 is after "Consider spectral methods for " (at start of \emph{fast})
  const offStartFast = resolveVisibleTextOffset(latex, 0, latex.length, 30);
  assert.equal(latex.slice(offStartFast, offStartFast + 4), 'fast');
});

test('resolveVisibleTextOffset disambiguates before vs after inline math and escaped characters', () => {
  const latex = 'Price is 50\\% when $x = 1$ holds.';
  // Visible: "Price is 50% when " -> 18 chars before $x = 1$
  const idx = buildVisibleSourceIndex(latex, 0, latex.length);
  assert.equal(idx.maths.length, 1);
  assert.equal(latex.slice(idx.maths[0].bodyStart, idx.maths[0].bodyEnd), 'x = 1');

  const beforeMath = resolveVisibleSourceOffset(idx, 18, 0, 0);
  const afterMath = resolveVisibleSourceOffset(idx, 18, 1, 0);
  assert.equal(latex.slice(beforeMath, beforeMath + 7), '$x = 1$');
  assert.equal(latex.slice(afterMath), ' holds.');

  // After " holds" (visible offset 18 + 6 = 24)
  const beforePeriod = resolveVisibleSourceOffset(idx, 24, 1, 0);
  assert.equal(latex[beforePeriod], '.');
});

test('resolveVisibleTextOffset tracks atomic macros without drifting subsequent text offsets', () => {
  const latex = 'As shown in \\cite{smith2024}, \\LaTeX{} scales well.';
  const idx = buildVisibleSourceIndex(latex, 0, latex.length);
  assert.equal(idx.atoms.length, 2);
  // Visible text excluding atoms is: "As shown in , {} scales well."
  // Before ',' is 12 visible chars (with 1 atom before: \cite{smith2024})
  const beforeCite = resolveVisibleSourceOffset(idx, 12, 0, 0);
  const afterCite = resolveVisibleSourceOffset(idx, 12, 0, 1);
  assert.equal(latex.slice(beforeCite, beforeCite + 5), '\\cite');
  assert.equal(latex[afterCite], ',');

  // Right after "scales" (visible: "As shown in " (12) + ", " (2) + "{}" (2) + " scales" (7) = 23)
  const afterScales = resolveVisibleSourceOffset(idx, 23, 0, 2);
  assert.equal(latex.slice(afterScales), ' well.');
});

test('insertAtHeaderField inserts at exact mid-string offset inside title, author, and date', () => {
  const tex = `\\documentclass{article}
\\title{Neural Scaling Laws}
\\author{Research Lab}
\\date{May 2026}
\\begin{document}
\\maketitle
\\end{document}`;

  const fields = extractRawHeaderFields(tex);
  assert.equal(fields.title, 'Neural Scaling Laws');
  assert.equal(fields.author, 'Research Lab');
  assert.equal(fields.date, 'May 2026');

  const { nextSource, nextFieldOffset } = insertAtHeaderField(
    tex,
    'title',
    6, // Right after "Neural"
    '\\alpha',
    true
  );
  assert.match(nextSource, /\\title\{Neural \$\\alpha\$ Scaling Laws\}/);
  assert.ok(nextFieldOffset > 6);
});

test('resolveBlockContainerSlice locates exact editable bounds for headings, list items, tables, and proofs', () => {
  const headingLatex = '\\subsection{Spectral Convergence}';
  const hSlice = resolveBlockContainerSlice(headingLatex, 'heading', 'heading');
  assert.equal(headingLatex.slice(hSlice.start, hSlice.end), 'Spectral Convergence');

  const listLatex = '\\begin{enumerate}\n  \\item First condition\n  \\item Second condition\n\\end{enumerate}';
  const li2 = resolveBlockContainerSlice(listLatex, 'environment', 'list-item', 1);
  assert.equal(listLatex.slice(li2.start, li2.end), 'Second condition');

  const tableLatex = '\\begin{tabular}{l r}\n\\hline\nMetric & Score \\\\\n\\hline\nLoss & 0.04 \\\\\n\\hline\n\\end{tabular}';
  const cellR1C1 = resolveBlockContainerSlice(tableLatex, 'environment', 'table-cell', 1, 1);
  assert.equal(tableLatex.slice(cellR1C1.start, cellR1C1.end), '0.04');

  const proofLatex = '\\begin{proof}[Proof of Lemma 1]\nBy induction on $n$.\n\\end{proof}';
  const proofBody = resolveBlockContainerSlice(proofLatex, 'environment', 'block');
  assert.equal(proofLatex.slice(proofBody.start, proofBody.end), 'By induction on $n$.');
});

test('resolveProseScopedSlice selects ONLY clicked word, short formatted tag, or atomic citation', () => {
  const latex =
    'Every real matrix $A \\in \\mathbb{R}^{m \\times n}$ admits a \\textbf{singular} factorization \\cite{golub2013}.';

  // Double-clicking inside "factorization"
  const factHit = latex.indexOf('factorization') + 4;
  const wordScope = resolveProseScopedSlice(latex, 0, latex.length, factHit, 'Paragraph text');
  assert.equal(wordScope.code, 'factorization');
  assert.equal(wordScope.label, 'Selected Word');
  assert.ok(wordScope.parentScope);

  // Double-clicking inside "\textbf{singular}" selects that short formatted word command
  const boldHit = latex.indexOf('singular') + 2;
  const boldScope = resolveProseScopedSlice(latex, 0, latex.length, boldHit, 'Paragraph text');
  assert.equal(boldScope.code, '\\textbf{singular}');

  // Double-clicking inside "\cite{golub2013}" selects only that citation command
  const citeHit = latex.indexOf('\\cite') + 2;
  const citeScope = resolveProseScopedSlice(latex, 0, latex.length, citeHit, 'Paragraph text');
  assert.equal(citeScope.code, '\\cite{golub2013}');
});

test('resolveMathTokenByLeafIndex isolates clicked math term with visual glyph weights', () => {
  const latex = 'A \\in \\mathbb{R}^{m \\times n}';
  // Total leaves ~ 6: A (0), \in (1), R (2), m (3), \times (4), n (5)
  const first = resolveMathTokenByLeafIndex(latex, 0, latex.length, 0, 6);
  assert.equal(first?.code, 'A');

  const rel = resolveMathTokenByLeafIndex(latex, 0, latex.length, 1, 6);
  assert.equal(rel?.code, '\\in');

  const field = resolveMathTokenByLeafIndex(latex, 0, latex.length, 4, 6);
  assert.equal(field?.code, '\\mathbb{R}^{m \\times n}');
});

