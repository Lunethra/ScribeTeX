import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SYMBOL_CATEGORY_ORDER,
  LATEX_SYMBOLS,
  SYMBOL_CATEGORIES,
  normalizeCategoryOrder,
  reorderCategoryOrder,
} from '../data/latexSymbols';
import { BLANK_DOCUMENT_CONTENT, DOCUMENT_TEMPLATES } from '../data/templates';
import { parseLatexDocument } from './parser';
import {
  appendSymbolToHeaderValue,
  findPreferredEditableBlockIndex,
  formatSymbolForPreviewInsertion,
  insertLatexAtPreviewSlot,
  insertSymbolIntoExistingBlock,
  isBlockCreatorSymbol,
  removePreviewBlock,
  replacePreviewBlock,
  swapPreviewBlocks,
  updateHeaderMetadata,
} from './previewMutations';

test('parseLatexDocument emits exact rawLatex slices for each top-level block', () => {
  const tex = `\\documentclass{article}
\\title{Test Paper}
\\author{Ada}
\\date{2026}

\\begin{document}
\\maketitle

\\section{Intro}

First paragraph here. % inline comment

\\begin{equation}
E = mc^2
\\end{equation}

\\end{document}`;

  const parsed = parseLatexDocument(tex);
  assert.equal(parsed.blocks.length, 4);
  assert.equal(parsed.blocks[0].kind, 'title');
  assert.equal(parsed.blocks[0].rawLatex, '\\maketitle');
  assert.equal(parsed.blocks[1].kind, 'heading');
  assert.equal(parsed.blocks[1].rawLatex, '\\section{Intro}');
  assert.equal(parsed.blocks[2].kind, 'paragraph');
  assert.match(parsed.blocks[2].rawLatex, /^First paragraph here\./);
  assert.equal(parsed.blocks[3].kind, 'math');
  assert.equal(parsed.blocks[3].rawLatex, '\\begin{equation}\nE = mc^2\n\\end{equation}');
});

test('formatSymbolForPreviewInsertion produces valid KaTeX/LaTeX starters for math and structure keys', () => {
  const frac = LATEX_SYMBOLS.find((s) => s.id === 'frac')!;
  const alpha = LATEX_SYMBOLS.find((s) => s.id === 'alpha')!;
  const sec = LATEX_SYMBOLS.find((s) => s.id === 'section')!;
  const bmatrix = LATEX_SYMBOLS.find((s) => s.id === 'bmatrix')!;

  assert.equal(formatSymbolForPreviewInsertion(frac), '\\[\n  \\frac{a}{b}\n\\]');
  assert.equal(formatSymbolForPreviewInsertion(alpha), '\\[\n  \\alpha\n\\]');
  assert.equal(formatSymbolForPreviewInsertion(sec), '\\section{New Section}');
  assert.match(formatSymbolForPreviewInsertion(bmatrix), /\\begin\{bmatrix\}/);
});

test('insertLatexAtPreviewSlot inserts at start, middle, and end cleanly', () => {
  const base = `\\documentclass{article}
\\begin{document}
\\section{One}

Alpha text.

\\end{document}`;

  const parsed = parseLatexDocument(base);
  assert.equal(parsed.blocks.length, 2);

  // Middle slot (between heading and paragraph)
  const insertedMid = insertLatexAtPreviewSlot(base, parsed.blocks, 1, '\\[\n  x^2\n\\]');
  const parsedMid = parseLatexDocument(insertedMid);
  assert.equal(parsedMid.blocks.length, 3);
  assert.equal(parsedMid.blocks[0].rawLatex, '\\section{One}');
  assert.equal(parsedMid.blocks[1].kind, 'math');
  assert.match(parsedMid.blocks[2].rawLatex, /Alpha text\./);

  // Append at end
  const insertedEnd = insertLatexAtPreviewSlot(base, parsed.blocks, parsed.blocks.length, '\\section{Two}');
  const parsedEnd = parseLatexDocument(insertedEnd);
  assert.equal(parsedEnd.blocks.length, 3);
  assert.equal(parsedEnd.blocks[2].rawLatex, '\\section{Two}');
  assert.ok(insertedEnd.includes('\\end{document}'));
});

test('insertLatexAtPreviewSlot works when document body has zero blocks and empty maketitle stays selectable', () => {
  const emptyBody = `\\documentclass{article}
\\begin{document}
\\end{document}`;
  const parsed = parseLatexDocument(emptyBody);
  assert.equal(parsed.blocks.length, 0);

  const next = insertLatexAtPreviewSlot(emptyBody, parsed.blocks, 0, '\\section{First}');
  const reparsed = parseLatexDocument(next);
  assert.equal(reparsed.blocks.length, 1);
  assert.equal(reparsed.blocks[0].rawLatex, '\\section{First}');

  const withEmptyHeader = `\\documentclass{article}
\\title{}
\\author{}
\\date{}
\\begin{document}
\\maketitle
\\section{}
\\end{document}`;
  const parsedHeader = parseLatexDocument(withEmptyHeader);
  assert.equal(parsedHeader.blocks.length, 2);
  assert.equal(parsedHeader.blocks[0].kind, 'title');
  assert.equal(parsedHeader.blocks[1].kind, 'heading');
});

