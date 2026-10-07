export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');
export interface ObjectStorage {
  put(key: string, content: Uint8Array, mediaType: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
}
