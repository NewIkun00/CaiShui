import { Injectable } from '@nestjs/common';
import type { ObjectStorage } from '../application/object-storage.js';

@Injectable()
export class MemoryObjectStorage implements ObjectStorage {
  private readonly objects = new Map<string, Uint8Array>();
  put(key: string, content: Uint8Array): Promise<void> { this.objects.set(key, Uint8Array.from(content)); return Promise.resolve(); }
  get(key: string): Promise<Uint8Array | null> { const value = this.objects.get(key); return Promise.resolve(value ? Uint8Array.from(value) : null); }
  delete(key: string): Promise<void> { this.objects.delete(key); return Promise.resolve(); }
}