test('insertSymbolIntoExistingBlock inserts math and inline elements directly into existing boxes without adding a new box', () => {
  const alpha = LATEX_SYMBOLS.find((s) => s.id === 'alpha')!;
  const beta = LATEX_SYMBOLS.find((s) => s.id === 'beta')!;
  const frac = LATEX_SYMBOLS.find((s) => s.id === 'frac')!;
  const sec = LATEX_SYMBOLS.find((s) => s.id === 'section')!;

  assert.equal(isBlockCreatorSymbol(alpha), false);
  assert.equal(isBlockCreatorSymbol(frac), false);
  assert.equal(isBlockCreatorSymbol(sec), true);

  const tex = `\\documentclass{article}
\\begin{document}
\\maketitle
\\section{}

\\[
  x
\\]

\\end{document}`;

  const parsed1 = parseLatexDocument(tex);
  assert.equal(parsed1.blocks.length, 3);
  assert.equal(findPreferredEditableBlockIndex(parsed1.blocks, null), 2);
  assert.equal(findPreferredEditableBlockIndex(parsed1.blocks, 1), 1);

  // Insert alpha directly into empty section -> stays 3 blocks!
  const afterHeadingInsert = insertSymbolIntoExistingBlock(tex, parsed1.blocks[1], alpha);
  const parsed2 = parseLatexDocument(afterHeadingInsert);
  assert.equal(parsed2.blocks.length, 3);
  assert.equal(parsed2.blocks[1].rawLatex, '\\section{$\\alpha$}');

  // Insert beta into same section -> merges cleanly into trailing inline math
  const afterHeadingSecond = insertSymbolIntoExistingBlock(afterHeadingInsert, parsed2.blocks[1], beta);
  const parsed3 = parseLatexDocument(afterHeadingSecond);
  assert.equal(parsed3.blocks.length, 3);
  assert.equal(parsed3.blocks[1].rawLatex, '\\section{$\\alpha \\beta$}');

  // Insert frac directly inside existing display math block -> stays 3 blocks!
  const afterMathInsert = insertSymbolIntoExistingBlock(afterHeadingSecond, parsed3.blocks[2], frac);
  const parsed4 = parseLatexDocument(afterMathInsert);
  assert.equal(parsed4.blocks.length, 3);
  assert.match(parsed4.blocks[2].rawLatex, /\\\[\s*x \\frac\{\}\{\}\s*\\\]/);
});

test('replacePreviewBlock, swapPreviewBlocks, and removePreviewBlock mutate document accurately', () => {
  const tex = `\\begin{document}
\\section{First}

\\[\n  a + b\n\\]

\\section{Second}
\\end{document}`;

  const parsed = parseLatexDocument(tex);
  assert.equal(parsed.blocks.length, 3);

  // Edit middle math block
  const edited = replacePreviewBlock(tex, parsed.blocks[1], '\\[\n  c^2 = a^2 + b^2\n\\]');
  const parsedEdited = parseLatexDocument(edited);
  assert.match(parsedEdited.blocks[1].rawLatex, /c\^2 = a\^2 \+ b\^2/);

  // Swap block 1 and block 2
  const swapped = swapPreviewBlocks(edited, parsedEdited.blocks, 1, 2);
  const parsedSwapped = parseLatexDocument(swapped);
  assert.equal(parsedSwapped.blocks[1].rawLatex, '\\section{Second}');
  assert.match(parsedSwapped.blocks[2].rawLatex, /c\^2 = a\^2 \+ b\^2/);

  // Remove block 1
  const removed = removePreviewBlock(swapped, parsedSwapped.blocks[1]);
  const parsedRemoved = parseLatexDocument(removed);
  assert.equal(parsedRemoved.blocks.length, 2);
  assert.equal(parsedRemoved.blocks[0].rawLatex, '\\section{First}');
});

test('updateHeaderMetadata updates title, author, and date with nested braces intact', () => {
  const tex = `\\documentclass{article}
\\title{Old \\textbf{Title}}
\\author{}
\\date{}
\\begin{document}
\\maketitle
\\end{document}`;

  const updated = updateHeaderMetadata(tex, {
    title: 'New Title',
    author: 'Ada Lovelace',
    date: 'November 2026',
  });
  const parsed = parseLatexDocument(updated);
  assert.equal(parsed.title, 'New Title');
  assert.equal(parsed.author, 'Ada Lovelace');
  assert.equal(parsed.date, 'November 2026');
});

