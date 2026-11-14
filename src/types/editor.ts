export type ThemeMode = 'dark' | 'light';

export type ViewMode = 'split' | 'editor' | 'preview';

export type SyntaxPresetId =
  | 'coal-cobalt'
  | 'milk-graphite'
  | 'prism'
  | 'nordic-frost'
  | 'solar-academic'
  | 'monochrome';

export type EditorFontFamily =
  | 'JetBrains Mono'
  | 'IBM Plex Mono'
  | 'Fira Code'
  | 'Space Mono';

export type PreviewFontFamily =
  | 'Source Serif 4'
  | 'Lora'
  | 'Plus Jakarta Sans';

export type PaperLayout = 'paginated' | 'continuous';
export type PaperMargin = 'narrow' | 'standard' | 'wide';
export type PreviewThemeSync = 'match-app' | 'always-paper';
export type CompileMode = 'instant' | 'debounced' | 'manual';

export interface EditorSettings {
  theme: ThemeMode;
  syntaxHighlighting: boolean;
  syntaxPreset: SyntaxPresetId;
  editorFontFamily: EditorFontFamily;
  editorFontSize: number;
  editorLineHeight: number;
  tabSize: number;
  wordWrap: boolean;
  lineNumbers: boolean;
  activeLineHighlight: boolean;
  bracketMatching: boolean;
  autoCloseBrackets: boolean;
  fontLigatures: boolean;
  highlightMathZones: boolean;
  showWhitespace: boolean;
  autoIndent: boolean;
  previewLayout: PaperLayout;
  previewThemeSync: PreviewThemeSync;
  previewFontFamily: PreviewFontFamily;
  previewFontSize: number;
  previewZoom: number;
  paperMargin: PaperMargin;
  equationNumbering: boolean;
  syncScroll: boolean;
  compileMode: CompileMode;
  showKeyboard: boolean;
  showOutline: boolean;
}

export type SymbolCategoryId =
  | 'favorites'
  | 'greek'
  | 'operators'
  | 'calculus'
  | 'relations'
  | 'logic'
  | 'arrows'
  | 'accents'
  | 'matrices'
  | 'functions'
  | 'structure';

export interface SymbolItem {
  id: string;
  label: string;
  command: string;
  snippet: string;
  previewLatex?: string;
  previewText?: string;
  category: Exclude<SymbolCategoryId, 'favorites'>;
  keywords: string[];
  description: string;
}

export interface OutlineHeading {
  id: string;
  level: number;
  title: string;
  numberLabel: string;
  line: number;
}

export interface CompileDiagnostic {
  id: string;
  message: string;
  snippet: string;
  severity: 'error' | 'warning';
}

export interface ParsedLaTeXResult {
  html: string;
  outline: OutlineHeading[];
  diagnostics: CompileDiagnostic[];
  wordCount: number;
  equationCount: number;
  title: string;
  author: string;
  date: string;
}

export interface LaTeXDocument {
  id: string;
  title: string;
  content: string;
  updatedAt: number;
}
