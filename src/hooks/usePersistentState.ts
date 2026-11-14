import { useEffect, useState } from 'react';
import type { EditorSettings } from '../types/editor';

export const DEFAULT_SETTINGS: EditorSettings = {
  theme: 'dark',
  syntaxHighlighting: true,
  syntaxPreset: 'coal-cobalt',
  editorFontFamily: 'JetBrains Mono',
  editorFontSize: 14,
  editorLineHeight: 1.65,
  tabSize: 2,
  wordWrap: true,
  lineNumbers: true,
  activeLineHighlight: true,
  bracketMatching: true,
  autoCloseBrackets: true,
  fontLigatures: true,
  highlightMathZones: true,
  showWhitespace: false,
  autoIndent: true,
  previewLayout: 'paginated',
  previewThemeSync: 'match-app',
  previewFontFamily: 'Source Serif 4',
  previewFontSize: 16,
  previewZoom: 100,
  paperMargin: 'standard',
  equationNumbering: true,
  syncScroll: true,
  compileMode: 'instant',
  showKeyboard: true,
  showOutline: false,
};

export function usePersistentState<T>(key: string, defaultValue: T) {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return defaultValue;
      const parsed = JSON.parse(raw);
      if (
        typeof defaultValue === 'object' &&
        defaultValue !== null &&
        !Array.isArray(defaultValue)
      ) {
        return { ...defaultValue, ...parsed };
      }
      return parsed;
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(state));
    } catch {
      // Ignore storage quota errors
    }
  }, [key, state]);

  return [state, setState] as const;
}