test('SYMBOL_CATEGORIES places Document at the end by default and separates Math Blocks from Document', () => {
  assert.equal(SYMBOL_CATEGORIES[0].id, 'favorites');
  assert.equal(SYMBOL_CATEGORIES[0].shortLabel, 'Recent');
  assert.equal(SYMBOL_CATEGORIES[SYMBOL_CATEGORIES.length - 1].id, 'document');
  assert.equal(SYMBOL_CATEGORIES[SYMBOL_CATEGORIES.length - 1].shortLabel, 'Document');
  assert.equal(SYMBOL_CATEGORIES[SYMBOL_CATEGORIES.length - 2].id, 'mathblocks');
  assert.equal(SYMBOL_CATEGORIES[SYMBOL_CATEGORIES.length - 2].shortLabel, 'Math Blocks');

  const docIds = new Set(LATEX_SYMBOLS.filter((s) => s.category === 'structure').map((s) => s.id));
  const mathBlockIds = new Set(
    LATEX_SYMBOLS.filter((s) => s.category === 'mathblocks').map((s) => s.id)
  );

  assert.ok(docIds.has('maketitle'));
  assert.ok(docIds.has('section'));
  assert.ok(docIds.has('footnote'));

  for (const mathId of ['inlineMath', 'displayMath', 'equation', 'align', 'theorem', 'definition', 'proof', 'eqref']) {
    assert.equal(docIds.has(mathId), false, `${mathId} must not be inside Document structure tab`);
    assert.equal(mathBlockIds.has(mathId), true, `${mathId} must be in Math Blocks tab`);
  }

  const maketitleSym = LATEX_SYMBOLS.find((s) => s.id === 'maketitle')!;
  const equationSym = LATEX_SYMBOLS.find((s) => s.id === 'equation')!;
  assert.equal(formatSymbolForPreviewInsertion(maketitleSym), '\\maketitle');
  assert.match(formatSymbolForPreviewInsertion(equationSym), /^\\begin\{equation\}/);
});

test('normalizeCategoryOrder and reorderCategoryOrder support dragging tabs cleanly', () => {
  const normalizedDefault = normalizeCategoryOrder(undefined);
  assert.deepEqual(normalizedDefault, DEFAULT_SYMBOL_CATEGORY_ORDER);
  assert.equal(normalizedDefault[normalizedDefault.length - 1], 'document');

  // Recovers from partial or duplicate saved lists
  const recovered = normalizeCategoryOrder(['document', 'greek', 'greek']);
  assert.equal(recovered[0], 'document');
  assert.equal(recovered[1], 'greek');
  assert.equal(recovered.length, DEFAULT_SYMBOL_CATEGORY_ORDER.length);

  // Move Document from end to before Greek
  const movedBefore = reorderCategoryOrder(DEFAULT_SYMBOL_CATEGORY_ORDER, 'document', 'greek', 'before');
  assert.equal(movedBefore[1], 'document');
  assert.equal(movedBefore[2], 'greek');
  assert.equal(movedBefore.length, DEFAULT_SYMBOL_CATEGORY_ORDER.length);

  // Move Recent from start to after Operators
  const movedAfter = reorderCategoryOrder(movedBefore, 'favorites', 'operators', 'after');
  assert.equal(movedAfter[movedAfter.indexOf('operators') + 1], 'favorites');
  assert.equal(movedAfter.length, DEFAULT_SYMBOL_CATEGORY_ORDER.length);
});

test('DOCUMENT_TEMPLATES excludes blank, provides 12 diverse topic templates, and parses cleanly', () => {
  assert.equal(DOCUMENT_TEMPLATES.length, 12);
  assert.equal(DOCUMENT_TEMPLATES.some((t) => t.id === 'blank'), false);

  const topics = new Set(DOCUMENT_TEMPLATES.map((t) => t.topic));
  assert.equal(topics.size, 12);

  for (const tpl of DOCUMENT_TEMPLATES) {
    const parsed = parseLatexDocument(tpl.content);
    assert.equal(
      parsed.diagnostics.length,
      0,
      `Template ${tpl.id} produced diagnostics: ${JSON.stringify(parsed.diagnostics)}`
    );
    assert.ok(parsed.blocks.length >= 3, `Template ${tpl.id} should have multiple rendered blocks`);
  }

  const parsedBlank = parseLatexDocument(BLANK_DOCUMENT_CONTENT);
  assert.equal(parsedBlank.blocks.length, 2);
  assert.equal(parsedBlank.blocks[0].kind, 'title');
  assert.equal(parsedBlank.blocks[1].kind, 'heading');
});

test('appendSymbolToHeaderValue inserts math and text cleanly into header fields', () => {
  assert.equal(appendSymbolToHeaderValue('', '\\alpha', true), '$\\alpha$');
  assert.equal(appendSymbolToHeaderValue('Notes on', '\\alpha', true), 'Notes on $\\alpha$');
  assert.equal(appendSymbolToHeaderValue('Notes on $\\alpha$', '\\beta', true), 'Notes on $\\alpha \\beta$');
  assert.equal(appendSymbolToHeaderValue('Ada', '\\textbf{Lovelace}', false), 'Ada \\textbf{Lovelace}');
});



