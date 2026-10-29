import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, mkdir, open, readdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { basename, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { MAX_ATTACHMENT_BYTES, type SaveAttachmentInput, type StoredAttachment } from '@moss/client';

export interface AttachmentStoreOptions {
  rootDirectory: string;
  maxBytes?: number;
}

const STORAGE_KEY_PATTERN = /^attachments\/[a-f0-9-]{36}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?:\.[a-z0-9]{1,16})?$/i;

function normalizedName(name: string): string {
  const value = basename(String(name ?? ''))
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim();
  if (!value || value === '.' || value === '..') throw new Error('A valid file name is required');
  if (Buffer.byteLength(value, 'utf8') > 255) throw new Error('File name is too long');
  return value;
}

function safeExtension(name: string): string {
  const extension = extname(name).toLowerCase();
  return /^\.[a-z0-9]{1,16}$/.test(extension) ? extension : '';
}

function safeContentType(contentType: string): string {
  const value = String(contentType ?? '')
    .trim()
    .toLowerCase();
  return /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*(?:\s*;\s*[a-z0-9_-]+=[^;]+)*$/.test(value) ? value : 'application/octet-stream';
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export class AttachmentStore {
  readonly rootDirectory: string;
  private readonly maxBytes: number;

  constructor({ rootDirectory, maxBytes = MAX_ATTACHMENT_BYTES }: AttachmentStoreOptions) {
    if (!isAbsolute(rootDirectory)) throw new Error('Attachment root must be an absolute path');
    if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new Error('Attachment size limit must be a positive integer');
    this.rootDirectory = resolve(rootDirectory);
    this.maxBytes = maxBytes;
  }

  async save(input: SaveAttachmentInput): Promise<StoredAttachment> {
    const name = normalizedName(input.name);
    const contentType = safeContentType(input.contentType);
    const bytes = input.bytes;
    if (!(bytes instanceof Uint8Array)) throw new Error('Attachment bytes must be a Uint8Array');
    if (!bytes.byteLength) throw new Error('Empty files cannot be attached');
    if (bytes.byteLength > this.maxBytes) throw new Error(`Files must be ${Math.floor(this.maxBytes / 1024 / 1024)} MB or smaller`);

    const workspaceId = randomUUID();
    const workspaceKey = `attachments/${workspaceId}`;
    const directory = this.resolveStoragePath(workspaceId);
    const finalKey = `${workspaceKey}/${randomUUID()}${safeExtension(name)}`;
    const finalPath = this.resolveStorageKey(finalKey);
    const temporaryPath = this.resolveStoragePath(workspaceId, `.${randomUUID()}.tmp`);

    await mkdir(directory, { recursive: true, mode: 0o700 });
    try {
      const handle = await open(temporaryPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
      try {
        await handle.writeFile(bytes);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temporaryPath, finalPath);
    } catch (error) {
      await rm(temporaryPath, { force: true }).catch(() => {});
      await rm(directory, { recursive: true, force: true }).catch(() => {});
      throw error;
    }

    return {
      name,
      contentType,
      byteSize: bytes.byteLength,
      sha256: sha256(bytes),
      storageKey: finalKey,
    };
  }

  async copy(storageKey: string, contentType = 'application/octet-stream'): Promise<StoredAttachment> {
    const source = this.resolveStorageKey(storageKey);
    const sourceStats = await stat(source);
    if (!sourceStats.isFile()) throw new Error('Stored attachment was not found');
    if (sourceStats.size > this.maxBytes) throw new Error(`Files must be ${Math.floor(this.maxBytes / 1024 / 1024)} MB or smaller`);

    const workspaceId = randomUUID();
    const workspaceKey = `attachments/${workspaceId}`;
    const directory = this.resolveStoragePath(workspaceId);
    const finalKey = `${workspaceKey}/${randomUUID()}${safeExtension(source)}`;
    const finalPath = this.resolveStorageKey(finalKey);
    const temporaryPath = this.resolveStoragePath(workspaceId, `.${randomUUID()}.tmp`);

    await mkdir(directory, { recursive: true, mode: 0o700 });
    try {
      await copyFile(source, temporaryPath, constants.COPYFILE_EXCL);
      await rename(temporaryPath, finalPath);
    } catch (error) {
      await rm(temporaryPath, { force: true }).catch(() => {});
      await rm(directory, { recursive: true, force: true }).catch(() => {});
      throw error;
    }

    const bytes = await readFile(finalPath);
    return {
      name: basename(source),
      contentType: safeContentType(contentType),
      byteSize: bytes.byteLength,
      sha256: sha256(bytes),
      storageKey: finalKey,
    };
  }

  async read(storageKey: string): Promise<Uint8Array> {
    const path = this.resolveStorageKey(storageKey);
    const info = await stat(path);
    if (!info.isFile()) throw new Error('Stored attachment was not found');
    if (info.size > this.maxBytes) throw new Error('Stored attachment is too large');
    return new Uint8Array(await readFile(path));
  }

  resolveStorageKey(storageKey: string): string {
    if (!STORAGE_KEY_PATTERN.test(storageKey)) throw new Error('Invalid attachment storage key');
    const [, workspaceId, fileName] = storageKey.split('/');
    return this.resolveStoragePath(workspaceId!, fileName!);
  }

  private resolveStoragePath(...parts: string[]): string {
    const path = resolve(this.rootDirectory, ...parts);
    const pathFromRoot = relative(this.rootDirectory, path);
    if (!pathFromRoot || pathFromRoot.startsWith(`..${sep}`) || pathFromRoot === '..' || isAbsolute(pathFromRoot)) {
      throw new Error('Attachment path escapes its storage root');
    }
    return path;
  }

  async remove(storageKey: string): Promise<void> {
    const path = this.resolveStorageKey(storageKey);
    const directory = resolve(path, '..');
    const pathFromRoot = relative(this.rootDirectory, directory);
    if (!pathFromRoot || pathFromRoot.startsWith(`..${sep}`) || pathFromRoot === '..' || isAbsolute(pathFromRoot)) {
      throw new Error('Attachment path escapes its storage root');
    }
    await rm(path, { force: true });
    await rm(directory, { recursive: true, force: true });
  }

  async cleanup(activeStorageKeys: Iterable<string>): Promise<number> {
    const activeDirectories = new Set<string>();
    for (const storageKey of activeStorageKeys) {
      if (!STORAGE_KEY_PATTERN.test(storageKey)) continue;
      activeDirectories.add(storageKey.split('/')[1]!);
    }

    let removed = 0;
    let entries;
    try {
      entries = await readdir(this.rootDirectory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0;
      throw error;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || !/^[a-f0-9-]{36}$/i.test(entry.name) || activeDirectories.has(entry.name)) continue;
      await rm(this.resolveStoragePath(entry.name), { recursive: true, force: true });
      removed += 1;
    }
    return removed;
  }
}
