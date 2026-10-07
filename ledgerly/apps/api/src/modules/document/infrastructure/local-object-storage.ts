import { Injectable } from '@nestjs/common';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import type { ObjectStorage } from '../application/object-storage.js';

@Injectable()
export class LocalObjectStorage implements ObjectStorage {
  private readonly root = resolve(process.env['LOCAL_OBJECT_STORAGE_DIR'] ?? '.data/private-objects');

  async put(key: string, content: Uint8Array): Promise<void> {
    const path = this.path(key); await mkdir(resolve(path, '..'), { recursive: true }); await writeFile(path, content, { mode: 0o600 });
  }
  async get(key: string): Promise<Uint8Array | null> {
    try { return await readFile(this.path(key)); } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return null; throw error;
    }
  }
  async delete(key: string): Promise<void> {
    try { await unlink(this.path(key)); } catch (error: unknown) {
      if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT')) throw error;
    }
  }
  private path(key: string): string {
    if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}$/.test(key)) throw new Error('Invalid object key');
    const path = resolve(this.root, key); if (!path.startsWith(`${this.root}${sep}`)) throw new Error('Invalid object key'); return path;
  }
}
