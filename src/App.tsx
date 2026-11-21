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
  Redo2,
  Search,
  SlidersHorizontal,
  SquareCode,
  Sun,
  Undo2,
  X,
} from 'lucide-react';
import { CustomizationDrawer } from './components/CustomizationDrawer';
import { LatexEditorPane, type LatexEditorHandle } from './components/LatexEditorPane';
import {
  LatexPreviewPane,
  type ActivePlacementSlot,
  type HeaderPlacementField,
  type LatexPreviewHandle,
} from './components/LatexPreviewPane';
import { OutlineSidebar } from './components/OutlineSidebar';
import { SymbolKeyboardToolbar } from './components/SymbolKeyboardToolbar';
import { TemplatesModal } from './components/TemplatesModal';
import { WelcomeScreen } from './components/WelcomeScreen';
import { BLANK_DOCUMENT_CONTENT, type DocumentTemplate } from './data/templates';
import { LATEX_SYMBOLS } from './data/latexSymbols';
import { DEFAULT_SETTINGS, usePersistentState } from './hooks/usePersistentState';
import {
  extractRawHeaderFields,
  insertAtHeaderField,
} from './latex/graphicalPlacement';
import {
  appendColumnToStructuredRegion,
  appendRowToStructuredRegion,
  insertAtLatexOffset,
  type StructuredRegion,
} from './latex/insertionSlots';
import { parseLatexDocument } from './latex/parser';
import {
  appendSymbolToHeaderValue,
  findPreferredEditableBlockIndex,
  formatSymbolForPreviewInsertion,
  insertLatexAtPreviewSlot,
  insertSnippetIntoExistingBlock,
  insertSymbolIntoExistingBlock,
  isBlockCreatorSymbol,
  isMathInsertionSymbol,
  isMultilineMathEnvSymbol,
  removePreviewBlock,
  replacePreviewBlock,
  swapPreviewBlocks,
  updateHeaderMetadata,
} from './latex/previewMutations';
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

interface HistoryEntry {
  content: string;
  selectedBlockIndex: number | null;
  activeSlot: ActivePlacementSlot | null;
}

interface DocHistoryStack {
  past: HistoryEntry[];
  future: HistoryEntry[];
  lastCoalesceAt: number;
}

