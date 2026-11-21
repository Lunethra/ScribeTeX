import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronUp,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { applyLatexSnippet } from '../editor/snippetUtils';
import {
  resolveDoubleClickTargetInBlock,
  resolveGraphicalHitInBlock,
  type HeaderFieldKey,
  type ScopedEditTarget,
} from '../latex/graphicalPlacement';
import {
  extractStructuredRegions,
  type StructuredRegion,
} from '../latex/insertionSlots';
import { isBlockCreatorSymbol } from '../latex/previewMutations';
import type { EditorSettings, ParsedLaTeXResult, PreviewBlock, SymbolItem } from '../types/editor';

export type HeaderPlacementField = HeaderFieldKey;

export interface ActivePlacementSlot {
  blockIndex: number;
  offset: number;
  label: string;
  headerField?: HeaderPlacementField;
  fieldOffset?: number;
}

export interface LatexPreviewHandle {
  scrollToRatio: (ratio: number) => void;
  scrollToHeading: (headingId: string) => void;
  scrollToBlock: (blockIndex: number) => void;
  insertSnippetInActiveEditor: (snippet: string) => boolean;
}

interface ScopedEditState {
  blockIndex: number;
  startOffset: number;
  endOffset: number;
  initialCode: string;
  draftCode: string;
  label: string;
  headerField?: HeaderPlacementField;
  parentScope?: {
    startOffset: number;
    endOffset: number;
    label: string;
    code: string;
  };
}

interface LatexPreviewPaneProps {
  parsed: ParsedLaTeXResult;
  rawHeaderFields: { title: string; author: string; date: string };
  settings: EditorSettings;
  draggingSymbol: SymbolItem | null;
  selectedBlockIndex: number | null;
  editingBlockIndex: number | null;
  activeSlot: ActivePlacementSlot | null;
  onSelectBlock: (index: number | null) => void;
  onStartEditBlock: (index: number | null) => void;
  onSelectActiveSlot: (slot: ActivePlacementSlot | null) => void;
  onDropSymbolAtSlot: (slotIndex: number, symbolId?: string) => void;
  onDropSymbolIntoBlock: (blockIndex: number, symbolId?: string) => void;
  onDropSymbolAtOffset: (
    blockIndex: number,
    offset: number,
    symbolId?: string,
    headerField?: HeaderPlacementField,
    fieldOffset?: number
  ) => void;
  onAppendRegionRow: (blockIndex: number, region: StructuredRegion) => void;
  onAppendRegionColumn: (blockIndex: number, region: StructuredRegion) => void;
  onUpdateBlockLatex: (index: number, nextLatex: string) => void;
  onRemoveBlock: (index: number) => void;
  onMoveBlock: (index: number, direction: 'up' | 'down') => void;
  onUpdateHeader: (fields: { title: string; author: string; date: string }) => void;
}

function DropSlotIndicator() {
  return (
    <div
      data-testid="preview-drop-indicator"
      aria-label="Drop insertion line"
      aria-live="polite"
      className="pointer-events-none relative h-0 my-0 z-30 print:hidden"
    >
      <div className="preview-drop-slot absolute inset-x-0 top-0 -translate-y-1/2 flex items-center">
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)] shrink-0" />
        <div className="flex-1 border-t-2 border-dotted border-[var(--accent-primary)]" />
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)] shrink-0" />
      </div>
    </div>
  );
}

