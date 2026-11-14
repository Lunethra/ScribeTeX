import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bold,
  Columns2,
  Download,
  Eye,
  FilePlus2,
  Italic,
  Keyboard,
  Moon,
  PanelLeft,
  Play,
  Printer,
  Search,
  SlidersHorizontal,
  SquareCode,
  Sun,
  X,
} from 'lucide-react';
import { CustomizationDrawer } from './components/CustomizationDrawer';
import { LatexEditorPane, type LatexEditorHandle } from './components/LatexEditorPane';
import { LatexPreviewPane, type LatexPreviewHandle } from './components/LatexPreviewPane';
import { OutlineSidebar } from './components/OutlineSidebar';
import { SymbolKeyboardToolbar } from './components/SymbolKeyboardToolbar';
import { TemplatesModal } from './components/TemplatesModal';
import { WelcomeScreen } from './components/WelcomeScreen';
import { DOCUMENT_TEMPLATES, type DocumentTemplate } from './data/templates';
import { DEFAULT_SETTINGS, usePersistentState } from './hooks/usePersistentState';
import { parseLatexDocument } from './latex/parser';
import {
  autoSaveDocument,
  deleteDocumentStorage,
  loadDocumentsState,
  persistActiveDocId,
  persistDocumentsList,
} from './utils/documentStorage';
import type {
  EditorSettings,
  LaTeXDocument,
  OutlineHeading,
  SymbolItem,
  ViewMode,
} from './types/editor';

