export interface FileScanResult { readonly status: 'clean'|'infected'; readonly engine: string; }
export const FILE_SCANNER = Symbol('FILE_SCANNER');
export interface FileScanner { scan(content: Uint8Array, fileName: string): Promise<FileScanResult>; }
