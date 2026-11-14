import test from 'node:test';
import assert from 'node:assert/strict';
import { applyLatexSnippet } from './snippetUtils';

test('inserts snippet at cursor and places caret at $0 marker', () => {
  const res = applyLatexSnippet('Hello  world', 6, 6, '\\frac{$0}{}');
  assert.equal(res.nextText, 'Hello \\frac{}{} world');
  assert.equal(res.selectionStart, 12);
  assert.equal(res.selectionEnd, 12);
});

test('wraps selected text at $0 marker', () => {
  const res = applyLatexSnippet('Let x be real', 4, 5, '\\mathbf{$0}');
  assert.equal(res.nextText, 'Let \\mathbf{x} be real');
  assert.equal(res.selectionStart, 13);
});

test('appends caret at end when snippet has no $0 marker', () => {
  const res = applyLatexSnippet('x  y', 2, 2, '\\alpha');
  assert.equal(res.nextText, 'x \\alpha y');
  assert.equal(res.selectionStart, 8);
});
