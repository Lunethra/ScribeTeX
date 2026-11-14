import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import {
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightWhitespace,
  keymap,
  lineNumbers,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from '@codemirror/autocomplete';
import { bracketMatching, indentUnit } from '@codemirror/language';
import { openSearchPanel, search, searchKeymap } from '@codemirror/search';
import {
  createEditorThemeExtension,
  createLatexHighlightStyle,
  latexAutocomplete,
  latexStreamLanguage,
} from '../editor/latexLanguage';
import type { EditorSettings } from '../types/editor';

export interface LatexEditorHandle {
  insertSnippet: (snippet: string) => void;
  focus: () => void;
  scrollToLine: (lineNumber: number) => void;
  openFindReplace: () => void;
}

interface LatexEditorPaneProps {
  value: string;
  onChange: (nextValue: string) => void;
  settings: EditorSettings;
  onCursorChange?: (line: number, col: number) => void;
  onScrollRatioChange?: (ratio: number) => void;
}

export const LatexEditorPane = forwardRef<LatexEditorHandle, LatexEditorPaneProps>(
  function LatexEditorPane(
    { value, onChange, settings, onCursorChange, onScrollRatioChange },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const viewRef = useRef<EditorView | null>(null);
    const onChangeRef = useRef(onChange);
    const onCursorRef = useRef(onCursorChange);
    const onScrollRef = useRef(onScrollRatioChange);
    const valueRef = useRef(value);
    const suppressUpdateRef = useRef(false);

    onChangeRef.current = onChange;
    onCursorRef.current = onCursorChange;
    onScrollRef.current = onScrollRatioChange;
    valueRef.current = value;

    const compartments = useRef({
      theme: new Compartment(),
      syntax: new Compartment(),
      lineNumbers: new Compartment(),
      wordWrap: new Compartment(),
      tabSize: new Compartment(),
      bracketMatching: new Compartment(),
      closeBrackets: new Compartment(),
      activeLine: new Compartment(),
      whitespace: new Compartment(),
    }).current;

    useImperativeHandle(ref, () => ({
      insertSnippet(snippet: string) {
        const view = viewRef.current;
        if (!view) return;

        const { from, to } = view.state.selection.main;
        const selected = view.state.sliceDoc(from, to);
        const markerIdx = snippet.indexOf('$0');

        let insertText: string;
        let caretPos: number;

        if (markerIdx !== -1) {
          insertText =
            snippet.slice(0, markerIdx) + selected + snippet.slice(markerIdx + 2);
          caretPos = from + markerIdx + selected.length;
        } else {
          insertText = snippet;
          caretPos = from + snippet.length;
        }

        view.dispatch({
          changes: { from, to, insert: insertText },
          selection: { anchor: caretPos, head: caretPos },
          scrollIntoView: true,
        });
        view.focus();
      },
      focus() {
        viewRef.current?.focus();
      },
      scrollToLine(lineNumber: number) {
        const view = viewRef.current;
        if (!view) return;
        const clamped = Math.max(1, Math.min(lineNumber, view.state.doc.lines));
        const line = view.state.doc.line(clamped);
        view.dispatch({
          selection: { anchor: line.from },
          effects: EditorView.scrollIntoView(line.from, { y: 'start' }),
        });
        view.focus();
      },
      openFindReplace() {
        const view = viewRef.current;
        if (!view) return;
        openSearchPanel(view);
      },
    }));

    // Mount CodeMirror once
    useEffect(() => {
      if (!containerRef.current) return;

      const buildDynamicExtensions = (s: EditorSettings): Extension[] => [
        compartments.theme.of(createEditorThemeExtension(s)),
        compartments.syntax.of(
          s.syntaxHighlighting ? createLatexHighlightStyle(s.syntaxPreset, s.theme) : []
        ),
        compartments.lineNumbers.of(s.lineNumbers ? lineNumbers() : []),
        compartments.wordWrap.of(s.wordWrap ? EditorView.lineWrapping : []),
        compartments.tabSize.of([
          EditorState.tabSize.of(s.tabSize),
          indentUnit.of(' '.repeat(s.tabSize)),
        ]),
        compartments.bracketMatching.of(s.bracketMatching ? bracketMatching() : []),
        compartments.closeBrackets.of(s.autoCloseBrackets ? closeBrackets() : []),
        compartments.activeLine.of(
          s.activeLineHighlight ? [highlightActiveLine(), highlightActiveLineGutter()] : []
        ),
        compartments.whitespace.of(s.showWhitespace ? highlightWhitespace() : []),
      ];

      const state = EditorState.create({
        doc: valueRef.current,
        extensions: [
          history(),
          latexStreamLanguage,
          search({ top: true }),
          autocompletion({ override: [latexAutocomplete] }),
          keymap.of([
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...searchKeymap,
            ...historyKeymap,
            ...completionKeymap,
            indentWithTab,
          ]),
          ...buildDynamicExtensions(settings),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !suppressUpdateRef.current) {
              onChangeRef.current(update.state.doc.toString());
            }
            if (update.selectionSet || update.docChanged) {
              const head = update.state.selection.main.head;
              const line = update.state.doc.lineAt(head);
              onCursorRef.current?.(line.number, head - line.from + 1);
            }
          }),
          EditorView.domEventHandlers({
            scroll: (_event, view) => {
              const scroller = view.scrollDOM;
              const maxScroll = scroller.scrollHeight - scroller.clientHeight;
              if (maxScroll > 0) {
                onScrollRef.current?.(scroller.scrollTop / maxScroll);
              }
            },
          }),
        ],
      });

      const view = new EditorView({
        state,
        parent: containerRef.current,
      });

      viewRef.current = view;

      return () => {
        view.destroy();
        viewRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Reconfigure CodeMirror settings dynamically without tearing down editor
    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;

      view.dispatch({
        effects: [
          compartments.theme.reconfigure(createEditorThemeExtension(settings)),
          compartments.syntax.reconfigure(
            settings.syntaxHighlighting
              ? createLatexHighlightStyle(settings.syntaxPreset, settings.theme)
              : []
          ),
          compartments.lineNumbers.reconfigure(settings.lineNumbers ? lineNumbers() : []),
          compartments.wordWrap.reconfigure(
            settings.wordWrap ? EditorView.lineWrapping : []
          ),
          compartments.tabSize.reconfigure([
            EditorState.tabSize.of(settings.tabSize),
            indentUnit.of(' '.repeat(settings.tabSize)),
          ]),
          compartments.bracketMatching.reconfigure(
            settings.bracketMatching ? bracketMatching() : []
          ),
          compartments.closeBrackets.reconfigure(
            settings.autoCloseBrackets ? closeBrackets() : []
          ),
          compartments.activeLine.reconfigure(
            settings.activeLineHighlight
              ? [highlightActiveLine(), highlightActiveLineGutter()]
              : []
          ),
          compartments.whitespace.reconfigure(
            settings.showWhitespace ? highlightWhitespace() : []
          ),
        ],
      });
    }, [settings, compartments]);

    // Sync external document changes (e.g., switching documents or loading templates)
    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;
      const currentDoc = view.state.doc.toString();
      if (currentDoc !== value) {
        suppressUpdateRef.current = true;
        view.dispatch({
          changes: { from: 0, to: currentDoc.length, insert: value },
        });
        suppressUpdateRef.current = false;
      }
    }, [value]);

    return (
      <div className="relative h-full w-full overflow-hidden">
        <div
          ref={containerRef}
          data-testid="latex-codemirror-editor"
          aria-label="LaTeX source code editor"
          className="h-full w-full"
        />
      </div>
    );
  }
);
