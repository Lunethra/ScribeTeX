import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLatexDocument, stripComments } from './parser';

test('stripComments removes unescaped % comments while preserving escaped \\%', () => {
  const input = 'Price is 50\\% off % ignore this comment\nNext line % comment';
  const stripped = stripComments(input);
  assert.equal(stripped, 'Price is 50\\% off \nNext line ');
});

test('parses preamble title, author, and renders \\maketitle', () => {
  const tex = `
\\documentclass{article}
\\title{Spectral Geometry}
\\author{Ada Lovelace}
\\date{2026}
\\begin{document}
\\maketitle
Hello world.
\\end{document}
  `;
  const result = parseLatexDocument(tex);
  assert.equal(result.title, 'Spectral Geometry');
  assert.equal(result.author, 'Ada Lovelace');
  assert.match(result.html, /<h1[^>]*>Spectral Geometry<\/h1>/);
  assert.match(result.html, /Ada Lovelace/);
  assert.match(result.html, /Hello world\./);
});

test('extracts outline headings and injects table of contents', () => {
  const tex = `
\\begin{document}
\\tableofcontents
\\section{First Section}
Intro text.
\\subsection{Nested Sub}
Details.
\\section*{Unnumbered Appendix}
\\end{document}
  `;
  const result = parseLatexDocument(tex);
  assert.equal(result.outline.length, 3);
  assert.equal(result.outline[0].numberLabel, '1');
  assert.equal(result.outline[0].title, 'First Section');
  assert.equal(result.outline[1].numberLabel, '1.1');
  assert.equal(result.outline[2].numberLabel, '');
  assert.match(result.html, /Contents/);
  assert.match(result.html, /First Section/);
});

test('renders inline and display KaTeX math with custom \\newcommand macros', () => {
  const tex = `
\\newcommand{\\R}{\\mathbb{R}}
\\newcommand{\\norm}[1]{\\left\\| #1 \\right\\|}
\\begin{document}
Let $x \\in \\R$ with $\\norm{x} = 1$.
\\begin{equation}\\label{eq:energy}
E = mc^2
\\end{equation}
See Equation~\\eqref{eq:energy}.
\\end{document}
  `;
  const result = parseLatexDocument(tex, { equationNumbering: true });
  assert.equal(result.diagnostics.length, 0);
  assert.equal(result.equationCount, 1);
  assert.match(result.html, /class="katex"/);
  assert.match(result.html, /\(1\)/);
});

test('renders theorem, proof, tabular, and itemize environments', () => {
  const tex = `
\\begin{document}
\\begin{theorem}[Pythagoras]
$a^2 + b^2 = c^2$
\\end{theorem}
\\begin{proof}
Trivial.
\\end{proof}
\\begin{itemize}
  \\item Alpha
  \\item Beta
\\end{itemize}
\\begin{tabular}{l r}
\\hline
Key & Value \\\\
\\hline
Pi & 3.14 \\\\
\\hline
\\end{tabular}
\\end{document}
  `;
  const result = parseLatexDocument(tex);
  assert.match(result.html, /Theorem 1 \(Pythagoras\)\./);
  assert.match(result.html, /Proof\./);
  assert.match(result.html, /<ul/);
  assert.match(result.html, /<table/);
  assert.match(result.html, /3\.14/);
});

test('handles malformed LaTeX math gracefully without throwing and records diagnostic', () => {
  const tex = `
\\begin{document}
Broken equation: $\\frac{1}{$
\\end{document}
  `;
  const result = parseLatexDocument(tex);
  assert.ok(result.diagnostics.length >= 1);
  assert.equal(result.diagnostics[0].severity, 'error');
  assert.match(result.html, /Broken equation:/);
});

test('compiles basic empty header and empty base section cleanly', () => {
  const tex = `\\documentclass{article}
\\title{}
\\author{}
\\date{}

\\begin{document}
\\maketitle

\\section{}

\\end{document}`;
  const result = parseLatexDocument(tex);
  assert.equal(result.diagnostics.length, 0);
  assert.equal(result.outline.length, 1);
  assert.equal(result.outline[0].numberLabel, '1');
  assert.equal(result.outline[0].title, '');
  assert.match(result.html, /<h2/);
});
