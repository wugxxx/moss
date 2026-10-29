import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AttachmentStore } from '../../apps/desktop/src/attachment-store.js';

const directories: string[] = [];

function createStore(maxBytes?: number): AttachmentStore {
  const root = mkdtempSync(join(tmpdir(), 'moss-attachments-'));
  directories.push(root);
  return new AttachmentStore({ rootDirectory: root, maxBytes });
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('AttachmentStore', () => {
  it('writes, reads, copies, and removes file bytes', async () => {
    const store = createStore();
    const metadata = await store.save({
      name: 'project brief.pdf',
      contentType: 'application/pdf',
      bytes: new TextEncoder().encode('attachment contents'),
    });

    expect(metadata).toMatchObject({
      name: 'project brief.pdf',
      contentType: 'application/pdf',
      byteSize: 19,
    });
    expect(await store.read(metadata.storageKey)).toEqual(new TextEncoder().encode('attachment contents'));

    const copy = await store.copy(metadata.storageKey, 'application/pdf');
    expect(copy.storageKey).not.toBe(metadata.storageKey);
    expect(copy.sha256).toBe(metadata.sha256);
    expect(await store.read(copy.storageKey)).toEqual(await store.read(metadata.storageKey));

    await store.remove(metadata.storageKey);
    await expect(store.read(metadata.storageKey)).rejects.toThrow();
    await store.remove(copy.storageKey);
    await expect(store.read(copy.storageKey)).rejects.toThrow();
  });

  it('uses generated storage keys and strips directory traversal from display names', async () => {
    const store = createStore();
    const metadata = await store.save({
      name: '../../private/report.txt',
      contentType: 'text/plain',
      bytes: new TextEncoder().encode('safe'),
    });

    expect(metadata.name).toBe('report.txt');
    expect(metadata.storageKey).toMatch(/^attachments\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.txt$/);
    expect(() => store.resolveStorageKey('../../outside.txt')).toThrow('Invalid attachment storage key');
  });

  it('rejects empty, oversized, and unknown storage-key inputs', async () => {
    const store = createStore(4);
    await expect(
      store.save({
        name: 'empty.txt',
        contentType: 'text/plain',
        bytes: new Uint8Array(),
      }),
    ).rejects.toThrow('Empty files cannot be attached');
    await expect(
      store.save({
        name: 'large.txt',
        contentType: 'text/plain',
        bytes: new Uint8Array(5),
      }),
    ).rejects.toThrow('Files must be 0 MB or smaller');

    await expect(store.read('attachments/../../outside.txt')).rejects.toThrow('Invalid attachment storage key');
  });

  it('removes orphaned attachment directories without touching active files', async () => {
    const store = createStore();
    const active = await store.save({
      name: 'keep.txt',
      contentType: 'text/plain',
      bytes: new TextEncoder().encode('keep'),
    });
    const orphan = await store.save({
      name: 'orphan.txt',
      contentType: 'text/plain',
      bytes: new TextEncoder().encode('orphan'),
    });

    expect(await store.cleanup([active.storageKey])).toBe(1);
    expect(await store.read(active.storageKey)).toEqual(new TextEncoder().encode('keep'));
    await expect(store.read(orphan.storageKey)).rejects.toThrow();
  });
});
