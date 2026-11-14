import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIVE_DOC_STORAGE_KEY,
  DOCS_STORAGE_KEY,
  autoSaveDocument,
  deleteDocumentStorage,
  getAutoSaveKey,
  loadDocumentsState,
  persistActiveDocId,
  type StorageLike,
} from './documentStorage';
import type { LaTeXDocument } from '../types/editor';

function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem(key) {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key, value) {
      map.set(key, value);
    },
    removeItem(key) {
      map.delete(key);
    },
  };
}

test('loadDocumentsState returns empty list and null activeDocId on fresh storage', () => {
  const storage = createMemoryStorage();
  const loaded = loadDocumentsState(storage);
  assert.deepEqual(loaded.documents, []);
  assert.equal(loaded.activeDocId, null);
  assert.equal(loaded.lastSavedAt, null);
});

test('autoSaveDocument persists document list, active draft, and timestamp immediately', () => {
  const storage = createMemoryStorage();
  const doc: LaTeXDocument = {
    id: 'doc-1',
    title: 'Notes.tex',
    content: '\\section{Intro}\n$x^2$',
    updatedAt: 1000,
  };

  const { savedAt } = autoSaveDocument(doc, [doc], storage);
  persistActiveDocId(doc.id, storage);

  assert.ok(savedAt > 0);
  assert.ok(storage.getItem(getAutoSaveKey('doc-1')));
  assert.ok(storage.getItem(DOCS_STORAGE_KEY));

  const loaded = loadDocumentsState(storage);
  assert.equal(loaded.documents.length, 1);
  assert.equal(loaded.documents[0].content, '\\section{Intro}\n$x^2$');
  assert.equal(loaded.activeDocId, 'doc-1');
  assert.equal(loaded.lastSavedAt, savedAt);
});

test('loadDocumentsState recovers newer per-document auto-save draft over older docs list', () => {
  const storage = createMemoryStorage();
  const olderDoc: LaTeXDocument = {
    id: 'doc-2',
    title: 'Paper.tex',
    content: 'Old content',
    updatedAt: 1000,
  };
  storage.setItem(DOCS_STORAGE_KEY, JSON.stringify([olderDoc]));
  storage.setItem(ACTIVE_DOC_STORAGE_KEY, JSON.stringify('doc-2'));

  const newerDraft: LaTeXDocument = {
    id: 'doc-2',
    title: 'Paper.tex',
    content: 'Updated live content',
    updatedAt: 2500,
  };
  storage.setItem(
    getAutoSaveKey('doc-2'),
    JSON.stringify({ ...newerDraft, savedAt: 2500 })
  );

  const loaded = loadDocumentsState(storage);
  assert.equal(loaded.documents[0].content, 'Updated live content');
  assert.equal(loaded.documents[0].updatedAt, 2500);
});

test('closing active file sets activeDocId to null while preserving saved documents', () => {
  const storage = createMemoryStorage();
  const doc: LaTeXDocument = {
    id: 'doc-3',
    title: 'Draft.tex',
    content: 'Hello',
    updatedAt: 1000,
  };
  autoSaveDocument(doc, [doc], storage);
  persistActiveDocId(null, storage);

  const loaded = loadDocumentsState(storage);
  assert.equal(loaded.activeDocId, null);
  assert.equal(loaded.documents.length, 1);
});

test('deleteDocumentStorage removes per-document draft and updates activeDocId', () => {
  const storage = createMemoryStorage();
  const doc: LaTeXDocument = {
    id: 'doc-4',
    title: 'Temp.tex',
    content: 'Temp',
    updatedAt: 1000,
  };
  autoSaveDocument(doc, [doc], storage);
  persistActiveDocId('doc-4', storage);

  deleteDocumentStorage('doc-4', [], null, storage);
  assert.equal(storage.getItem(getAutoSaveKey('doc-4')), null);

  const loaded = loadDocumentsState(storage);
  assert.deepEqual(loaded.documents, []);
  assert.equal(loaded.activeDocId, null);
});