function getHeadingCommand(rawLatex: string): 'section' | 'subsection' | 'subsubsection' | null {
  const match = rawLatex.match(/^\\(section|subsection|subsubsection)\s*\{/);
  if (!match) return null;
  return match[1] as 'section' | 'subsection' | 'subsubsection';
}

function switchHeadingCommand(
  rawLatex: string,
  nextCmd: 'section' | 'subsection' | 'subsubsection'
): string {
  return rawLatex.replace(/^\\(section|subsection|subsubsection)(\*?)\s*\{/, `\\${nextCmd}$2{`);
}

export const LatexPreviewPane = forwardRef<LatexPreviewHandle, LatexPreviewPaneProps>(
  function LatexPreviewPane(
    {
      parsed,
      rawHeaderFields,
      settings,
      draggingSymbol,
      selectedBlockIndex,
      editingBlockIndex,
      activeSlot,
      onSelectBlock,
      onStartEditBlock,
      onSelectActiveSlot,
      onDropSymbolAtSlot,
      onDropSymbolIntoBlock,
      onDropSymbolAtOffset,
      onAppendRegionRow,
      onAppendRegionColumn,
      onUpdateBlockLatex,
      onRemoveBlock,
      onMoveBlock,
      onUpdateHeader,
    },
    ref
  ) {
    const scrollerRef = useRef<HTMLDivElement | null>(null);
    const articleRef = useRef<HTMLElement | null>(null);
    const inlineTextareaRef = useRef<HTMLTextAreaElement | null>(null);
    const scopedInputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

    const [showErrors, setShowErrors] = useState(false);
    const [hoveredBlockIndex, setHoveredBlockIndex] = useState<number | null>(null);
    const [dropIndex, setDropIndex] = useState<number | null>(null);
    const [dropTargetBlockIndex, setDropTargetBlockIndex] = useState<number | null>(null);
    const [dropTargetSlot, setDropTargetSlot] = useState<{
      blockIndex: number;
      offset: number;
      headerField?: HeaderPlacementField;
      fieldOffset?: number;
      label?: string;
    } | null>(null);
    const [visualCaret, setVisualCaret] = useState<{
      blockIndex: number;
      left: number;
      top: number;
      height: number;
      isDrop: boolean;
    } | null>(null);
    const [scopedEdit, setScopedEdit] = useState<ScopedEditState | null>(null);

    // Local draft state for smooth inline editing without losing caret or restoring on cancel
    const [draftLatex, setDraftLatex] = useState('');
    const [initialEditLatex, setInitialEditLatex] = useState('');
    const [headerDraft, setHeaderDraft] = useState({ title: '', author: '', date: '' });
    const [initialHeaderDraft, setInitialHeaderDraft] = useState({
      title: '',
      author: '',
      date: '',
    });

    const prevEditingRef = useRef<number | null>(null);
    const prevSelectedHeaderRef = useRef<number | null>(null);
    const pendingCaretValueRef = useRef<string | null>(null);
    const pendingScopedFocusRef = useRef(false);
    const pendingDblClickRef = useRef<{
      blockIndex: number;
      clientX: number;
      clientY: number;
      time: number;
      canShowInfoPanel: boolean;
      scoped: ScopedEditTarget | null;
    } | null>(null);

    useEffect(() => {
      const selectedBlk =
        selectedBlockIndex !== null ? parsed.blocks[selectedBlockIndex] ?? null : null;
      if (selectedBlk?.kind === 'title' && selectedBlockIndex !== null) {
        const synced = {
          title: rawHeaderFields.title,
          author: rawHeaderFields.author,
          date: rawHeaderFields.date,
        };
        setHeaderDraft(synced);
        if (prevSelectedHeaderRef.current !== selectedBlockIndex) {
          prevSelectedHeaderRef.current = selectedBlockIndex;
          setInitialHeaderDraft(synced);
        }
      } else {
        prevSelectedHeaderRef.current = null;
      }
    }, [selectedBlockIndex, parsed.blocks, rawHeaderFields]);

    useEffect(() => {
      if (editingBlockIndex !== prevEditingRef.current) {
        prevEditingRef.current = editingBlockIndex;
        if (editingBlockIndex !== null && parsed.blocks[editingBlockIndex]) {
          setScopedEdit(null);
          const blk = parsed.blocks[editingBlockIndex];
          if (blk.kind === 'title') {
            pendingCaretValueRef.current = null;
            const initial = {
              title: rawHeaderFields.title,
              author: rawHeaderFields.author,
              date: rawHeaderFields.date,
            };
            setHeaderDraft(initial);
            setInitialHeaderDraft(initial);
          } else {
            pendingCaretValueRef.current = blk.rawLatex;
            setDraftLatex(blk.rawLatex);
            setInitialEditLatex(blk.rawLatex);
          }
        } else {
          pendingCaretValueRef.current = null;
        }
      }
    }, [editingBlockIndex, parsed.blocks, rawHeaderFields]);

    // Focus and select text when scopedEdit opens
    useEffect(() => {
      if (!scopedEdit || !pendingScopedFocusRef.current || !scopedInputRef.current) return;
      pendingScopedFocusRef.current = false;
      const el = scopedInputRef.current;
      el.focus();
      el.select();
    }, [scopedEdit]);

    // Focus and position caret inside closing math/section delimiters strictly after target rawLatex is in the DOM
    useEffect(() => {
      if (
        editingBlockIndex === null ||
        pendingCaretValueRef.current === null ||
        !inlineTextareaRef.current
      ) {
        return;
      }
      const target = pendingCaretValueRef.current;
      const el = inlineTextareaRef.current;
      if (draftLatex !== target || el.value !== target) return;

      pendingCaretValueRef.current = null;
      const val = target;
      let caret = val.length;
      if (val.endsWith('\n\\]')) {
        caret = val.length - 3;
      } else if (val.endsWith('\\]')) {
        caret = val.length - 2;
      } else {
        const endEnvMatch = val.match(/\n\\end\{[^}]+\}$/);
        if (endEnvMatch && endEnvMatch.index !== undefined) {
          caret = endEnvMatch.index;
        } else if (/^\\(?:section|subsection|subsubsection|paragraph)\*?\{[\s\S]*\}$/.test(val)) {
          caret = val.length - 1;
        }
      }
      el.focus();
      el.setSelectionRange(caret, caret);
    }, [editingBlockIndex, draftLatex]);

    // Clear drop preview if drag ends outside preview
    useEffect(() => {
      if (!draggingSymbol) {
        setDropIndex(null);
        setDropTargetBlockIndex(null);
        setDropTargetSlot(null);
        setVisualCaret((prev) => (prev?.isDrop ? null : prev));
      }
    }, [draggingSymbol]);

    // Clear visual caret when selection/activeSlot resets or document blocks re-render after edit
    useEffect(() => {
      if (!activeSlot) {
        setVisualCaret((prev) => (prev && !prev.isDrop ? null : prev));
      }
    }, [activeSlot]);

    useEffect(() => {
      setVisualCaret((prev) => (prev && !prev.isDrop ? null : prev));
    }, [parsed.html]);

    // Clear stale hover or scoped edit state when document blocks change
    useEffect(() => {
      if (hoveredBlockIndex !== null && !parsed.blocks[hoveredBlockIndex]) {
        setHoveredBlockIndex(null);
      }
      if (scopedEdit && !parsed.blocks[scopedEdit.blockIndex]) {
        setScopedEdit(null);
      }
    }, [hoveredBlockIndex, scopedEdit, parsed.blocks]);

    const applyScopedDraftChange = useCallback(
      (nextCode: string, activeScoped: ScopedEditState) => {
        if (activeScoped.headerField) {
          const curVal = rawHeaderFields[activeScoped.headerField];
          const updatedField =
            curVal.slice(0, activeScoped.startOffset) +
            nextCode +
            curVal.slice(activeScoped.endOffset);
          onUpdateHeader({
            ...rawHeaderFields,
            [activeScoped.headerField]: updatedField,
          });
        } else {
          const blk = parsed.blocks[activeScoped.blockIndex];
          if (blk) {
            const nextBlockLatex =
              blk.rawLatex.slice(0, activeScoped.startOffset) +
              nextCode +
              blk.rawLatex.slice(activeScoped.endOffset);
            if (nextBlockLatex.trim()) {
              onUpdateBlockLatex(activeScoped.blockIndex, nextBlockLatex);
            }
          }
        }
        setScopedEdit((prev) =>
          prev && prev.blockIndex === activeScoped.blockIndex
            ? {
                ...prev,
                draftCode: nextCode,
                endOffset: activeScoped.startOffset + nextCode.length,
              }
            : prev
        );
      },
      [parsed.blocks, rawHeaderFields, onUpdateBlockLatex, onUpdateHeader]
    );

    // Keyboard Delete/Backspace/Escape handling for selected preview block
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (selectedBlockIndex === null && !scopedEdit) return;
        const activeTag = document.activeElement?.tagName.toLowerCase();
        const isInInput =
          activeTag === 'input' ||
          activeTag === 'textarea' ||
          document.activeElement?.closest('.cm-editor') !== null;

        if (e.key === 'Escape') {
          if (scopedEdit) {
            applyScopedDraftChange(scopedEdit.initialCode, scopedEdit);
            setScopedEdit(null);
          } else if (editingBlockIndex !== null) {
            onStartEditBlock(null);
          } else {
            onSelectBlock(null);
          }
          return;
        }

        if ((e.key === 'Delete' || e.key === 'Backspace') && !isInInput && selectedBlockIndex !== null) {
          e.preventDefault();
          onRemoveBlock(selectedBlockIndex);
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }, [
      selectedBlockIndex,
      editingBlockIndex,
      scopedEdit,
      applyScopedDraftChange,
      onRemoveBlock,
      onSelectBlock,
      onStartEditBlock,
    ]);

    useImperativeHandle(ref, () => ({
      scrollToRatio(ratio: number) {
        const el = scrollerRef.current;
        if (!el || !settings.syncScroll) return;
        const max = el.scrollHeight - el.clientHeight;
        if (max > 0) {
          el.scrollTop = ratio * max;
        }
      },
      scrollToHeading(headingId: string) {
        const container = scrollerRef.current;
        if (!container) return;
        const target = container.querySelector(`#${CSS.escape(headingId)}`);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      },
      scrollToBlock(blockIndex: number) {
        const container = scrollerRef.current;
        if (!container) return;
        window.requestAnimationFrame(() => {
          const target = container.querySelector(`[data-block-index="${blockIndex}"]`);
          if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        });
      },
      insertSnippetInActiveEditor(snippet: string) {
        if (scopedEdit && scopedInputRef.current) {
          const el = scopedInputRef.current;
          const currentValue = el.value;
          const selStart = el.selectionStart ?? currentValue.length;
          const selEnd = el.selectionEnd ?? currentValue.length;
          const result = applyLatexSnippet(currentValue, selStart, selEnd, snippet);
          applyScopedDraftChange(result.nextText, scopedEdit);
          window.requestAnimationFrame(() => {
            if (!scopedInputRef.current) return;
            scopedInputRef.current.focus();
            scopedInputRef.current.setSelectionRange(result.selectionStart, result.selectionEnd);
          });
          return true;
        }
        if (editingBlockIndex === null || !inlineTextareaRef.current) return false;
        const ta = inlineTextareaRef.current;
        const currentValue = ta.value;
        const selStart = ta.selectionStart ?? currentValue.length;
        const selEnd = ta.selectionEnd ?? currentValue.length;
        const result = applyLatexSnippet(currentValue, selStart, selEnd, snippet);
        setDraftLatex(result.nextText);
        if (result.nextText.trim()) {
          onUpdateBlockLatex(editingBlockIndex, result.nextText);
        }
        window.requestAnimationFrame(() => {
          if (!inlineTextareaRef.current) return;
          inlineTextareaRef.current.focus();
          inlineTextareaRef.current.setSelectionRange(result.selectionStart, result.selectionEnd);
        });
        return true;
      },
    }));

    const computeDropSlotIndex = useCallback(
      (clientY: number): number => {
        const container = articleRef.current;
        if (!container || parsed.blocks.length === 0) return 0;

        const blockEls = Array.from(
          container.querySelectorAll<HTMLElement>('[data-block-index]')
        );
        for (let i = 0; i < blockEls.length; i++) {
          const rect = blockEls[i].getBoundingClientRect();
          const midpoint = rect.top + rect.height / 2;
          if (clientY < midpoint) {
            return i;
          }
        }
        return parsed.blocks.length;
      },
      [parsed.blocks.length]
    );

    const computeTargetEditableBlockIndex = useCallback(
      (clientY: number): number | null => {
        const container = articleRef.current;
        if (!container || parsed.blocks.length === 0) return null;

        const blockEls = Array.from(
          container.querySelectorAll<HTMLElement>('[data-block-index]')
        );
        const editableEntries = blockEls
          .map((el) => {
            const idx = Number(el.dataset.blockIndex);
            const block = parsed.blocks[idx];
            return { el, idx, block };
          })
          .filter(
            ({ block }) =>
              block && block.kind !== 'toc' && block.kind !== 'divider'
          );

        if (editableEntries.length === 0) return null;

        for (const entry of editableEntries) {
          const rect = entry.el.getBoundingClientRect();
          if (clientY >= rect.top && clientY <= rect.bottom) {
            return entry.idx;
          }
        }

        // Nearest editable block by vertical distance when hovering padding/gaps
        let bestIdx = editableEntries[editableEntries.length - 1].idx;
        let bestDist = Infinity;
        for (const entry of editableEntries) {
          const rect = entry.el.getBoundingClientRect();
          const centerY = rect.top + rect.height / 2;
          const dist = Math.abs(clientY - centerY);
          if (dist < bestDist) {
            bestDist = dist;
            bestIdx = entry.idx;
          }
        }
        return bestIdx;
      },
      [parsed.blocks]
    );

    const findPrecisionSlotTarget = useCallback(
      (
        target: EventTarget | null
      ): {
        blockIndex: number;
        offset: number;
        headerField?: HeaderPlacementField;
        fieldOffset?: number;
        label?: string;
      } | null => {
        if (!(target instanceof Element)) return null;
        const slotEl = target.closest<HTMLElement>('[data-slot-offset]');
        if (!slotEl) return null;
        const blockAttr = slotEl.getAttribute('data-slot-block');
        const offsetAttr = slotEl.getAttribute('data-slot-offset');
        if (blockAttr === null || offsetAttr === null) return null;
        const blockIndex = Number(blockAttr);
        const offset = Number(offsetAttr);
        if (Number.isNaN(blockIndex) || Number.isNaN(offset)) return null;
        const headerAttr = slotEl.getAttribute('data-header-field');
        const headerField =
          headerAttr === 'title' || headerAttr === 'author' || headerAttr === 'date'
            ? headerAttr
            : undefined;
        const label = slotEl.getAttribute('data-slot-label') ?? undefined;
        return { blockIndex, offset, headerField, label };
      },
      []
    );

    const resolveGraphicalTargetAtPoint = useCallback(
      (clientX: number, clientY: number) => {
        const container = articleRef.current;
        if (!container) return null;
        const hitEl = document.elementFromPoint(clientX, clientY);
        const blockEl = hitEl?.closest<HTMLElement>('[data-block-index]');
        if (!blockEl || !container.contains(blockEl)) return null;
        const blockIndex = Number(blockEl.dataset.blockIndex);
        const block = parsed.blocks[blockIndex];
        if (!block || block.kind === 'toc' || block.kind === 'divider') return null;

        const renderHost = blockEl.querySelector<HTMLElement>('[data-block-render-host="true"]');
        if (!renderHost) return null;

        const hit = resolveGraphicalHitInBlock(
          blockEl,
          block.rawLatex,
          block.kind,
          rawHeaderFields,
          clientX,
          clientY
        );
        if (!hit) return null;

        const hostRect = renderHost.getBoundingClientRect();
        return {
          blockIndex,
          hit,
          localCaret: hit.caretRect
            ? {
                left: hit.caretRect.left - hostRect.left,
                top: hit.caretRect.top - hostRect.top,
                height: hit.caretRect.height,
              }
            : null,
        };
      },
      [parsed.blocks, rawHeaderFields]
    );

    const handleDragOver = useCallback(
      (e: React.DragEvent<HTMLDivElement>) => {
        const hasSymbol =
          Boolean(draggingSymbol) ||
          Array.from(e.dataTransfer.types).includes('application/x-scribetex-symbol');
        if (!hasSymbol) return;

        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';

        const wantsNewBox = draggingSymbol ? isBlockCreatorSymbol(draggingSymbol) : false;
        if (!wantsNewBox) {
          const precisionTarget = findPrecisionSlotTarget(e.target);
          if (precisionTarget) {
            setDropTargetSlot((prev) =>
              prev &&
              prev.blockIndex === precisionTarget.blockIndex &&
              prev.offset === precisionTarget.offset &&
              prev.headerField === precisionTarget.headerField
                ? prev
                : precisionTarget
            );
            setDropTargetBlockIndex(null);
            setDropIndex(null);
            setVisualCaret((prev) => (prev?.isDrop ? null : prev));
            return;
          }

          const graphicalTarget = resolveGraphicalTargetAtPoint(e.clientX, e.clientY);
          if (graphicalTarget) {
            const { blockIndex, hit, localCaret } = graphicalTarget;
            setDropTargetSlot({
              blockIndex,
              offset: hit.offset,
              headerField: hit.headerField,
              fieldOffset: hit.fieldOffset,
              label: hit.label,
            });
            setDropTargetBlockIndex((prev) => (prev === blockIndex ? prev : blockIndex));
            setDropIndex(null);
            if (localCaret) {
              setVisualCaret({
                blockIndex,
                left: localCaret.left,
                top: localCaret.top,
                height: localCaret.height,
                isDrop: true,
              });
            }
            return;
          }

          setDropTargetSlot(null);
          setVisualCaret((prev) => (prev?.isDrop ? null : prev));
          const targetBox = computeTargetEditableBlockIndex(e.clientY);
          if (targetBox !== null) {
            setDropTargetBlockIndex((prev) => (prev === targetBox ? prev : targetBox));
            setDropIndex(null);
            return;
          }
        }

        setDropTargetSlot(null);
        setDropTargetBlockIndex(null);
        setVisualCaret((prev) => (prev?.isDrop ? null : prev));
        const nextSlot = computeDropSlotIndex(e.clientY);
        setDropIndex((prev) => (prev === nextSlot ? prev : nextSlot));
      },
      [
        draggingSymbol,
        findPrecisionSlotTarget,
        resolveGraphicalTargetAtPoint,
        computeDropSlotIndex,
        computeTargetEditableBlockIndex,
      ]
    );

    const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
      const container = scrollerRef.current;
      if (!container) return;
      const related = e.relatedTarget;
      if (!(related instanceof Node) || !container.contains(related)) {
        setDropIndex(null);
        setDropTargetBlockIndex(null);
        setDropTargetSlot(null);
        setVisualCaret((prev) => (prev?.isDrop ? null : prev));
      }
    }, []);

    const handleDrop = useCallback(
      (e: React.DragEvent<HTMLDivElement>) => {
        const symbolId = e.dataTransfer.getData('application/x-scribetex-symbol') || undefined;
        if (!symbolId && !draggingSymbol) return;

        e.preventDefault();
        const wantsNewBox = draggingSymbol ? isBlockCreatorSymbol(draggingSymbol) : false;
        const buttonPrecisionTarget = findPrecisionSlotTarget(e.target);
        const graphicalDrop =
          !wantsNewBox && !buttonPrecisionTarget
            ? resolveGraphicalTargetAtPoint(e.clientX, e.clientY)
            : null;
        const directPrecisionTarget =
          buttonPrecisionTarget ??
          (graphicalDrop
            ? {
                blockIndex: graphicalDrop.blockIndex,
                offset: graphicalDrop.hit.offset,
                headerField: graphicalDrop.hit.headerField,
                fieldOffset: graphicalDrop.hit.fieldOffset,
                label: graphicalDrop.hit.label,
              }
            : dropTargetSlot);
        const existingBoxTarget = dropTargetBlockIndex;
        const targetSlot =
          dropIndex !== null ? dropIndex : computeDropSlotIndex(e.clientY);

        setDropIndex(null);
        setDropTargetBlockIndex(null);
        setDropTargetSlot(null);
        setVisualCaret(null);

        if (!wantsNewBox && directPrecisionTarget) {
          onDropSymbolAtOffset(
            directPrecisionTarget.blockIndex,
            directPrecisionTarget.offset,
            symbolId,
            directPrecisionTarget.headerField,
            directPrecisionTarget.fieldOffset
          );
        } else if (!wantsNewBox && existingBoxTarget !== null) {
          if (activeSlot && activeSlot.blockIndex === existingBoxTarget) {
            onDropSymbolAtOffset(
              existingBoxTarget,
              activeSlot.offset,
              symbolId,
              activeSlot.headerField,
              activeSlot.fieldOffset
            );
          } else {
            onDropSymbolIntoBlock(existingBoxTarget, symbolId);
          }
        } else {
          onDropSymbolAtSlot(targetSlot, symbolId);
        }
      },
      [
        draggingSymbol,
        findPrecisionSlotTarget,
        resolveGraphicalTargetAtPoint,
        dropTargetSlot,
        dropTargetBlockIndex,
        dropIndex,
        computeDropSlotIndex,
        activeSlot,
        onDropSymbolAtOffset,
        onDropSymbolIntoBlock,
        onDropSymbolAtSlot,
      ]
    );

    const paddingMap: Record<EditorSettings['paperMargin'], string> = {
      narrow: 'px-6 py-7 sm:px-9 sm:py-9',
      standard: 'px-8 py-10 sm:px-14 sm:py-12',
      wide: 'px-12 py-12 sm:px-20 sm:py-14',
    };

    const fontMap: Record<EditorSettings['previewFontFamily'], string> = {
      'Source Serif 4': '"Source Serif 4", Georgia, serif',
      Lora: '"Lora", Georgia, serif',
      'Plus Jakarta Sans': '"Plus Jakarta Sans", sans-serif',
    };

    const forceWhitePaper = settings.previewThemeSync === 'always-paper';
    const isPaginated = settings.previewLayout === 'paginated';
    const zoomScale = settings.previewZoom / 100;
    const isDraggingActive = Boolean(draggingSymbol);

    const renderBlockItem = (block: PreviewBlock, idx: number) => {
      const isSelected = selectedBlockIndex === idx;
      const isEditing = editingBlockIndex === idx;
      const isScopedEditing = scopedEdit?.blockIndex === idx;
      const isHovered = hoveredBlockIndex === idx;
      const isDropTarget = dropTargetBlockIndex === idx;
      const isPrecisionDropInside = dropTargetSlot?.blockIndex === idx;
      const headingCmd = block.kind === 'heading' ? getHeadingCommand(draftLatex) : null;
      const canShowInfoPanel = block.kind !== 'toc' && block.kind !== 'divider';
      const showHoverControls = isSelected || (!isDraggingActive && isHovered);
      const primaryRegion = showHoverControls
        ? extractStructuredRegions(block.rawLatex)[0] ?? null
        : null;

      const rowAddLabel =
        primaryRegion?.kind === 'cases'
          ? 'Branch'
          : primaryRegion?.kind === 'list'
            ? 'Item'
            : primaryRegion?.kind === 'align'
              ? 'Line'
              : 'Row';
      const showColAdd =
        primaryRegion?.kind === 'matrix' || primaryRegion?.kind === 'table';

      const actionBarButtons = (
        <div className="flex items-center gap-1 flex-wrap">
          {primaryRegion && (
            <>
              <button
                type="button"
                onClick={() => {
                  onSelectBlock(idx);
                  onAppendRegionRow(idx, primaryRegion);
                }}
                aria-label={`Add ${rowAddLabel} to ${block.label}`}
                className="flex items-center gap-0.5 px-2 py-1 text-xs font-medium rounded-md border border-[var(--border-hairline)] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] cursor-pointer transition-colors"
              >
                <Plus size={12} />
                <span>{rowAddLabel}</span>
              </button>
              {showColAdd && (
                <button
                  type="button"
                  onClick={() => {
                    onSelectBlock(idx);
                    onAppendRegionColumn(idx, primaryRegion);
                  }}
                  aria-label={`Add column to ${block.label}`}
                  className="flex items-center gap-0.5 px-2 py-1 text-xs font-medium rounded-md border border-[var(--border-hairline)] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] cursor-pointer transition-colors"
                >
                  <Plus size={12} />
                  <span>Col</span>
                </button>
              )}
            </>
          )}
          <button
            type="button"
            disabled={idx === 0}
            onClick={() => onMoveBlock(idx, 'up')}
            aria-label={`Move ${block.label} up`}
            title="Move up"
            className="p-1.5 rounded-md border border-[var(--border-hairline)] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer"
          >
            <ArrowUp size={13} />
          </button>
          <button
            type="button"
            disabled={idx >= parsed.blocks.length - 1}
            onClick={() => onMoveBlock(idx, 'down')}
            aria-label={`Move ${block.label} down`}
            title="Move down"
            className="p-1.5 rounded-md border border-[var(--border-hairline)] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer"
          >
            <ArrowDown size={13} />
          </button>
          {block.kind !== 'title' && (
            <button
              type="button"
              onClick={() => {
                onSelectBlock(idx);
                if (isScopedEditing) {
                  setScopedEdit(null);
                  onStartEditBlock(null);
                } else {
                  setScopedEdit(null);
                  onStartEditBlock(isEditing ? null : idx);
                }
              }}
              aria-label={
                isEditing || isScopedEditing
                  ? `Close editor for ${block.label}`
                  : `Edit ${block.label}`
              }
              className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md border cursor-pointer transition-colors ${
                isEditing || isScopedEditing
                  ? 'bg-[var(--accent-subtle)] border-[var(--accent-ring)] text-[var(--text-primary)]'
                  : 'bg-[var(--bg-surface)] border-[var(--border-hairline)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)]'
              }`}
            >
              {isEditing || isScopedEditing ? <X size={12} /> : <Pencil size={12} />}
              <span>{isEditing || isScopedEditing ? 'Close' : 'Change'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (isScopedEditing) setScopedEdit(null);
              onRemoveBlock(idx);
            }}
            aria-label={`Remove ${block.label}`}
            title="Remove element (Delete)"
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md border border-[var(--border-hairline)] bg-[var(--bg-surface)] hover:bg-red-500/12 hover:border-red-500/40 text-red-600 dark:text-red-400 cursor-pointer transition-colors"
          >
            <Trash2 size={12} />
            <span>Remove</span>
          </button>
        </div>
      );

      return (
        <div
          key={`${block.id}-${idx}`}
          data-block-index={idx}
          data-block-kind={block.kind}
          data-selected={isSelected ? 'true' : 'false'}
          data-hovered={isHovered ? 'true' : 'false'}
          onMouseEnter={() => setHoveredBlockIndex(idx)}
          onMouseLeave={(e) => {
            const related = e.relatedTarget;
            if (!(related instanceof Node) || !e.currentTarget.contains(related)) {
              setHoveredBlockIndex((prev) => (prev === idx ? null : prev));
            }
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (!isSelected) {
              onSelectBlock(idx);
              if (editingBlockIndex !== null && editingBlockIndex !== idx) {
                onStartEditBlock(null);
              }
              if (scopedEdit && scopedEdit.blockIndex !== idx) {
                setScopedEdit(null);
              }
            }
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            const pending = pendingDblClickRef.current;
            const matchesPending =
              pending &&
              Date.now() - pending.time < 600 &&
              Math.hypot(e.clientX - pending.clientX, e.clientY - pending.clientY) <= 10;
            pendingDblClickRef.current = null;

            const targetIdx = matchesPending ? pending.blockIndex : idx;
            const targetCanShowInfo = matchesPending ? pending.canShowInfoPanel : canShowInfoPanel;

            onSelectBlock(targetIdx);
            if (!targetCanShowInfo) {
              setScopedEdit(null);
              onStartEditBlock(targetIdx);
              return;
            }
            const scoped = matchesPending
              ? pending.scoped
              : resolveDoubleClickTargetInBlock(
                  e.currentTarget,
                  block.rawLatex,
                  block.kind,
                  rawHeaderFields,
                  e.clientX,
                  e.clientY
                );
            if (scoped) {
              onStartEditBlock(null);
              pendingScopedFocusRef.current = true;
              setScopedEdit({
                blockIndex: targetIdx,
                startOffset: scoped.startOffset,
                endOffset: scoped.endOffset,
                initialCode: scoped.code,
                draftCode: scoped.code,
                label: scoped.label,
                headerField: scoped.headerField,
                parentScope: scoped.parentScope,
              });
            } else {
              setScopedEdit(null);
              onStartEditBlock(targetIdx);
            }
          }}
          className={`group/block relative rounded-lg px-2.5 -mx-2.5 py-1 transition-colors duration-150 ${
            isDropTarget || isPrecisionDropInside
              ? 'z-20 outline-1 outline-dotted outline-[var(--accent-primary)]/80 bg-[var(--accent-subtle)]/15 print:!outline-0 print:px-0 print:mx-0 print:py-0 print:bg-transparent'
              : isSelected
                ? 'z-10 ring-2 ring-[var(--accent-primary)] bg-[var(--accent-subtle)]/25 print:!ring-0 print:px-0 print:mx-0 print:py-0 print:bg-transparent'
                : !isDraggingActive && isHovered
                  ? 'z-10 ring-1 ring-[var(--accent-ring)] bg-[var(--accent-subtle)]/20 cursor-pointer print:!ring-0 print:px-0 print:mx-0 print:py-0 print:bg-transparent'
                  : 'cursor-pointer print:px-0 print:mx-0 print:py-0'
          }`}
        >
          {/* Rendered Preview Output (Direct Click & Drop Cursor Target) */}
          <div
            data-block-render-host="true"
            onMouseDown={(e) => {
              if (e.button !== 0 || e.detail !== 1 || isEditing || isScopedEditing) return;
              const blockEl = e.currentTarget.closest<HTMLElement>('[data-block-index]');
              const scoped =
                canShowInfoPanel && blockEl
                  ? resolveDoubleClickTargetInBlock(
                      blockEl,
                      block.rawLatex,
                      block.kind,
                      rawHeaderFields,
                      e.clientX,
                      e.clientY
                    )
                  : null;
              pendingDblClickRef.current = {
                blockIndex: idx,
                clientX: e.clientX,
                clientY: e.clientY,
                time: Date.now(),
                canShowInfoPanel,
                scoped,
              };
            }}
            onClick={(e) => {
              if (!canShowInfoPanel || isEditing || isScopedEditing) return;
              e.stopPropagation();
              onSelectBlock(idx);
              if (scopedEdit && scopedEdit.blockIndex !== idx) {
                setScopedEdit(null);
              }
              const blockEl = e.currentTarget.closest<HTMLElement>('[data-block-index]');
              if (!blockEl) return;
              const hit = resolveGraphicalHitInBlock(
                blockEl,
                block.rawLatex,
                block.kind,
                rawHeaderFields,
                e.clientX,
                e.clientY
              );
              if (hit) {
                onSelectActiveSlot({
                  blockIndex: idx,
                  offset: hit.offset,
                  label: hit.label,
                  headerField: hit.headerField,
                  fieldOffset: hit.fieldOffset,
                });
                if (hit.caretRect) {
                  const hostRect = e.currentTarget.getBoundingClientRect();
                  setVisualCaret({
                    blockIndex: idx,
                    left: hit.caretRect.left - hostRect.left,
                    top: hit.caretRect.top - hostRect.top,
                    height: hit.caretRect.height,
                    isDrop: false,
                  });
                } else {
                  setVisualCaret(null);
                }
              }
            }}
            className={`relative ${canShowInfoPanel && !isEditing && !isScopedEditing ? 'cursor-text' : ''}`}
          >
            <div dangerouslySetInnerHTML={{ __html: block.html }} />
            {visualCaret && visualCaret.blockIndex === idx && (
              <div
                data-testid="graphical-caret-indicator"
                aria-hidden="true"
                style={{
                  left: `${Math.max(0, visualCaret.left)}px`,
                  top: `${Math.max(0, visualCaret.top)}px`,
                  height: `${Math.max(14, Math.min(24, visualCaret.height))}px`,
                }}
                className="pointer-events-none absolute w-0.5 rounded-full z-30 bg-[var(--accent-primary)] print:hidden"
              />
            )}
          </div>

          {/* Contextual Action Bar: Expands downward in-flow when selected or hovered (suppressed during drag and placed below content so hovering never shifts text under the cursor) */}
          {showHoverControls && (
            <div
              data-testid={`hover-action-bar-${idx}`}
              onMouseDown={(e) => {
                if (e.detail === 1) {
                  pendingDblClickRef.current = null;
                }
              }}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => {
                const pending = pendingDblClickRef.current;
                const matchesPending =
                  pending &&
                  Date.now() - pending.time < 600 &&
                  Math.hypot(e.clientX - pending.clientX, e.clientY - pending.clientY) <= 10;
                if (!matchesPending) {
                  e.stopPropagation();
                }
              }}
              style={{ fontFamily: 'var(--font-ui)', fontSize: '12px' }}
              className="flex flex-wrap items-center justify-between gap-2 pt-2 mt-2 border-t border-[var(--border-hairline)] text-[var(--text-primary)] print:hidden"
            >
              <span className="text-xs font-semibold text-[var(--text-secondary)] select-none">
                {block.label}
              </span>
              {actionBarButtons}
            </div>
          )}

          {/* Scoped Real-Code Editor (shown ONLY for the selected/double-clicked part) */}
          {isSelected && isScopedEditing && scopedEdit && (
            <div
              data-testid={`scoped-editor-${idx}`}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              style={{ fontFamily: 'var(--font-ui)', fontSize: '12px' }}
              className="mt-2.5 p-2.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-primary)] space-y-2 print:hidden"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
                  Editing: <span className="text-[var(--accent-primary)]">{scopedEdit.label}</span>
                </span>
                <div className="flex items-center gap-2">
                  {scopedEdit.parentScope && (
                    <button
                      type="button"
                      onClick={() => {
                        const parent = scopedEdit.parentScope!;
                        const liveSlice = scopedEdit.headerField
                          ? rawHeaderFields[scopedEdit.headerField]
                          : block.rawLatex;
                        const delta =
                          scopedEdit.draftCode.length - scopedEdit.initialCode.length;
                        const adjustedEnd = Math.max(
                          parent.startOffset,
                          Math.min(liveSlice.length, parent.endOffset + delta)
                        );
                        const widenedCode = liveSlice.slice(parent.startOffset, adjustedEnd);
                        pendingScopedFocusRef.current = true;
                        setScopedEdit({
                          blockIndex: idx,
                          startOffset: parent.startOffset,
                          endOffset: adjustedEnd,
                          initialCode: widenedCode,
                          draftCode: widenedCode,
                          label: parent.label,
                          headerField: scopedEdit.headerField,
                        });
                      }}
                      className="text-[11px] font-medium text-[var(--accent-primary)] hover:underline cursor-pointer"
                    >
                      Expand to {scopedEdit.parentScope.label}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setScopedEdit(null);
                      onStartEditBlock(idx);
                    }}
                    className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    Full block
                  </button>
                </div>
              </div>

              {scopedEdit.draftCode.includes('\n') ? (
                <textarea
                  data-testid="scoped-latex-input"
                  ref={(el) => {
                    scopedInputRef.current = el;
                  }}
                  value={scopedEdit.draftCode}
                  onChange={(e) => applyScopedDraftChange(e.target.value, scopedEdit)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      setScopedEdit(null);
                    }
                  }}
                  rows={Math.min(6, Math.max(2, scopedEdit.draftCode.split('\n').length))}
                  aria-label={`Edit LaTeX for ${scopedEdit.label}`}
                  className="w-full px-2.5 py-1.5 text-xs font-mono leading-relaxed rounded-md bg-[var(--bg-elevated)] border border-[var(--border-hairline)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-ring)] resize-y"
                />
              ) : (
                <input
                  data-testid="scoped-latex-input"
                  ref={(el) => {
                    scopedInputRef.current = el;
                  }}
                  type="text"
                  value={scopedEdit.draftCode}
                  onChange={(e) => applyScopedDraftChange(e.target.value, scopedEdit)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      setScopedEdit(null);
                    }
                  }}
                  aria-label={`Edit LaTeX for ${scopedEdit.label}`}
                  className="w-full px-2.5 py-1.5 text-xs font-mono rounded-md bg-[var(--bg-elevated)] border border-[var(--border-hairline)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-ring)]"
                />
              )}

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    applyScopedDraftChange(scopedEdit.initialCode, scopedEdit);
                    setScopedEdit(null);
                  }}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-[var(--border-hairline)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] cursor-pointer"
                >
                  <X size={12} />
                  <span>Cancel</span>
                </button>
                <button
                  type="button"
                  onClick={() => setScopedEdit(null)}
                  className="flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-md bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-[var(--accent-primary-text)] cursor-pointer"
                >
                  <Check size={12} />
                  <span>Apply</span>
                </button>
              </div>
            </div>
          )}

          {/* Inline Block Editor (auto-shown when Document Header is active; toggled via Change for other blocks) */}
          {isSelected && !isScopedEditing && (block.kind === 'title' || isEditing) && (
            <div
              data-testid={block.kind === 'title' ? 'document-header-editor' : undefined}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              style={{ fontFamily: 'var(--font-ui)', fontSize: '12px' }}
              className="mt-3 p-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-primary)] space-y-2.5 print:hidden"
            >
              {block.kind === 'title' ? (
                <div className="space-y-2.5">
                  <div className="text-xs font-semibold text-[var(--text-secondary)]">
                    Document Header
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-col sm:grid sm:grid-cols-[105px_1fr] sm:items-center gap-1 sm:gap-2">
                      <label
                        htmlFor={`preview-header-title-${idx}`}
                        className="text-[11px] font-medium text-[var(--text-secondary)]"
                      >
                        Header title:
                      </label>
                      <input
                        id={`preview-header-title-${idx}`}
                        type="text"
                        value={headerDraft.title}
                        onChange={(e) => {
                          const next = { ...headerDraft, title: e.target.value };
                          setHeaderDraft(next);
                          onUpdateHeader(next);
                        }}
                        placeholder="Enter document header title..."
                        aria-label="Header title"
                        className="w-full px-2.5 py-1.5 text-xs rounded-md bg-[var(--bg-elevated)] border border-[var(--border-hairline)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-ring)]"
                      />
                    </div>
                    <div className="flex flex-col sm:grid sm:grid-cols-[105px_1fr] sm:items-center gap-1 sm:gap-2">
                      <label
                        htmlFor={`preview-header-desc-${idx}`}
                        className="text-[11px] font-medium text-[var(--text-secondary)]"
                      >
                        Description:
                      </label>
                      <input
                        id={`preview-header-desc-${idx}`}
                        type="text"
                        value={headerDraft.author}
                        onChange={(e) => {
                          const next = { ...headerDraft, author: e.target.value };
                          setHeaderDraft(next);
                          onUpdateHeader(next);
                        }}
                        placeholder="Enter author or subtitle description..."
                        aria-label="Description"
                        className="w-full px-2.5 py-1.5 text-xs rounded-md bg-[var(--bg-elevated)] border border-[var(--border-hairline)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-ring)]"
                      />
                    </div>
                    <div className="flex flex-col sm:grid sm:grid-cols-[105px_1fr] sm:items-center gap-1 sm:gap-2">
                      <label
                        htmlFor={`preview-header-date-${idx}`}
                        className="text-[11px] font-medium text-[var(--text-secondary)]"
                      >
                        Date:
                      </label>
                      <input
                        id={`preview-header-date-${idx}`}
                        type="text"
                        value={headerDraft.date}
                        onChange={(e) => {
                          const next = { ...headerDraft, date: e.target.value };
                          setHeaderDraft(next);
                          onUpdateHeader(next);
                        }}
                        placeholder="Date (e.g. \today)"
                        aria-label="Date"
                        className="w-full px-2.5 py-1.5 text-xs rounded-md bg-[var(--bg-elevated)] border border-[var(--border-hairline)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-ring)]"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onUpdateHeader(initialHeaderDraft);
                        onStartEditBlock(null);
                        onSelectBlock(null);
                      }}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-[var(--border-hairline)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] cursor-pointer"
                    >
                      <X size={12} />
                      <span>Cancel</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onStartEditBlock(null);
                        onSelectBlock(null);
                      }}
                      className="flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-md bg-[var(--accent-primary)] text-[var(--accent-primary-text)] cursor-pointer"
                    >
                      <Check size={12} />
                      <span>Done</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {headingCmd && (
                    <div className="flex flex-col sm:grid sm:grid-cols-[105px_1fr] sm:items-center gap-1 sm:gap-2">
                      <span className="text-[11px] font-medium text-[var(--text-secondary)]">
                        Section level:
                      </span>
                      <div className="flex items-center gap-1">
                        {(['section', 'subsection', 'subsubsection'] as const).map((lvl) => (
                          <button
                            key={lvl}
                            type="button"
                            onClick={() => {
                              const switched = switchHeadingCommand(draftLatex, lvl);
                              setDraftLatex(switched);
                              onUpdateBlockLatex(idx, switched);
                            }}
                            className={`px-2 py-0.5 text-[11px] rounded border cursor-pointer capitalize ${
                              headingCmd === lvl
                                ? 'bg-[var(--accent-primary)] border-[var(--accent-primary)] text-[var(--accent-primary-text)]'
                                : 'bg-[var(--bg-elevated)] border-[var(--border-hairline)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                            }`}
                          >
                            {lvl}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor={`preview-latex-source-${idx}`}
                      className="text-[11px] font-medium text-[var(--text-secondary)]"
                    >
                      LaTeX source (click any symbol key above to insert at cursor):
                    </label>
                    <textarea
                      id={`preview-latex-source-${idx}`}
                      ref={inlineTextareaRef}
                      value={draftLatex}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDraftLatex(val);
                        if (val.trim()) {
                          onUpdateBlockLatex(idx, val);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault();
                          onUpdateBlockLatex(idx, draftLatex);
                          onStartEditBlock(null);
                        }
                      }}
                      rows={Math.min(8, Math.max(2, draftLatex.split('\n').length))}
                      aria-label={`Edit LaTeX for ${block.label}`}
                      className="w-full px-3 py-2 text-xs font-mono leading-relaxed rounded-md bg-[var(--bg-elevated)] border border-[var(--border-hairline)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-ring)] resize-y"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onUpdateBlockLatex(idx, initialEditLatex);
                        onStartEditBlock(null);
                      }}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-[var(--border-hairline)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] cursor-pointer"
                    >
                      <X size={12} />
                      <span>Cancel</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onUpdateBlockLatex(idx, draftLatex);
                        onStartEditBlock(null);
                      }}
                      className="flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-md bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-[var(--accent-primary-text)] cursor-pointer"
                    >
                      <Check size={12} />
                      <span>Apply</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      );
    };

    return (
      <div className="relative h-full w-full flex flex-col overflow-hidden bg-[var(--bg-canvas)]">
        {/* Real Math Diagnostics Strip (only rendered when parser reports real KaTeX errors) */}
        {parsed.diagnostics.length > 0 && (
          <div className="shrink-0 border-b border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 px-3 py-1.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <AlertTriangle size={14} className="shrink-0" />
                <span className="font-medium truncate">
                  {parsed.diagnostics.length} math syntax{' '}
                  {parsed.diagnostics.length === 1 ? 'issue' : 'issues'} detected
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowErrors((v) => !v)}
                className="flex items-center gap-1 font-medium hover:underline shrink-0 cursor-pointer"
              >
                {showErrors ? 'Hide' : 'Details'}
                {showErrors ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
            </div>
            {showErrors && (
              <ul className="mt-2 space-y-1 border-t border-amber-500/20 pt-2 max-h-28 overflow-y-auto">
                {parsed.diagnostics.map((d) => (
                  <li key={d.id} className="font-mono text-[11px] flex flex-col">
                    <span>{d.message}</span>
                    {d.snippet && <span className="opacity-70 truncate">Near: {d.snippet}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Scrollable Document Viewport & Drop Zone */}
        <div
          ref={scrollerRef}
          data-testid="latex-preview-scroller"
          onClick={() => {
            setScopedEdit(null);
            onSelectBlock(null);
            onStartEditBlock(null);
          }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`flex-1 overflow-y-auto ${
            isPaginated ? 'p-4 sm:p-8' : 'p-0'
          }`}
        >
          <div
            className={`mx-auto transition-transform duration-150 origin-top ${
              isPaginated ? 'max-w-[820px]' : 'w-full max-w-none'
            }`}
            style={{
              transform: zoomScale !== 1 ? `scale(${zoomScale})` : undefined,
              width: zoomScale !== 1 && isPaginated ? `${100 / zoomScale}%` : undefined,
            }}
          >
            <article
              ref={articleRef}
              data-testid="latex-preview-article"
              onMouseLeave={() => setHoveredBlockIndex(null)}
              onDoubleClick={(e) => {
                const pending = pendingDblClickRef.current;
                if (!pending) return;
                const matches =
                  Date.now() - pending.time < 600 &&
                  Math.hypot(e.clientX - pending.clientX, e.clientY - pending.clientY) <= 10;
                pendingDblClickRef.current = null;
                if (!matches) return;
                e.stopPropagation();
                onSelectBlock(pending.blockIndex);
                if (!pending.canShowInfoPanel || !pending.scoped) {
                  setScopedEdit(null);
                  onStartEditBlock(pending.blockIndex);
                  return;
                }
                onStartEditBlock(null);
                pendingScopedFocusRef.current = true;
                setScopedEdit({
                  blockIndex: pending.blockIndex,
                  startOffset: pending.scoped.startOffset,
                  endOffset: pending.scoped.endOffset,
                  initialCode: pending.scoped.code,
                  draftCode: pending.scoped.code,
                  label: pending.scoped.label,
                  headerField: pending.scoped.headerField,
                  parentScope: pending.scoped.parentScope,
                });
              }}
              className={`latex-preview-doc latex-print-area ${paddingMap[settings.paperMargin]} ${
                isPaginated
                  ? 'rounded-lg border shadow-sm min-h-[920px]'
                  : 'min-h-[calc(100vh-140px)]'
              } ${
                forceWhitePaper
                  ? 'bg-white text-[#111113] border-[#D8D5CD]'
                  : 'bg-[var(--paper-bg)] text-[var(--paper-text)] border-[var(--paper-border)]'
              } ${isDraggingActive ? 'ring-1 ring-[var(--accent-ring)]' : ''}`}
              style={{
                fontFamily: fontMap[settings.previewFontFamily],
                fontSize: `${settings.previewFontSize}px`,
              }}
            >
              {parsed.blocks.length === 0 ? (
                dropIndex !== null ? (
                  <DropSlotIndicator />
                ) : (
                  <div className="min-h-[260px] flex flex-col items-center justify-center text-center px-6">
                    <p className="text-sm font-medium text-[var(--text-secondary)]">
                      Your document preview is empty
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-muted)] max-w-sm">
                      Drag any element from the symbol keyboard onto this page or click a key to
                      add it to the preview.
                    </p>
                  </div>
                )
              ) : (
                <>
                  {parsed.blocks.map((block, idx) => (
                    <div key={`slot-wrap-${block.id}-${idx}`}>
                      {dropIndex === idx && <DropSlotIndicator />}
                      {renderBlockItem(block, idx)}
                    </div>
                  ))}
                  {dropIndex === parsed.blocks.length && <DropSlotIndicator />}
                </>
              )}
            </article>
          </div>
        </div>
      </div>
    );
  }
);
