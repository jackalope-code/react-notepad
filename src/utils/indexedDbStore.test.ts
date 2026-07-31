import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { getWorkspace, putWorkspace } from './indexedDbStore';
import type { StoredWorkspaceV3 } from './notepadTypes';

beforeEach(() => {
  // Reset the fake IndexedDB between tests so each test starts with an empty database.
  globalThis.indexedDB = new IDBFactory();
});

const workspace: StoredWorkspaceV3 = {
  version: 3,
  documents: [
    {
      id: 'doc-1',
      title: 'My Doc',
      lines: ['hello', 'world'],
      options: { text: { notepadWrap: true } },
      markdownEnabled: false,
    },
  ],
  activeDocumentId: 'doc-1',
};

describe('indexedDbStore', () => {
  it('returns null when no workspace has been stored yet', async () => {
    const result = await getWorkspace();
    expect(result).toBeNull();
  });

  it('putWorkspace then getWorkspace round-trips the workspace', async () => {
    await putWorkspace(workspace);
    const result = await getWorkspace();
    expect(result).toEqual(workspace);
  });

  it('putWorkspace overwrites the previous workspace (single fixed key)', async () => {
    await putWorkspace(workspace);
    const updated: StoredWorkspaceV3 = {
      ...workspace,
      documents: [{ ...workspace.documents[0], title: 'Renamed' }],
    };
    await putWorkspace(updated);
    const result = await getWorkspace();
    expect(result?.documents[0].title).toBe('Renamed');
  });

  it('rejects when IndexedDB is unavailable', async () => {
    // @ts-expect-error simulate an environment without IndexedDB support
    delete globalThis.indexedDB;
    await expect(getWorkspace()).rejects.toThrow();
    // restore for subsequent tests in this file
    globalThis.indexedDB = new IDBFactory();
  });
});