const MAX_HISTORY_LENGTH = 100;

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

  const [viewMode, setViewMode] = useState<ViewMode>('preview');
  const [splitPercent, setSplitPercent] = useState(50);
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
  const [isTemplatesOpen, setIsTemplatesOpen] = useState(false);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const [draggingSymbol, setDraggingSymbol] = useState<SymbolItem | null>(null);
  const [selectedBlockIndex, setSelectedBlockIndex] = useState<number | null>(null);
  const [editingBlockIndex, setEditingBlockIndex] = useState<number | null>(null);
  const [activeSlot, setActiveSlot] = useState<ActivePlacementSlot | null>(null);
  const [historyTick, setHistoryTick] = useState(0);

  const setActiveDocId = useCallback((id: string | null) => {
    setActiveDocIdState(id);
    setSelectedBlockIndex(null);
    setEditingBlockIndex(null);
    setActiveSlot(null);
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
  const selectedBlockIndexRef = useRef<number | null>(selectedBlockIndex);
  const activeSlotRef = useRef<ActivePlacementSlot | null>(activeSlot);
  const historyRef = useRef<Record<string, DocHistoryStack>>({});

  activeDocRef.current = activeDoc;
  documentsRef.current = documents;
  selectedBlockIndexRef.current = selectedBlockIndex;
  activeSlotRef.current = activeSlot;

  const handleSelectBlock = useCallback((idx: number | null) => {
    setSelectedBlockIndex(idx);
    setActiveSlot((prev) => (prev && prev.blockIndex === idx ? prev : null));
  }, []);

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

  // Keep compiledSource updated for debounced / manual compile modes
  useEffect(() => {
    const content = activeDoc?.content ?? '';
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

  const sourceToParse =
    settings.compileMode === 'instant' ? (activeDoc?.content ?? '') : compiledSource;

  const rawHeaderFields = useMemo(
    () =>
      activeDoc
        ? extractRawHeaderFields(activeDoc.content)
        : { title: '', author: '', date: '' },
    [activeDoc]
  );

  const parsedResult = useMemo(
    () =>
      activeDoc
        ? parseLatexDocument(sourceToParse, {
            equationNumbering: settings.equationNumbering,
          })
        : {
            html: '',
            blocks: [],
            outline: [],
            diagnostics: [],
            wordCount: 0,
            equationCount: 0,
            title: '',
            author: '',
            date: '',
          },
    [activeDoc, sourceToParse, settings.equationNumbering]
  );

  const updateSetting = useCallback(
    <K extends keyof EditorSettings>(key: K, value: EditorSettings[K]) => {
      setSettings((prev) => ({ ...prev, [key]: value }));
    },
    [setSettings]
  );

  const applyDocumentContent = useCallback(
    (
      nextContent: string,
      options?: {
        recordHistory?: boolean;
        coalesce?: boolean;
        nextSelectedBlockIndex?: number | null;
        nextActiveSlot?: ActivePlacementSlot | null;
        nextEditingBlockIndex?: number | null;
      }
    ) => {
      const current = activeDocRef.current;
      if (!current) return;

      const now = Date.now();
      const shouldRecord = options?.recordHistory !== false;

      if (shouldRecord && nextContent !== current.content) {
        const existing = historyRef.current[current.id] ?? {
          past: [],
          future: [],
          lastCoalesceAt: 0,
        };
        const shouldCoalesce =
          Boolean(options?.coalesce) &&
          existing.past.length > 0 &&
          now - existing.lastCoalesceAt < 700;

        if (!shouldCoalesce) {
          existing.past.push({
            content: current.content,
            selectedBlockIndex: selectedBlockIndexRef.current,
            activeSlot: activeSlotRef.current,
          });
          if (existing.past.length > MAX_HISTORY_LENGTH) {
            existing.past.shift();
          }
        }
        existing.future = [];
        existing.lastCoalesceAt = options?.coalesce ? now : 0;
        historyRef.current[current.id] = existing;
        setHistoryTick((t) => t + 1);
      }

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

      if (settings.compileMode === 'manual') {
        setCompiledSource(nextContent);
      }
      if (options?.nextSelectedBlockIndex !== undefined) {
        setSelectedBlockIndex(options.nextSelectedBlockIndex);
      }
      if (options?.nextActiveSlot !== undefined) {
        setActiveSlot(options.nextActiveSlot);
      }
      if (options?.nextEditingBlockIndex !== undefined) {
        setEditingBlockIndex(options.nextEditingBlockIndex);
      }
    },
    [settings.compileMode]
  );

  const updateActiveDocContent = useCallback(
    (nextContent: string) => {
      applyDocumentContent(nextContent, { recordHistory: true, coalesce: true });
    },
    [applyDocumentContent]
  );

  const handleUndo = useCallback(() => {
    const current = activeDocRef.current;
    if (!current) return;
    const stack = historyRef.current[current.id];
    if (!stack || stack.past.length === 0) return;

    const prevEntry = stack.past.pop()!;
    stack.future.push({
      content: current.content,
      selectedBlockIndex: selectedBlockIndexRef.current,
      activeSlot: activeSlotRef.current,
    });
    stack.lastCoalesceAt = 0;
    setHistoryTick((t) => t + 1);

    applyDocumentContent(prevEntry.content, {
      recordHistory: false,
      nextSelectedBlockIndex: prevEntry.selectedBlockIndex,
      nextActiveSlot: prevEntry.activeSlot,
      nextEditingBlockIndex: null,
    });
  }, [applyDocumentContent]);

  const handleRedo = useCallback(() => {
    const current = activeDocRef.current;
    if (!current) return;
    const stack = historyRef.current[current.id];
    if (!stack || stack.future.length === 0) return;

    const nextEntry = stack.future.pop()!;
    stack.past.push({
      content: current.content,
      selectedBlockIndex: selectedBlockIndexRef.current,
      activeSlot: activeSlotRef.current,
    });
    stack.lastCoalesceAt = 0;
    setHistoryTick((t) => t + 1);

    applyDocumentContent(nextEntry.content, {
      recordHistory: false,
      nextSelectedBlockIndex: nextEntry.selectedBlockIndex,
      nextActiveSlot: nextEntry.activeSlot,
      nextEditingBlockIndex: null,
    });
  }, [applyDocumentContent]);

  // Global Ctrl+Z / Cmd+Z Undo and Ctrl+Shift+Z / Ctrl+Y Redo
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!activeDocRef.current) return;
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;

      const activeEl = document.activeElement;
      if (activeEl?.closest('.cm-editor')) {
        return;
      }
      if (activeEl?.getAttribute('aria-label') === 'Search LaTeX symbols') {
        return;
      }

      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo, handleRedo]);

  const currentHistory = activeDoc ? historyRef.current[activeDoc.id] : undefined;
  const canUndo = Boolean(currentHistory && currentHistory.past.length > 0 && historyTick >= 0);
  const canRedo = Boolean(currentHistory && currentHistory.future.length > 0 && historyTick >= 0);

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

  const applyHeaderFieldSnippet = useCallback(
    (
      source: string,
      field: HeaderPlacementField,
      snippet: string,
      isMath: boolean,
      fieldOffset?: number
    ): { nextSource: string; nextFieldOffset: number } => {
      if (fieldOffset !== undefined) {
        return insertAtHeaderField(source, field, fieldOffset, snippet, isMath);
      }
      const currentFields = extractRawHeaderFields(source);
      const updatedValue = appendSymbolToHeaderValue(currentFields[field], snippet, isMath);
      const nextSource = updateHeaderMetadata(source, {
        ...currentFields,
        [field]: updatedValue,
      });
      return {
        nextSource,
        nextFieldOffset: updatedValue.length,
      };
    },
    []
  );

  const handleInsertSnippet = useCallback(
    (snippet: string, previewFallback?: string) => {
      if (viewMode === 'preview') {
        if (previewRef.current?.insertSnippetInActiveEditor(snippet)) {
          return;
        }
        const current = activeDocRef.current;
        if (!current) return;

        const isExplicitDisplayMath = snippet.startsWith('\\[');
        if (
          !isExplicitDisplayMath &&
          activeSlot &&
          parsedResult.blocks[activeSlot.blockIndex]
        ) {
          const targetBlock = parsedResult.blocks[activeSlot.blockIndex];
          const isMath = snippet.includes('\\frac') || snippet === '$$0$';
          const cleanSnippet = snippet === '$$0$' ? '$x$' : snippet;
          if (targetBlock.kind === 'title' || activeSlot.headerField) {
            const field = activeSlot.headerField ?? 'title';
            const { nextSource, nextFieldOffset } = applyHeaderFieldSnippet(
              current.content,
              field,
              cleanSnippet,
              isMath,
              activeSlot.fieldOffset
            );
            applyDocumentContent(nextSource, {
              recordHistory: true,
              nextSelectedBlockIndex: activeSlot.blockIndex,
              nextActiveSlot: {
                ...activeSlot,
                fieldOffset: nextFieldOffset,
              },
            });
            previewRef.current?.scrollToBlock(activeSlot.blockIndex);
            return;
          }
          const { nextLatex, nextOffset } = insertAtLatexOffset(
            targetBlock.rawLatex,
            activeSlot.offset,
            targetBlock.kind,
            cleanSnippet,
            isMath
          );
          const nextSource = replacePreviewBlock(current.content, targetBlock, nextLatex);
          applyDocumentContent(nextSource, {
            recordHistory: true,
            nextSelectedBlockIndex: activeSlot.blockIndex,
            nextActiveSlot: { ...activeSlot, offset: nextOffset },
          });
          previewRef.current?.scrollToBlock(activeSlot.blockIndex);
          return;
        }

        const targetIdx = isExplicitDisplayMath
          ? null
          : findPreferredEditableBlockIndex(parsedResult.blocks, selectedBlockIndex);

        if (targetIdx !== null && parsedResult.blocks[targetIdx]) {
          const isMath = snippet.includes('\\frac') || snippet === '$$0$';
          const cleanSnippet = snippet === '$$0$' ? '$x$' : snippet;
          const targetBlock = parsedResult.blocks[targetIdx];
          if (targetBlock.kind === 'title') {
            const { nextSource } = applyHeaderFieldSnippet(
              current.content,
              'title',
              cleanSnippet,
              isMath
            );
            applyDocumentContent(nextSource, {
              recordHistory: true,
              nextSelectedBlockIndex: targetIdx,
            });
            previewRef.current?.scrollToBlock(targetIdx);
            return;
          }
          const nextSource = insertSnippetIntoExistingBlock(
            current.content,
            targetBlock,
            cleanSnippet,
            isMath
          );
          applyDocumentContent(nextSource, {
            recordHistory: true,
            nextSelectedBlockIndex: targetIdx,
          });
          previewRef.current?.scrollToBlock(targetIdx);
          return;
        }

        const blockText = previewFallback ?? snippet.replace(/\$0/g, '').trim();
        const nextSource = insertLatexAtPreviewSlot(
          current.content,
          parsedResult.blocks,
          parsedResult.blocks.length,
          blockText
        );
        const newIdx = parsedResult.blocks.length;
        applyDocumentContent(nextSource, {
          recordHistory: true,
          nextSelectedBlockIndex: newIdx,
          nextEditingBlockIndex: null,
          nextActiveSlot: null,
        });
        previewRef.current?.scrollToBlock(newIdx);
        return;
      }

      if (previewRef.current?.insertSnippetInActiveEditor(snippet)) {
        return;
      }
      editorRef.current?.insertSnippet(snippet);
    },
    [
      viewMode,
      activeSlot,
      parsedResult.blocks,
      selectedBlockIndex,
      applyDocumentContent,
      applyHeaderFieldSnippet,
    ]
  );

  const handleInsertSymbol = useCallback(
    (sym: SymbolItem) => {
      setRecentSymbolIds((prev) => [sym.id, ...prev.filter((id) => id !== sym.id)].slice(0, 16));

      if (previewRef.current?.insertSnippetInActiveEditor(sym.snippet)) {
        return;
      }

      if (viewMode === 'preview') {
        const current = activeDocRef.current;
        if (!current) return;

        if (sym.id === 'maketitle') {
          const existingTitleIdx = parsedResult.blocks.findIndex((b) => b.kind === 'title');
          if (existingTitleIdx >= 0) {
            setSelectedBlockIndex(existingTitleIdx);
            setEditingBlockIndex(existingTitleIdx);
            setActiveSlot(null);
            previewRef.current?.scrollToBlock(existingTitleIdx);
            return;
          }
          const nextSource = insertLatexAtPreviewSlot(
            current.content,
            parsedResult.blocks,
            0,
            '\\maketitle'
          );
          applyDocumentContent(nextSource, {
            recordHistory: true,
            nextSelectedBlockIndex: 0,
            nextEditingBlockIndex: 0,
            nextActiveSlot: null,
          });
          previewRef.current?.scrollToBlock(0);
          return;
        }

        const activeBlock =
          activeSlot && parsedResult.blocks[activeSlot.blockIndex]
            ? parsedResult.blocks[activeSlot.blockIndex]
            : null;
        const canNestMultilineInActiveSlot = Boolean(
          activeBlock &&
            activeBlock.kind === 'math' &&
            !/\\begin\{(?:[pbvBV]?matrix|smallmatrix|cases)\}/.test(activeBlock.rawLatex)
        );
        const forceNewMathBlock =
          isMultilineMathEnvSymbol(sym) && !canNestMultilineInActiveSlot;

        if (!isBlockCreatorSymbol(sym) && !forceNewMathBlock) {
          if (activeSlot && parsedResult.blocks[activeSlot.blockIndex]) {
            const targetBlock = parsedResult.blocks[activeSlot.blockIndex];
            const snippetToInsert = sym.id === 'inlineMath' ? '$x$' : sym.snippet;
            if (targetBlock.kind === 'title' || activeSlot.headerField) {
              const field = activeSlot.headerField ?? 'title';
              const { nextSource, nextFieldOffset } = applyHeaderFieldSnippet(
                current.content,
                field,
                snippetToInsert,
                isMathInsertionSymbol(sym),
                activeSlot.fieldOffset
              );
              applyDocumentContent(nextSource, {
                recordHistory: true,
                nextSelectedBlockIndex: activeSlot.blockIndex,
                nextActiveSlot: {
                  ...activeSlot,
                  fieldOffset: nextFieldOffset,
                },
              });
              previewRef.current?.scrollToBlock(activeSlot.blockIndex);
              return;
            }
            const { nextLatex, nextOffset } = insertAtLatexOffset(
              targetBlock.rawLatex,
              activeSlot.offset,
              targetBlock.kind,
              snippetToInsert,
              isMathInsertionSymbol(sym)
            );
            const nextSource = replacePreviewBlock(current.content, targetBlock, nextLatex);
            applyDocumentContent(nextSource, {
              recordHistory: true,
              nextSelectedBlockIndex: activeSlot.blockIndex,
              nextActiveSlot: { ...activeSlot, offset: nextOffset },
            });
            previewRef.current?.scrollToBlock(activeSlot.blockIndex);
            return;
          }

          const targetIdx = findPreferredEditableBlockIndex(
            parsedResult.blocks,
            selectedBlockIndex
          );
          if (targetIdx !== null && parsedResult.blocks[targetIdx]) {
            const targetBlock = parsedResult.blocks[targetIdx];
            if (targetBlock.kind === 'title') {
              const snippetToInsert = sym.id === 'inlineMath' ? '$x$' : sym.snippet;
              const { nextSource } = applyHeaderFieldSnippet(
                current.content,
                'title',
                snippetToInsert,
                isMathInsertionSymbol(sym)
              );
              applyDocumentContent(nextSource, {
                recordHistory: true,
                nextSelectedBlockIndex: targetIdx,
              });
              previewRef.current?.scrollToBlock(targetIdx);
              return;
            }
            const nextSource = insertSymbolIntoExistingBlock(
              current.content,
              targetBlock,
              sym
            );
            applyDocumentContent(nextSource, {
              recordHistory: true,
              nextSelectedBlockIndex: targetIdx,
            });
            previewRef.current?.scrollToBlock(targetIdx);
            return;
          }
        }

        const formatted = formatSymbolForPreviewInsertion(sym);
        const nextSource = insertLatexAtPreviewSlot(
          current.content,
          parsedResult.blocks,
          parsedResult.blocks.length,
          formatted
        );
        const newIdx = parsedResult.blocks.length;
        applyDocumentContent(nextSource, {
          recordHistory: true,
          nextSelectedBlockIndex: newIdx,
          nextEditingBlockIndex: null,
          nextActiveSlot: null,
        });
        previewRef.current?.scrollToBlock(newIdx);
        return;
      }

      editorRef.current?.insertSnippet(sym.snippet);
    },
    [
      viewMode,
      activeSlot,
      parsedResult.blocks,
      selectedBlockIndex,
      applyDocumentContent,
      applyHeaderFieldSnippet,
      setRecentSymbolIds,
    ]
  );

  const handleDropSymbolIntoBlock = useCallback(
    (blockIndex: number, symbolId?: string) => {
      const sym =
        (symbolId ? LATEX_SYMBOLS.find((s) => s.id === symbolId) : undefined) ?? draggingSymbol;
      setDraggingSymbol(null);
      if (!sym) return;
      const current = activeDocRef.current;
      const targetBlock = parsedResult.blocks[blockIndex];
      if (!current || !targetBlock) return;

      const nextSource =
        targetBlock.kind === 'title'
          ? applyHeaderFieldSnippet(
              current.content,
              'title',
              sym.id === 'inlineMath' ? '$x$' : sym.snippet,
              isMathInsertionSymbol(sym)
            ).nextSource
          : insertSymbolIntoExistingBlock(current.content, targetBlock, sym);
      setRecentSymbolIds((prev) => [sym.id, ...prev.filter((id) => id !== sym.id)].slice(0, 16));
      applyDocumentContent(nextSource, {
        recordHistory: true,
        nextSelectedBlockIndex: blockIndex,
        nextEditingBlockIndex: null,
      });
      previewRef.current?.scrollToBlock(blockIndex);
    },
    [
      draggingSymbol,
      parsedResult.blocks,
      applyDocumentContent,
      applyHeaderFieldSnippet,
      setRecentSymbolIds,
    ]
  );

  const handleDropSymbolAtOffset = useCallback(
    (
      blockIndex: number,
      offset: number,
      symbolId?: string,
      headerField?: HeaderPlacementField,
      fieldOffset?: number
    ) => {
      const sym =
        (symbolId ? LATEX_SYMBOLS.find((s) => s.id === symbolId) : undefined) ?? draggingSymbol;
      setDraggingSymbol(null);
      if (!sym) return;
      const current = activeDocRef.current;
      const targetBlock = parsedResult.blocks[blockIndex];
      if (!current || !targetBlock) return;

      const snippetToInsert = sym.id === 'inlineMath' ? '$x$' : sym.snippet;
      setRecentSymbolIds((prev) => [sym.id, ...prev.filter((id) => id !== sym.id)].slice(0, 16));

      if (targetBlock.kind === 'title' || headerField) {
        const field: HeaderPlacementField =
          headerField ?? (offset === 1 ? 'author' : offset === 2 ? 'date' : 'title');
        const label =
          field === 'author' ? 'Description' : field === 'date' ? 'Date' : 'Header title';
        const { nextSource, nextFieldOffset } = applyHeaderFieldSnippet(
          current.content,
          field,
          snippetToInsert,
          isMathInsertionSymbol(sym),
          fieldOffset
        );
        applyDocumentContent(nextSource, {
          recordHistory: true,
          nextSelectedBlockIndex: blockIndex,
          nextEditingBlockIndex: null,
          nextActiveSlot: {
            blockIndex,
            offset,
            label,
            headerField: field,
            fieldOffset: nextFieldOffset,
          },
        });
        previewRef.current?.scrollToBlock(blockIndex);
        return;
      }

      const { nextLatex, nextOffset } = insertAtLatexOffset(
        targetBlock.rawLatex,
        offset,
        targetBlock.kind,
        snippetToInsert,
        isMathInsertionSymbol(sym)
      );
      const nextSource = replacePreviewBlock(current.content, targetBlock, nextLatex);
      applyDocumentContent(nextSource, {
        recordHistory: true,
        nextSelectedBlockIndex: blockIndex,
        nextEditingBlockIndex: null,
        nextActiveSlot: {
          blockIndex,
          offset: nextOffset,
          label: `After ${sym.label}`,
        },
      });
      previewRef.current?.scrollToBlock(blockIndex);
    },
    [
      draggingSymbol,
      parsedResult.blocks,
      applyDocumentContent,
      applyHeaderFieldSnippet,
      setRecentSymbolIds,
    ]
  );

  const handleAppendRegionRow = useCallback(
    (blockIndex: number, region: StructuredRegion) => {
      const current = activeDocRef.current;
      const targetBlock = parsedResult.blocks[blockIndex];
      if (!current || !targetBlock) return;

      const nextBlockLatex = appendRowToStructuredRegion(targetBlock.rawLatex, region);
      const nextSource = replacePreviewBlock(current.content, targetBlock, nextBlockLatex);
      applyDocumentContent(nextSource, {
        recordHistory: true,
        nextSelectedBlockIndex: blockIndex,
      });
    },
    [parsedResult.blocks, applyDocumentContent]
  );

  const handleAppendRegionColumn = useCallback(
    (blockIndex: number, region: StructuredRegion) => {
      const current = activeDocRef.current;
      const targetBlock = parsedResult.blocks[blockIndex];
      if (!current || !targetBlock) return;

      const nextBlockLatex = appendColumnToStructuredRegion(targetBlock.rawLatex, region);
      const nextSource = replacePreviewBlock(current.content, targetBlock, nextBlockLatex);
      applyDocumentContent(nextSource, {
        recordHistory: true,
        nextSelectedBlockIndex: blockIndex,
      });
    },
    [parsedResult.blocks, applyDocumentContent]
  );

  const handleDropSymbolAtSlot = useCallback(
    (slotIndex: number, symbolId?: string) => {
      const sym =
        (symbolId ? LATEX_SYMBOLS.find((s) => s.id === symbolId) : undefined) ?? draggingSymbol;
      setDraggingSymbol(null);
      if (!sym) return;
      const current = activeDocRef.current;
      if (!current) return;

      if (sym.id === 'maketitle') {
        const existingTitleIdx = parsedResult.blocks.findIndex((b) => b.kind === 'title');
        if (existingTitleIdx >= 0) {
          setSelectedBlockIndex(existingTitleIdx);
          setEditingBlockIndex(existingTitleIdx);
          setActiveSlot(null);
          previewRef.current?.scrollToBlock(existingTitleIdx);
          return;
        }
      }

      const formatted = formatSymbolForPreviewInsertion(sym);
      const nextSource = insertLatexAtPreviewSlot(
        current.content,
        parsedResult.blocks,
        slotIndex,
        formatted
      );
      setRecentSymbolIds((prev) => [sym.id, ...prev.filter((id) => id !== sym.id)].slice(0, 16));
      applyDocumentContent(nextSource, {
        recordHistory: true,
        nextSelectedBlockIndex: slotIndex,
        nextEditingBlockIndex: sym.id === 'maketitle' ? slotIndex : null,
        nextActiveSlot: null,
      });
      previewRef.current?.scrollToBlock(slotIndex);
    },
    [draggingSymbol, parsedResult.blocks, applyDocumentContent, setRecentSymbolIds]
  );

  const handleUpdateBlockLatex = useCallback(
    (index: number, nextLatex: string) => {
      const current = activeDocRef.current;
      const block = parsedResult.blocks[index];
      if (!current || !block) return;
      const nextSource = replacePreviewBlock(current.content, block, nextLatex);
      applyDocumentContent(nextSource, {
        recordHistory: true,
        coalesce: true,
        ...(nextLatex.trim()
          ? {}
          : { nextEditingBlockIndex: null, nextSelectedBlockIndex: null, nextActiveSlot: null }),
      });
    },
    [parsedResult.blocks, applyDocumentContent]
  );

  const handleRemoveBlock = useCallback(
    (index: number) => {
      const current = activeDocRef.current;
      const block = parsedResult.blocks[index];
      if (!current || !block) return;
      const nextSource = removePreviewBlock(current.content, block);
      applyDocumentContent(nextSource, {
        recordHistory: true,
        nextEditingBlockIndex: null,
        nextSelectedBlockIndex: null,
        nextActiveSlot: null,
      });
    },
    [parsedResult.blocks, applyDocumentContent]
  );

  const handleMoveBlock = useCallback(
    (index: number, direction: 'up' | 'down') => {
      const current = activeDocRef.current;
      if (!current) return;
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= parsedResult.blocks.length) return;
      const nextSource = swapPreviewBlocks(
        current.content,
        parsedResult.blocks,
        index,
        targetIndex
      );
      applyDocumentContent(nextSource, {
        recordHistory: true,
        nextSelectedBlockIndex: targetIndex,
        nextEditingBlockIndex: null,
        nextActiveSlot: null,
      });
      previewRef.current?.scrollToBlock(targetIndex);
    },
    [parsedResult.blocks, applyDocumentContent]
  );

  const handleUpdateHeader = useCallback(
    (fields: { title: string; author: string; date: string }) => {
      const current = activeDocRef.current;
      if (!current) return;
      const nextSource = updateHeaderMetadata(current.content, fields);
      applyDocumentContent(nextSource, { recordHistory: true, coalesce: true });
    },
    [applyDocumentContent]
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
    const untitledCount = documentsRef.current.filter((d) =>
      d.title.startsWith('Untitled')
    ).length;
    const filename = untitledCount === 0 ? 'Untitled.tex' : `Untitled-${untitledCount + 1}.tex`;
    createDocumentAndOpen(filename, BLANK_DOCUMENT_CONTENT);
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
            aria-label="Toggle document sidebar"
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              settings.showOutline
                ? 'bg-[var(--accent-subtle)] border-[var(--accent-ring)] text-[var(--text-primary)]'
                : 'bg-[var(--bg-elevated)] border-[var(--border-hairline)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            <PanelLeft size={13} />
            <span className="hidden sm:inline">Sidebar</span>
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
                disabled={!canUndo}
                onClick={handleUndo}
                title="Undo (Ctrl+Z)"
                aria-label="Undo (Ctrl+Z)"
                className="p-1.5 rounded-md border border-transparent hover:border-[var(--border-hairline)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer"
              >
                <Undo2 size={14} />
              </button>
              <button
                type="button"
                disabled={!canRedo}
                onClick={handleRedo}
                title="Redo (Ctrl+Y)"
                aria-label="Redo (Ctrl+Y)"
                className="p-1.5 rounded-md border border-transparent hover:border-[var(--border-hairline)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer"
              >
                <Redo2 size={14} />
              </button>

              <span className="h-4 w-px bg-[var(--border-hairline)] mx-1 hidden sm:inline-block" />

              <button
                type="button"
                onClick={() => handleInsertSnippet('\\textbf{$0}', '\\textbf{Bold text}')}
                title="Bold (\\textbf{})"
                aria-label="Insert bold text"
                className="p-1.5 rounded-md border border-transparent hover:border-[var(--border-hairline)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <Bold size={14} />
              </button>
              <button
                type="button"
                onClick={() => handleInsertSnippet('\\textit{$0}', '\\textit{Italic text}')}
                title="Italic (\\textit{})"
                aria-label="Insert italic text"
                className="p-1.5 rounded-md border border-transparent hover:border-[var(--border-hairline)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <Italic size={14} />
              </button>
              <button
                type="button"
                onClick={() => handleInsertSnippet('$$0$', '$x + y$')}
                title="Inline Math ($ ... $)"
                aria-label="Insert inline math"
                className="px-2 py-1 text-xs font-mono font-semibold rounded-md border border-transparent hover:border-[var(--border-hairline)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] whitespace-nowrap cursor-pointer"
              >
                $x$
              </button>
              <button
                type="button"
                onClick={() => handleInsertSnippet('\\[\n  $0\n\\]', '\\[\n  x = 0\n\\]')}
                title="Display Math Block (\\[ ... \\])"
                aria-label="Insert display math block"
                className="px-2 py-1 text-xs font-mono font-semibold rounded-md border border-transparent hover:border-[var(--border-hairline)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] whitespace-nowrap cursor-pointer"
              >
                \[ \]
              </button>
              <button
                type="button"
                onClick={() => handleInsertSnippet('\\frac{$0}{}', '\\[\n  \\frac{a}{b}\n\\]')}
                title="Fraction (\\frac{}{})"
                aria-label="Insert fraction"
                className="px-2 py-1 text-xs font-mono rounded-md border border-transparent hover:border-[var(--border-hairline)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] whitespace-nowrap cursor-pointer"
              >
                a/b
              </button>
              <button
                type="button"
                onClick={() => {
                  if (viewMode === 'preview') {
                    setViewMode('split');
                    window.requestAnimationFrame(() => editorRef.current?.openFindReplace());
                  } else {
                    editorRef.current?.openFindReplace();
                  }
                }}
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
          onDragSymbolStart={(sym) => setDraggingSymbol(sym)}
          onDragSymbolEnd={() => setDraggingSymbol(null)}
          recentIds={recentSymbolIds}
          favoriteIds={favoriteSymbolIds}
          onToggleFavorite={handleToggleFavorite}
        />
      )}

      {/* Main Workspace */}
      <main className="flex-1 min-h-0 flex overflow-hidden">
        {settings.showOutline && (
          <OutlineSidebar
            hasActiveDoc={Boolean(activeDoc)}
            documents={documents}
            activeDocId={activeDocId}
            outline={parsedResult.outline}
            headerFields={{
              title:
                activeDoc &&
                parsedResult.title === 'Untitled Document' &&
                !activeDoc.content.includes('\\title{Untitled Document}')
                  ? ''
                  : parsedResult.title,
              author: parsedResult.author,
              date: parsedResult.date,
            }}
            blocks={parsedResult.blocks}
            selectedBlockIndex={selectedBlockIndex}
            onSelectDoc={setActiveDocId}
            onNewFromTemplate={() => setIsTemplatesOpen(true)}
            onDeleteDoc={handleDeleteDoc}
            onSelectHeading={handleSelectHeading}
            onUpdateHeader={handleUpdateHeader}
            onSelectBlock={(idx) => {
              handleSelectBlock(idx);
              if (idx !== null) {
                previewRef.current?.scrollToBlock(idx);
              }
            }}
            onEditBlock={(idx) => {
              handleSelectBlock(idx);
              setEditingBlockIndex(idx);
              if (idx !== null) {
                previewRef.current?.scrollToBlock(idx);
              }
            }}
            onRemoveBlock={handleRemoveBlock}
            onInsertSectionSymbol={handleInsertSymbol}
            onDragSymbolStart={(sym) => setDraggingSymbol(sym)}
            onDragSymbolEnd={() => setDraggingSymbol(null)}
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
              <LatexPreviewPane
                ref={previewRef}
                parsed={parsedResult}
                rawHeaderFields={rawHeaderFields}
                settings={settings}
                draggingSymbol={draggingSymbol}
                selectedBlockIndex={selectedBlockIndex}
                editingBlockIndex={editingBlockIndex}
                activeSlot={activeSlot}
                onSelectBlock={handleSelectBlock}
                onStartEditBlock={setEditingBlockIndex}
                onSelectActiveSlot={setActiveSlot}
                onDropSymbolAtSlot={handleDropSymbolAtSlot}
                onDropSymbolIntoBlock={handleDropSymbolIntoBlock}
                onDropSymbolAtOffset={handleDropSymbolAtOffset}
                onAppendRegionRow={handleAppendRegionRow}
                onAppendRegionColumn={handleAppendRegionColumn}
                onUpdateBlockLatex={handleUpdateBlockLatex}
                onRemoveBlock={handleRemoveBlock}
                onMoveBlock={handleMoveBlock}
                onUpdateHeader={handleUpdateHeader}
              />
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
        onNewBlankDocument={handleNewBlankFile}
        onSelectTemplate={handleSelectTemplate}
        onImportTexFile={handleImportTexFile}
      />
    </div>
  );
}
