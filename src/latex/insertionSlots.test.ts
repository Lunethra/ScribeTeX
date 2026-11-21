import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendColumnToStructuredRegion,
  appendRowToStructuredRegion,
  extractBlockPlacementModel,
  extractStructuredRegions,
  extractSubPartSlots,
  insertAtLatexOffset,
  isOffsetInMathMode,
  tokenizeForInsertion,
} from './insertionSlots';

test('extractStructuredRegions parses matrix cells and supports inserting into a specific cell', () => {
  const latex = `\\[\n\\begin{pmatrix}\n  1 & 0 \\\\\n  0 & 1\n\\end{pmatrix}\n\\]`;
  const regions = extractStructuredRegions(latex);
  assert.equal(regions.length, 1);
  assert.equal(regions[0].kind, 'matrix');
  assert.equal(regions[0].rowCount, 2);
  assert.equal(regions[0].columnCount, 2);
  assert.equal(regions[0].cells.length, 4);
  assert.deepEqual(
    regions[0].cells.map((c) => c.text),
    ['1', '0', '0', '1']
  );

  // Place \alpha inside cell (R1, C2) -> second cell
  const cellR1C2 = regions[0].cells[1];
  const { nextLatex } = insertAtLatexOffset(latex, cellR1C2.trimEndOffset, 'math', '\\alpha', true);
  assert.match(nextLatex, /1 & 0 \\alpha \\\\/);
});

test('extractStructuredRegions parses piecewise cases branches (value and condition)', () => {
  const latex = `\\[\nf(x) = \\begin{cases}\n  x^2, & x \\ge 0 \\\\\n  -x, & x < 0\n\\end{cases}\n\\]`;
  const regions = extractStructuredRegions(latex);
  assert.equal(regions.length, 1);
  assert.equal(regions[0].kind, 'cases');
  assert.equal(regions[0].cells.length, 4);
  assert.equal(regions[0].cells[0].label, 'Branch 1 value');
  assert.equal(regions[0].cells[1].label, 'Branch 1 condition');
  assert.equal(regions[0].cells[2].text, '-x,');
  assert.equal(regions[0].cells[3].text, 'x < 0');

  // Insert into Branch 2 condition
  const { nextLatex } = insertAtLatexOffset(
    latex,
    regions[0].cells[3].trimStartOffset,
    'math',
    '\\theta \\le ',
    true
  );
  assert.match(nextLatex, /\\theta \\le x < 0/);
});

test('extractStructuredRegions parses tables, aligned equations, and lists', () => {
  const tableLatex = `\\begin{tabular}{l c}\n  A & B \\\\\n  C & D\n\\end{tabular}`;
  const tableRegions = extractStructuredRegions(tableLatex);
  assert.equal(tableRegions[0].kind, 'table');
  assert.equal(tableRegions[0].cells.length, 4);

  const alignLatex = `\\begin{align}\n  a &= b \\\\\n  c &= d\n\\end{align}`;
  const alignRegions = extractStructuredRegions(alignLatex);
  assert.equal(alignRegions[0].kind, 'align');
  assert.equal(alignRegions[0].cells.length, 4);

  const listLatex = `\\begin{itemize}\n  \\item First\n  \\item Second\n\\end{itemize}`;
  const listRegions = extractStructuredRegions(listLatex);
  assert.equal(listRegions[0].kind, 'list');
  assert.deepEqual(
    listRegions[0].cells.map((c) => c.text),
    ['First', 'Second']
  );
});

test('extractSubPartSlots finds fraction, binomial, root, subscript, and superscript slots', () => {
  const latex = `\\[ \\frac{a}{b} + \\sqrt[3]{x} + \\sum_{i=1}^{n} i \\]`;
  const slots = extractSubPartSlots(latex);
  const labels = slots.map((s) => `${s.label}:${s.text}`);
  assert.ok(labels.includes('Numerator:a'));
  assert.ok(labels.includes('Denominator:b'));
  assert.ok(labels.includes('Root index:3'));
  assert.ok(labels.includes('Inside √:x'));
  assert.ok(labels.includes('Lower / Subscript:i=1'));
  assert.ok(labels.includes('Upper / Power:n'));
});

test('tokenizeForInsertion creates gaps between arbitrary elements and inserts cleanly', () => {
  const latex = `\\[ a + b = c \\]`;
  const model = extractBlockPlacementModel(latex, 'math');
  assert.deepEqual(
    model.bodyStrip.tokens.map((t) => t.text),
    ['a', '+', 'b', '=', 'c']
  );
  const gapBetweenAAndPlus = model.bodyStrip.gaps.find((g) => g.label === 'Between a and +');
  assert.ok(gapBetweenAAndPlus);

  const { nextLatex } = insertAtLatexOffset(
    latex,
    gapBetweenAAndPlus.offset,
    'math',
    '\\alpha',
    true
  );
  assert.equal(nextLatex, `\\[ a \\alpha + b = c \\]`);
});

test('insertAtLatexOffset auto-wraps math inside prose/headings and preserves $0 caret for chained clicks', () => {
  const heading = `\\section{Wave Equation}`;
  const strip = tokenizeForInsertion(heading, 9, heading.length - 1);
  const gapBetweenWords = strip.gaps.find((g) => g.label === 'Between Wave and Equation');
  assert.ok(gapBetweenWords);
  assert.equal(isOffsetInMathMode(heading, gapBetweenWords.offset, 'heading'), false);

  const proseInsert = insertAtLatexOffset(
    heading,
    gapBetweenWords.offset,
    'heading',
    '\\lambda',
    true
  );
  assert.equal(proseInsert.nextLatex, `\\section{Wave $\\lambda$ Equation}`);

  // Chained click inside \frac{$0}{}
  const eq = `\\[ x =  \\]`;
  const step1 = insertAtLatexOffset(eq, 7, 'math', '\\frac{$0}{}', true);
  assert.equal(step1.nextLatex, `\\[ x = \\frac{}{} \\]`);
  const step2 = insertAtLatexOffset(step1.nextLatex, step1.nextOffset, 'math', '\\alpha', true);
  assert.equal(step2.nextLatex, `\\[ x = \\frac{\\alpha}{} \\]`);
});

test('appendRowToStructuredRegion and appendColumnToStructuredRegion extend matrices, cases, and lists', () => {
  const mat = `\\[\n\\begin{pmatrix}\n  1 & 2 \\\\\n  3 & 4\n\\end{pmatrix}\n\\]`;
  const region = extractStructuredRegions(mat)[0];

  const withRow = appendRowToStructuredRegion(mat, region);
  const withRowRegion = extractStructuredRegions(withRow)[0];
  assert.equal(withRowRegion.rowCount, 3);
  assert.equal(withRowRegion.columnCount, 2);

  const withCol = appendColumnToStructuredRegion(mat, region);
  const withColRegion = extractStructuredRegions(withCol)[0];
  assert.equal(withColRegion.rowCount, 2);
  assert.equal(withColRegion.columnCount, 3);

  const cases = `\\[\nf(x) = \\begin{cases}\n  x, & x \\ge 0\n\\end{cases}\n\\]`;
  const withBranch = appendRowToStructuredRegion(cases, extractStructuredRegions(cases)[0]);
  assert.equal(extractStructuredRegions(withBranch)[0].rowCount, 2);

  const list = `\\begin{itemize}\n  \\item One\n\\end{itemize}`;
  const withItem = appendRowToStructuredRegion(list, extractStructuredRegions(list)[0]);
  assert.equal(extractStructuredRegions(withItem)[0].rowCount, 2);
});
