import type { LaTeXDocument } from '../types/editor';

export const DOCS_STORAGE_KEY = 'scribetex:docs:v1';
export const ACTIVE_DOC_STORAGE_KEY = 'scribetex:activeDocId:v1';
export const AUTOSAVE_KEY_PREFIX = 'scribetex:autosave:';
export const LAST_SAVED_AT_KEY = 'scribetex:lastSavedAt:v1';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface AutoSaveDraftRecord {
  id: string;
  title: string;
  content: string;
  updatedAt: number;
  savedAt: number;
}

export interface LoadedDocumentsState {
  documents: LaTeXDocument[];
  activeDocId: string | null;
  lastSavedAt: number | null;
}

function getDefaultStorage(): StorageLike | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  return window.localStorage;
}

export function getAutoSaveKey(docId: string): string {
  return `${AUTOSAVE_KEY_PREFIX}${docId}`;
}

/**
 * Synchronously persists the active document draft and the full documents list
 * to localStorage on every document update.
 */
export function autoSaveDocument(
  doc: LaTeXDocument,
  allDocuments: LaTeXDocument[],
  storage: StorageLike | null = getDefaultStorage()
): { savedAt: number } {
  const savedAt = Date.now();
  if (!storage) return { savedAt };

  try {
    const draftRecord: AutoSaveDraftRecord = {
      id: doc.id,
      title: doc.title,
      content: doc.content,
      updatedAt: doc.updatedAt,
      savedAt,
    };
    storage.setItem(getAutoSaveKey(doc.id), JSON.stringify(draftRecord));
    storage.setItem(DOCS_STORAGE_KEY, JSON.stringify(allDocuments));
    storage.setItem(LAST_SAVED_AT_KEY, JSON.stringify(savedAt));
  } catch {
    // Ignore storage quota errors
  }

  return { savedAt };
}

export function persistActiveDocId(
  docId: string | null,
  storage: StorageLike | null = getDefaultStorage()
): void {
  if (!storage) return;
  try {
    storage.setItem(ACTIVE_DOC_STORAGE_KEY, JSON.stringify(docId));
  } catch {
    // Ignore storage errors
  }
}

export function persistDocumentsList(
  documents: LaTeXDocument[],
  storage: StorageLike | null = getDefaultStorage()
): void {
  if (!storage) return;
  try {
    storage.setItem(DOCS_STORAGE_KEY, JSON.stringify(documents));
  } catch {
    // Ignore storage errors
  }
}

export function deleteDocumentStorage(
  docId: string,
  remainingDocuments: LaTeXDocument[],
  nextActiveDocId: string | null,
  storage: StorageLike | null = getDefaultStorage()
): void {
  if (!storage) return;
  try {
    storage.removeItem(getAutoSaveKey(docId));
    storage.setItem(DOCS_STORAGE_KEY, JSON.stringify(remainingDocuments));
    storage.setItem(ACTIVE_DOC_STORAGE_KEY, JSON.stringify(nextActiveDocId));
  } catch {
    // Ignore storage errors
  }
}

export function loadDocumentsState(
  storage: StorageLike | null = getDefaultStorage()
): LoadedDocumentsState {
  if (!storage) {
    return { documents: [], activeDocId: null, lastSavedAt: null };
  }

  let documents: LaTeXDocument[] = [];
  let activeDocId: string | null = null;
  let lastSavedAt: number | null = null;

  try {
    const rawDocs = storage.getItem(DOCS_STORAGE_KEY);
    if (rawDocs) {
      const parsed = JSON.parse(rawDocs);
      if (Array.isArray(parsed)) {
        documents = parsed.filter(
          (item): item is LaTeXDocument =>
            typeof item === 'object' &&
            item !== null &&
            typeof item.id === 'string' &&
            typeof item.title === 'string' &&
            typeof item.content === 'string'
        );
      }
    }

    // Reconcile each document with its latest per-document auto-save record
    documents = documents.map((doc) => {
      const rawDraft = storage.getItem(getAutoSaveKey(doc.id));
      if (!rawDraft) return doc;
      try {
        const draft = JSON.parse(rawDraft) as Partial<AutoSaveDraftRecord>;
        if (
          typeof draft.content === 'string' &&
          typeof draft.updatedAt === 'number' &&
          draft.updatedAt >= doc.updatedAt
        ) {
          return {
            ...doc,
            title: typeof draft.title === 'string' ? draft.title : doc.title,
            content: draft.content,
            updatedAt: draft.updatedAt,
          };
        }
      } catch {
        // Ignore malformed individual draft
      }
      return doc;
    });

    const rawActiveId = storage.getItem(ACTIVE_DOC_STORAGE_KEY);
    if (rawActiveId) {
      const parsedId = JSON.parse(rawActiveId);
      if (typeof parsedId === 'string' && documents.some((d) => d.id === parsedId)) {
        activeDocId = parsedId;
      }
    }

    const rawSavedAt = storage.getItem(LAST_SAVED_AT_KEY);
    if (rawSavedAt) {
      const parsedTime = JSON.parse(rawSavedAt);
      if (typeof parsedTime === 'number') {
        lastSavedAt = parsedTime;
      }
    }
  } catch {
    return { documents: [], activeDocId: null, lastSavedAt: null };
  }

  return { documents, activeDocId, lastSavedAt };
}
