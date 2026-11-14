import { HighlightStyle, StreamLanguage, syntaxHighlighting } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';
import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { LATEX_SYMBOLS } from '../data/latexSymbols';
import type { EditorSettings, SyntaxPresetId, ThemeMode } from '../types/editor';

interface LatexStreamState {
  inMath: boolean;
  mathDelimiter: string | null;
}

const SECTION_COMMANDS = new Set([
  'documentclass',
  'usepackage',
  'title',
  'author',
  'date',
  'maketitle',
  'tableofcontents',
  'section',
  'subsection',
  'subsubsection',
  'paragraph',
  'chapter',
  'part',
  'newcommand',
  'renewcommand',
  'DeclareMathOperator',
]);

export const latexStreamLanguage = StreamLanguage.define<LatexStreamState>({
  name: 'latex',
  startState: () => ({ inMath: false, mathDelimiter: null }),
  token(stream, state) {
    // Comments
    if (stream.match('%')) {
      stream.skipToEnd();
      return 'comment';
    }

    // Display math $$ or $
    if (stream.match('$$')) {
      if (state.inMath && state.mathDelimiter === '$$') {
        state.inMath = false;
        state.mathDelimiter = null;
      } else if (!state.inMath) {
        state.inMath = true;
        state.mathDelimiter = '$$';
      }
      return 'processingInstruction';
    }

    if (stream.match('$')) {
      if (state.inMath && state.mathDelimiter === '$') {
        state.inMath = false;
        state.mathDelimiter = null;
      } else if (!state.inMath) {
        state.inMath = true;
        state.mathDelimiter = '$';
      }
      return 'processingInstruction';
    }

    // \[ \] \( \)
    if (stream.match('\\[') || stream.match('\\(')) {
      state.inMath = true;
      state.mathDelimiter = stream.current() === '\\[' ? '\\]' : '\\)';
      return 'processingInstruction';
    }
    if (stream.match('\\]') || stream.match('\\)')) {
      state.inMath = false;
      state.mathDelimiter = null;
      return 'processingInstruction';
    }

    // Escaped characters
    if (stream.match(/\\[$%&#_{}\\]/)) {
      return 'escape';
    }

    // \begin{env} or \end{env}
    if (stream.match(/\\(begin|end)\b/)) {
      return 'keyword';
    }

    // General commands
    if (stream.match(/\\[a-zA-Z@]+\*?/)) {
      const cmd = stream.current().slice(1).replace(/\*$/, '');
      if (SECTION_COMMANDS.has(cmd)) {
        return 'heading';
      }
      if (state.inMath) {
        return 'atom';
      }
      return 'tagName';
    }

    // Braces & brackets
    if (stream.match(/[{}[\]]/)) {
      return 'bracket';
    }

    // Numbers
    if (stream.match(/\d+(?:\.\d+)?/)) {
      return 'number';
    }

    // Math operators
    if (state.inMath && stream.match(/[+\-*/=<>^_&|!]/)) {
      return 'operator';
    }

    // Consume plain character
    stream.next();
    return state.inMath ? 'string' : null;
  },
});

export function latexAutocomplete(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(/\\[a-zA-Z]*/);
  if (!word || (word.from === word.to && !context.explicit)) return null;

  return {
    from: word.from,
    options: LATEX_SYMBOLS.filter((sym) => sym.command.startsWith('\\')).map((sym) => ({
      label: sym.command.replace(/\{.*$/, ''),
      detail: sym.description,
      apply: sym.snippet.replace('$0', ''),
      type: 'keyword',
    })),
  };
}

export interface SyntaxPresetOption {
  id: SyntaxPresetId;
  name: string;
  description: string;
}

export const SYNTAX_PRESETS: SyntaxPresetOption[] = [
  { id: 'coal-cobalt', name: 'Coal & Cobalt', description: 'Vibrant blue commands & cyan math on dark' },
  { id: 'milk-graphite', name: 'Milk & Graphite', description: 'High-contrast ink with soft slate accents' },
  { id: 'prism', name: 'Vibrant Prism', description: 'Distinct colors for commands, math, and braces' },
  { id: 'nordic-frost', name: 'Nordic Frost', description: 'Cool arctic blues and crisp silver' },
  { id: 'solar-academic', name: 'Solar Academic', description: 'Emerald math, cobalt tags, warm comments' },
  { id: 'monochrome', name: 'Monochrome Ink', description: 'Minimalist typographic weight & contrast' },
];

export function createLatexHighlightStyle(preset: SyntaxPresetId, theme: ThemeMode) {
  const isDark = theme === 'dark';

  if (preset === 'monochrome') {
    return syntaxHighlighting(
      HighlightStyle.define([
        { tag: t.comment, color: isDark ? '#64748B' : '#71717A', fontStyle: 'italic' },
        { tag: t.heading, color: isDark ? '#FFFFFF' : '#09090B', fontWeight: '700' },
        { tag: t.keyword, color: isDark ? '#E2E8F0' : '#18181B', fontWeight: '600' },
        { tag: t.tagName, color: isDark ? '#CBD5E1' : '#27272A', fontWeight: '500' },
        { tag: t.atom, color: isDark ? '#E2E8F0' : '#18181B' },
        { tag: t.processingInstruction, color: isDark ? '#94A3B8' : '#52525B', fontWeight: '700' },
        { tag: t.bracket, color: isDark ? '#94A3B8' : '#52525B' },
        { tag: t.number, color: isDark ? '#CBD5E1' : '#3F3F46' },
        { tag: t.operator, color: isDark ? '#94A3B8' : '#52525B' },
        { tag: t.string, color: isDark ? '#E2E8F0' : '#18181B' },
      ])
    );
  }

  if (preset === 'milk-graphite' || (!isDark && preset === 'coal-cobalt')) {
    return syntaxHighlighting(
      HighlightStyle.define([
        { tag: t.comment, color: '#6E717A', fontStyle: 'italic' },
        { tag: t.heading, color: '#111113', fontWeight: '700' },
        { tag: t.keyword, color: '#1D4ED8', fontWeight: '600' },
        { tag: t.tagName, color: '#27272A', fontWeight: '600' },
        { tag: t.atom, color: '#0F766E', fontWeight: '500' },
        { tag: t.processingInstruction, color: '#1D4ED8', fontWeight: '700' },
        { tag: t.bracket, color: '#52525B', fontWeight: '600' },
        { tag: t.number, color: '#3F3F46' },
        { tag: t.operator, color: '#0F766E' },
        { tag: t.escape, color: '#52525B' },
        { tag: t.string, color: '#1E293B' },
      ])
    );
  }

  if (preset === 'prism') {
    return syntaxHighlighting(
      HighlightStyle.define([
        { tag: t.comment, color: isDark ? '#6B7280' : '#6B7280', fontStyle: 'italic' },
        { tag: t.heading, color: isDark ? '#60A5FA' : '#1D4ED8', fontWeight: '700' },
        { tag: t.keyword, color: isDark ? '#38BDF8' : '#0284C7', fontWeight: '600' },
        { tag: t.tagName, color: isDark ? '#A78BFA' : '#6D28D9' },
        { tag: t.atom, color: isDark ? '#34D399' : '#059669' },
        { tag: t.processingInstruction, color: isDark ? '#FBBF24' : '#B45309', fontWeight: '700' },
        { tag: t.bracket, color: isDark ? '#F472B6' : '#BE185D' },
        { tag: t.number, color: isDark ? '#FB923C' : '#C2410C' },
        { tag: t.operator, color: isDark ? '#38BDF8' : '#0369A1' },
        { tag: t.string, color: isDark ? '#A7F3D0' : '#047857' },
      ])
    );
  }

  if (preset === 'nordic-frost') {
    return syntaxHighlighting(
      HighlightStyle.define([
        { tag: t.comment, color: isDark ? '#64748B' : '#64748B', fontStyle: 'italic' },
        { tag: t.heading, color: isDark ? '#93C5FD' : '#1E40AF', fontWeight: '700' },
        { tag: t.keyword, color: isDark ? '#38BDF8' : '#0369A1', fontWeight: '600' },
        { tag: t.tagName, color: isDark ? '#60A5FA' : '#2563EB' },
        { tag: t.atom, color: isDark ? '#67E8F9' : '#0E7490' },
        { tag: t.processingInstruction, color: isDark ? '#BAE6FD' : '#0284C7', fontWeight: '700' },
        { tag: t.bracket, color: isDark ? '#94A3B8' : '#475569' },
        { tag: t.number, color: isDark ? '#7DD3FC' : '#0369A1' },
        { tag: t.operator, color: isDark ? '#38BDF8' : '#0284C7' },
        { tag: t.string, color: isDark ? '#E0F2FE' : '#0F172A' },
      ])
    );
  }

  if (preset === 'solar-academic') {
    return syntaxHighlighting(
      HighlightStyle.define([
        { tag: t.comment, color: isDark ? '#78716C' : '#78716C', fontStyle: 'italic' },
        { tag: t.heading, color: isDark ? '#F59E0B' : '#B45309', fontWeight: '700' },
        { tag: t.keyword, color: isDark ? '#3B82F6' : '#1D4ED8', fontWeight: '600' },
        { tag: t.tagName, color: isDark ? '#60A5FA' : '#2563EB' },
        { tag: t.atom, color: isDark ? '#10B981' : '#047857' },
        { tag: t.processingInstruction, color: isDark ? '#FBBF24' : '#D97706', fontWeight: '700' },
        { tag: t.bracket, color: isDark ? '#A8A29E' : '#57534E' },
        { tag: t.number, color: isDark ? '#34D399' : '#059669' },
        { tag: t.operator, color: isDark ? '#F59E0B' : '#B45309' },
        { tag: t.string, color: isDark ? '#A7F3D0' : '#065F46' },
      ])
    );
  }

  // Default: 'coal-cobalt' on dark
  return syntaxHighlighting(
    HighlightStyle.define([
      { tag: t.comment, color: '#64748B', fontStyle: 'italic' },
      { tag: t.heading, color: '#93C5FD', fontWeight: '700' },
      { tag: t.keyword, color: '#3B82F6', fontWeight: '600' },
      { tag: t.tagName, color: '#60A5FA' },
      { tag: t.atom, color: '#38BDF8' },
      { tag: t.processingInstruction, color: '#F59E0B', fontWeight: '700' },
      { tag: t.bracket, color: '#94A3B8', fontWeight: '600' },
      { tag: t.number, color: '#7DD3FC' },
      { tag: t.operator, color: '#38BDF8' },
      { tag: t.escape, color: '#CBD5E1' },
      { tag: t.string, color: '#BAE6FD' },
    ])
  );
}

export function createEditorThemeExtension(settings: EditorSettings) {
  const isDark = settings.theme === 'dark';

  return EditorView.theme(
    {
      '&': {
        height: '100%',
        backgroundColor: isDark ? '#0B0C0E' : '#FAF9F6',
        color: isDark ? '#F4F6FA' : '#111113',
        fontSize: `${settings.editorFontSize}px`,
        fontFamily: `"${settings.editorFontFamily}", ui-monospace, monospace`,
      },
      '.cm-scroller': {
        overflow: 'auto',
        fontFamily: `"${settings.editorFontFamily}", ui-monospace, monospace`,
        lineHeight: String(settings.editorLineHeight),
        fontVariantLigatures: settings.fontLigatures ? 'normal' : 'none',
      },
      '.cm-content': {
        padding: '18px 0',
        caretColor: isDark ? '#3B82F6' : '#111113',
      },
      '.cm-line': {
        padding: '0 20px 0 12px',
      },
      '.cm-gutters': {
        backgroundColor: isDark ? '#0E1014' : '#F2F0EB',
        color: isDark ? '#5A6478' : '#6E6E77',
        borderRight: `1px solid ${isDark ? '#1D222C' : '#DCD9D0'}`,
        minWidth: '46px',
        userSelect: 'none',
      },
      '.cm-activeLineGutter': {
        backgroundColor: isDark ? '#161B24' : '#E7E4DC',
        color: isDark ? '#60A5FA' : '#111113',
        fontWeight: '600',
      },
      '.cm-activeLine': {
        backgroundColor: settings.activeLineHighlight
          ? isDark
            ? 'rgba(37, 99, 235, 0.08)'
            : 'rgba(17, 17, 19, 0.04)'
          : 'transparent',
      },
      '.cm-selectionBackground, ::selection': {
        backgroundColor: isDark
          ? 'rgba(59, 130, 246, 0.28) !important'
          : 'rgba(39, 39, 42, 0.16) !important',
      },
      '.cm-cursor': {
        borderLeftColor: isDark ? '#3B82F6' : '#111113',
        borderLeftWidth: '2px',
      },
      '.cm-matchingBracket': {
        backgroundColor: isDark ? 'rgba(59, 130, 246, 0.25)' : 'rgba(17, 17, 19, 0.12)',
        outline: `1px solid ${isDark ? '#3B82F6' : '#52525B'}`,
        borderRadius: '2px',
      },
      '.cm-tooltip': {
        backgroundColor: isDark ? '#141820' : '#FFFFFF',
        color: isDark ? '#F4F6FA' : '#111113',
        border: `1px solid ${isDark ? '#252C3A' : '#D4D1C8'}`,
        borderRadius: '8px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.22)',
      },
      '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
        backgroundColor: isDark ? '#2563EB' : '#27272A',
        color: '#FFFFFF',
      },
    },
    { dark: isDark }
  );
}
