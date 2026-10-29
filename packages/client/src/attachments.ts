export const MAX_ATTACHMENT_BYTES = 250 * 1024 * 1024;
export const MAX_ATTACHMENT_PREVIEW_BYTES = 25 * 1024 * 1024;

export interface SaveAttachmentInput {
  name: string;
  contentType: string;
  bytes: Uint8Array;
}

export interface StoredAttachment {
  name: string;
  contentType: string;
  byteSize: number;
  sha256: string;
  storageKey: string;
}

/**
 * Host-owned file bytes. Renderer code only receives generated storage keys,
 * never filesystem paths or a general-purpose filesystem API.
 */
export interface AttachmentStorage {
  save(input: SaveAttachmentInput): Promise<StoredAttachment>;
  copy(storageKey: string, contentType?: string): Promise<StoredAttachment>;
  read(storageKey: string): Promise<Uint8Array>;
  open(storageKey: string): Promise<void>;
  reveal(storageKey: string): Promise<void>;
  remove(storageKey: string): Promise<void>;
  cleanup?(activeStorageKeys: Iterable<string>): Promise<number>;
}