export default function App() {
  const [settings, setSettings] = usePersistentState<EditorSettings>(
    'scribetex:settings:v1',
    DEFAULT_SETTINGS
  );
  const [initialStorage] = useState(() => loadDocumentsState());
  const [documents, setDocuments] = useState<LaTeXDocument[]>(initialStorage.documents);
  const [activeDocId, setActiveDocIdState] = useState<string | null>(initialStorage.activeDocId);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(initialStorage.lastSavedAt);
  const [recentSymbolIds, setRecentSymbolIds] = usePersistentState<string[]>(
    'scribetex:recentSymbols:v1',
    ['frac', 'int', 'sum', 'alpha', 'beta', 'bmatrix', 'equation']
  );
  const [favoriteSymbolIds, setFavoriteSymbolIds] = usePersistentState<string[]>(
    'scribetex:favoriteSymbols:v1',
    ['frac', 'sqrt', 'sum', 'int', 'alpha', 'theta', 'mathbbR', 'align']
  );

  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [splitPercent, setSplitPercent] = useState(50);
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
  const [isTemplatesOpen, setIsTemplatesOpen] = useState(false);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });

  const setActiveDocId = useCallback((id: string | null) => {
    setActiveDocIdState(id);
    persistActiveDocId(id);
  }, []);

  const activeDoc = useMemo(
    () => (activeDocId ? documents.find((d) => d.id === activeDocId) ?? null : null),
    [documents, activeDocId]
  );

  const [compiledSource, setCompiledSource] = useState(activeDoc?.content ?? '');

  const editorRef = useRef<LatexEditorHandle | null>(null);
  const previewRef = useRef<LatexPreviewHandle | null>(null);
  const splitContainerRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef(false);
  const activeDocRef = useRef<LaTeXDocument | null>(activeDoc);
  const documentsRef = useRef<LaTeXDocument[]>(documents);
  activeDocRef.current = activeDoc;
  documentsRef.current = documents;

  // Sync <html class="dark"> with theme setting
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [settings.theme]);

  // Flush auto-save to localStorage on page unload
  useEffect(() => {
    const handleUnload = () => {
      if (activeDocRef.current) {
        autoSaveDocument(activeDocRef.current, documentsRef.current);
      } else {
        persistDocumentsList(documentsRef.current);
      }
      persistActiveDocId(activeDocRef.current?.id ?? null);
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, []);

  // Keep compiledSource updated according to compileMode
  useEffect(() => {
    const content = activeDoc?.content ?? '';
    if (settings.compileMode === 'instant') {
      setCompiledSource(content);
      return;
    }
    if (settings.compileMode === 'debounced') {
      const timer = window.setTimeout(() => {
        setCompiledSource(content);
      }, 220);
      return () => window.clearTimeout(timer);
    }
  }, [activeDoc?.content, settings.compileMode]);

  // Also compile immediately when switching active documents
  useEffect(() => {
    setCompiledSource(activeDoc?.content ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDoc?.id]);

  const parsedResult = useMemo(
    () =>
      activeDoc
        ? parseLatexDocument(compiledSource, {
            equationNumbering: settings.equationNumbering,
          })
        : {
            html: '',
            outline: [],
            diagnostics: [],
            wordCount: 0,
            equationCount: 0,
            title: '',
            author: '',
            date: '',
          },
    [activeDoc, compiledSource, settings.equationNumbering]
  );

  const updateSetting = useCallback(
    <K extends keyof EditorSettings>(key: K, value: EditorSettings[K]) => {
      setSettings((prev) => ({ ...prev, [key]: value }));
    },
    [setSettings]
  );

  const updateActiveDocContent = useCallback(
    (nextContent: string) => {
      const current = activeDocRef.current;
      if (!current) return;
      const now = Date.now();
      const updatedDoc: LaTeXDocument = {
        ...current,
        content: nextContent,
        updatedAt: now,
      };
      const nextDocs = documentsRef.current.map((doc) =>
        doc.id === current.id ? updatedDoc : doc
      );
      const { savedAt } = autoSaveDocument(updatedDoc, nextDocs);
      setDocuments(nextDocs);
      setLastSavedAt(savedAt);
    },
    []
  );

  const updateActiveDocTitle = useCallback(
    (nextTitle: string) => {
      const current = activeDocRef.current;
      if (!current) return;
      const now = Date.now();
      const updatedDoc: LaTeXDocument = {
        ...current,
        title: nextTitle,
        updatedAt: now,
      };
      const nextDocs = documentsRef.current.map((doc) =>
        doc.id === current.id ? updatedDoc : doc
      );
      const { savedAt } = autoSaveDocument(updatedDoc, nextDocs);
      setDocuments(nextDocs);
      setLastSavedAt(savedAt);
    },
    []
  );

  const handleInsertSnippet = useCallback((snippet: string) => {
    editorRef.current?.insertSnippet(snippet);
  }, []);

  const handleInsertSymbol = useCallback(
    (sym: SymbolItem) => {
      editorRef.current?.insertSnippet(sym.snippet);
      setRecentSymbolIds((prev) => [sym.id, ...prev.filter((id) => id !== sym.id)].slice(0, 16));
    },
    [setRecentSymbolIds]
  );

  const handleToggleFavorite = useCallback(
    (id: string) => {
      setFavoriteSymbolIds((prev) =>
        prev.includes(id) ? prev.filter((item) => item !== id) : [id, ...prev]
      );
    },
    [setFavoriteSymbolIds]
  );

  const createDocumentAndOpen = useCallback(
    (title: string, content: string) => {
      const now = Date.now();
      const newDoc: LaTeXDocument = {
        id: `doc-${now}`,
        title,
        content,
        updatedAt: now,
      };
      const nextDocs = [newDoc, ...documentsRef.current];
      const { savedAt } = autoSaveDocument(newDoc, nextDocs);
      setDocuments(nextDocs);
      setLastSavedAt(savedAt);
      setActiveDocId(newDoc.id);
    },
    [setActiveDocId]
  );

  const handleNewBlankFile = useCallback(() => {
    const blankTemplate =
      DOCUMENT_TEMPLATES.find((t) => t.id === 'blank') ?? DOCUMENT_TEMPLATES[0];
    const untitledCount = documentsRef.current.filter((d) =>
      d.title.startsWith('Untitled')
    ).length;
    const filename = untitledCount === 0 ? 'Untitled.tex' : `Untitled-${untitledCount + 1}.tex`;
    createDocumentAndOpen(filename, blankTemplate.content);
  }, [createDocumentAndOpen]);

  const handleSelectTemplate = useCallback(
    (tpl: DocumentTemplate) => {
      const title = `${tpl.name.replace(/[^a-zA-Z0-9 ]+/g, '').trim() || 'Document'}.tex`;
      createDocumentAndOpen(title, tpl.content);
    },
    [createDocumentAndOpen]
  );

  const handleImportTexFile = useCallback(
    (title: string, content: string) => {
      const normalized = title.endsWith('.tex') ? title : `${title}.tex`;
      createDocumentAndOpen(normalized, content);
    },
    [createDocumentAndOpen]
  );

  const handleCloseActiveDoc = useCallback(() => {
    setActiveDocId(null);
  }, [setActiveDocId]);

  const handleDeleteDoc = useCallback(
    (id: string) => {
      const filtered = documentsRef.current.filter((d) => d.id !== id);
      const nextActive =
        activeDocId === id ? (filtered.length > 0 ? filtered[0].id : null) : activeDocId;
      deleteDocumentStorage(id, filtered, nextActive);
      setDocuments(filtered);
      if (activeDocId === id) {
        setActiveDocIdState(nextActive);
      }
    },
    [activeDocId]
  );

  const handleDownloadTex = useCallback(() => {
    if (!activeDoc) return;
    const blob = new Blob([activeDoc.content], { type: 'application/x-tex;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeDoc.title.endsWith('.tex') ? activeDoc.title : `${activeDoc.title}.tex`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [activeDoc]);

  const handleSelectHeading = useCallback((heading: OutlineHeading) => {
    editorRef.current?.scrollToLine(heading.line);
    previewRef.current?.scrollToHeading(heading.id);
  }, []);

  // Split-pane drag resizing
  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      if (!isDraggingRef.current || !splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();
      const rawPct = ((e.clientX - rect.left) / rect.width) * 100;
      const clamped = Math.max(25, Math.min(75, rawPct));
      setSplitPercent(clamped);
    };
    const onPointerUp = () => {
      isDraggingRef.current = false;
      document.body.style.cursor = '';
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, []);

  const isDark = settings.theme === 'dark';

  return (
    <div
      data-theme={settings.theme}
      className="h-screen w-screen flex flex-col overflow-hidden bg-[var(--bg-canvas)] text-[var(--text-primary)] transition-colors duration-150"
    >
      {/* Top Bar */}
      <header className="h-12 shrink-0 px-4 flex items-center justify-between gap-4 border-b border-[var(--border-hairline)] bg-[var(--bg-surface)]">
        {/* Zone 1: Brand Title */}
        <div className="flex items-center gap-4 min-w-0">
          <span className="text-base font-bold tracking-tight whitespace-nowrap shrink-0 text-[var(--text-primary)]">
            ScribeTeX
          </span>
        </div>

        {/* Zone 2: Active Document Title, Close & Auto-save Status */}
        {activeDoc ? (
          <div className="hidden md:flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={activeDoc.title}
                onChange={(e) => updateActiveDocTitle(e.target.value)}
                aria-label="Document filename"
                className="w-52 px-2.5 py-1 text-xs font-medium rounded-md bg-[var(--bg-elevated)] border border-[var(--border-hairline)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-ring)] truncate"
              />
              <button
                type="button"
                onClick={handleCloseActiveDoc}
                title="Close file"
                aria-label="Close active file"
                className="p-1.5 rounded-md hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <X size={13} />
              </button>
            </div>
            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] tabular-nums whitespace-nowrap">
              <span>{parsedResult.wordCount} words</span>
              <span aria-hidden="true">·</span>
              <span>{parsedResult.equationCount} equations</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">
                Ln {cursorPos.line}, Col {cursorPos.col}
              </span>
              {lastSavedAt && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>
                    Auto-saved{' '}
                    {new Date(lastSavedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="hidden md:flex items-center text-xs text-[var(--text-muted)]">
            No file open
          </div>
        )}

        {/* Zone 3: Primary Action */}
        <div className="flex items-center gap-2 shrink-0">
          {activeDoc ? (
            <button
              type="button"
              onClick={handleDownloadTex}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-md bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-[var(--accent-primary-text)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download size={13} />
              <span>Export .tex</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleNewBlankFile}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-md bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-[var(--accent-primary-text)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FilePlus2 size={13} />
              <span>New file</span>
            </button>
          )}
        </div>
      </header>

      {/* Workspace Formatting & View Toolbar */}
      <div className="shrink-0 px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-hairline)] bg-[var(--bg-surface)]">
        {/* Left: Document & LaTeX Formatting Controls */}
        <div className="flex items-center gap-1 flex-wrap">
          <button
            type="button"
            onClick={() => updateSetting('showOutline', !settings.showOutline)}
            aria-pressed={settings.showOutline}
            aria-label="Toggle documents and outline sidebar"
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              settings.showOutline
                ? 'bg-[var(--accent-subtle)] border-[var(--accent-ring)] text-[var(--text-primary)]'
                : 'bg-[var(--bg-elevated)] border-[var(--border-hairline)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            <PanelLeft size={13} />
            <span className="hidden sm:inline">Outline</span>
          </button>

          <button
            type="button"
            onClick={() => setIsTemplatesOpen(true)}
            aria-label="New document or templates"
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border border-[var(--border-hairline)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FilePlus2 size={13} />
            <span className="hidden sm:inline">Templates</span>
          </button>

          {activeDoc && (
            <>
              <span className="h-4 w-px bg-[var(--border-hairline)] mx-1 hidden sm:inline-block" />

              <button
                type="button"
                onClick={() => handleInsertSnippet('\\textbf{$0}')}
                title="Bold (\\textbf{})"
                aria-label="Insert bold text"
                className="p-1.5 rounded-md border border-transparent hover:border-[var(--border-hairline)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <Bold size={14} />
              </button>
              <button
                type="button"
                onClick={() => handleInsertSnippet('\\textit{$0}')}
                title="Italic (\\textit{})"
                aria-label="Insert italic text"
                className="p-1.5 rounded-md border border-transparent hover:border-[var(--border-hairline)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <Italic size={14} />
              </button>
              <button
                type="button"
                onClick={() => handleInsertSnippet('$$0$')}
                title="Inline Math ($ ... $)"
                aria-label="Insert inline math"
                className="px-2 py-1 text-xs font-mono font-semibold rounded-md border border-transparent hover:border-[var(--border-hairline)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] whitespace-nowrap cursor-pointer"
              >
                $x$
              </button>
              <button
                type="button"
                onClick={() => handleInsertSnippet('\\[\n  $0\n\\]')}
                title="Display Math Block (\\[ ... \\])"
                aria-label="Insert display math block"
                className="px-2 py-1 text-xs font-mono font-semibold rounded-md border border-transparent hover:border-[var(--border-hairline)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] whitespace-nowrap cursor-pointer"
              >
                \[ \]
              </button>
              <button
                type="button"
                onClick={() => handleInsertSnippet('\\frac{$0}{}')}
                title="Fraction (\\frac{}{})"
                aria-label="Insert fraction"
                className="px-2 py-1 text-xs font-mono rounded-md border border-transparent hover:border-[var(--border-hairline)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] whitespace-nowrap cursor-pointer"
              >
                a/b
              </button>
              <button
                type="button"
                onClick={() => editorRef.current?.openFindReplace()}
                title="Find & Replace (Ctrl+F)"
                aria-label="Open find and replace"
                className="p-1.5 rounded-md border border-transparent hover:border-[var(--border-hairline)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <Search size={14} />
              </button>
            </>
          )}
        </div>

        {/* Right: View Modes, Symbol Keyboard, Theme Switch, Customize */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {activeDoc && settings.compileMode === 'manual' && (
            <button
              type="button"
              onClick={() => setCompiledSource(activeDoc.content)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-md bg-[var(--accent-primary)] text-[var(--accent-primary-text)] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Play size={12} />
              <span>Compile</span>
            </button>
          )}

          {activeDoc && (
            <>
              {/* View Mode Segmented Control */}
              <div
                role="group"
                aria-label="Workspace view mode"
                className="flex items-center p-0.5 rounded-md bg-[var(--bg-elevated)] border border-[var(--border-hairline)]"
              >
                <button
                  type="button"
                  onClick={() => setViewMode('editor')}
                  aria-pressed={viewMode === 'editor'}
                  className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded whitespace-nowrap cursor-pointer transition-colors ${
                    viewMode === 'editor'
                      ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-text)]'
                      : viewMode === 'split'
                        ? 'bg-[var(--accent-primary)] md:bg-transparent text-[var(--accent-primary-text)] md:text-[var(--text-secondary)] md:hover:text-[var(--text-primary)]'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <SquareCode size={13} />
                  <span className="hidden lg:inline">Editor</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('split')}
                  aria-pressed={viewMode === 'split'}
                  className={`hidden md:flex items-center gap-1 px-2 py-1 text-xs font-medium rounded whitespace-nowrap cursor-pointer transition-colors ${
                    viewMode === 'split'
                      ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-text)]'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <Columns2 size={13} />
                  <span className="hidden lg:inline">Split</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('preview')}
                  aria-pressed={viewMode === 'preview'}
                  className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded whitespace-nowrap cursor-pointer transition-colors ${
                    viewMode === 'preview'
                      ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-text)]'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <Eye size={13} />
                  <span className="hidden lg:inline">Preview</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => updateSetting('showKeyboard', !settings.showKeyboard)}
                aria-pressed={settings.showKeyboard}
                aria-label="Toggle LaTeX symbol keyboard"
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  settings.showKeyboard
                    ? 'bg-[var(--accent-subtle)] border-[var(--accent-ring)] text-[var(--text-primary)]'
                    : 'bg-[var(--bg-elevated)] border-[var(--border-hairline)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Keyboard size={13} />
                <span className="hidden sm:inline">Symbols</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => updateSetting('theme', isDark ? 'light' : 'dark')}
            aria-label={isDark ? 'Switch to Milk White light mode' : 'Switch to Coal Black dark mode'}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border border-[var(--border-hairline)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] whitespace-nowrap shrink-0 cursor-pointer transition-colors"
          >
            {isDark ? <Sun size={13} /> : <Moon size={13} />}
            <span className="hidden sm:inline">{isDark ? 'Milk White' : 'Coal Black'}</span>
          </button>

          {activeDoc && (
            <button
              type="button"
              onClick={() => window.print()}
              aria-label="Print or save PDF"
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border border-[var(--border-hairline)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Printer size={13} />
              <span className="hidden xl:inline">Print / PDF</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsCustomizeOpen(true)}
            aria-label="Open editor customization settings"
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border border-[var(--border-hairline)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] whitespace-nowrap shrink-0 cursor-pointer"
          >
            <SlidersHorizontal size={13} />
            <span>Customize</span>
          </button>
        </div>
      </div>

      {/* Custom LaTeX Symbol Keyboard */}
      {activeDoc && settings.showKeyboard && (
        <SymbolKeyboardToolbar
          onInsertSymbol={handleInsertSymbol}
          recentIds={recentSymbolIds}
          favoriteIds={favoriteSymbolIds}
          onToggleFavorite={handleToggleFavorite}
        />
      )}

      {/* Main Workspace */}
      <main className="flex-1 min-h-0 flex overflow-hidden">
        {settings.showOutline && (
          <OutlineSidebar
            documents={documents}
            activeDocId={activeDocId}
            outline={parsedResult.outline}
            onSelectDoc={setActiveDocId}
            onNewFromTemplate={() => setIsTemplatesOpen(true)}
            onDeleteDoc={handleDeleteDoc}
            onSelectHeading={handleSelectHeading}
            onCloseMobile={() => updateSetting('showOutline', false)}
          />
        )}

        {!activeDoc ? (
          <WelcomeScreen
            recentDocuments={documents}
            onNewFile={handleNewBlankFile}
            onUseTemplate={() => setIsTemplatesOpen(true)}
            onOpenDocument={(id) => setActiveDocId(id)}
          />
        ) : (
          <div
            ref={splitContainerRef}
            className="flex-1 min-w-0 h-full flex overflow-hidden relative"
            style={{ ['--split-pct' as string]: `${splitPercent}%` }}
          >
            {/* Editor Pane */}
            <div
              className={`h-full min-w-0 shrink-0 ${
                viewMode === 'preview'
                  ? 'hidden'
                  : viewMode === 'editor'
                    ? 'w-full'
                    : 'w-full md:w-[var(--split-pct)]'
              }`}
            >
              <LatexEditorPane
                ref={editorRef}
                key={activeDoc.id}
                value={activeDoc.content}
                onChange={updateActiveDocContent}
                settings={settings}
                onCursorChange={(line, col) => setCursorPos({ line, col })}
                onScrollRatioChange={(ratio) => previewRef.current?.scrollToRatio(ratio)}
              />
            </div>

            {/* Draggable Split Resizer */}
            {viewMode === 'split' && (
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize editor and preview panes"
                tabIndex={0}
                onPointerDown={() => {
                  isDraggingRef.current = true;
                  document.body.style.cursor = 'col-resize';
                }}
                onDoubleClick={() => setSplitPercent(50)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowLeft') setSplitPercent((p) => Math.max(25, p - 2));
                  if (e.key === 'ArrowRight') setSplitPercent((p) => Math.min(75, p + 2));
                }}
                className="hidden md:flex w-1.5 shrink-0 cursor-col-resize items-center justify-center bg-[var(--border-hairline)] hover:bg-[var(--accent-primary)] transition-colors"
              />
            )}

            {/* Live Preview Pane */}
            <div
              className={`h-full min-w-0 ${
                viewMode === 'editor'
                  ? 'hidden'
                  : viewMode === 'preview'
                    ? 'w-full'
                    : 'hidden md:block md:flex-1'
              }`}
            >
              <LatexPreviewPane ref={previewRef} parsed={parsedResult} settings={settings} />
            </div>
          </div>
        )}
      </main>

      {/* Customization Slide-over */}
      <CustomizationDrawer
        open={isCustomizeOpen}
        onClose={() => setIsCustomizeOpen(false)}
        settings={settings}
        onUpdate={updateSetting}
        onReset={() => setSettings(DEFAULT_SETTINGS)}
      />

      {/* Document Templates & Import Modal */}
      <TemplatesModal
        open={isTemplatesOpen}
        onClose={() => setIsTemplatesOpen(false)}
        onSelectTemplate={handleSelectTemplate}
        onImportTexFile={handleImportTexFile}
      />
    </div>
  );
}
