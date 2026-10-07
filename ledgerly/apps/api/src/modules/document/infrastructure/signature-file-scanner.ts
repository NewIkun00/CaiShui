import { Injectable } from '@nestjs/common';
import type { FileScanner, FileScanResult } from '../application/file-scanner.js';

@Injectable()
export class SignatureFileScanner implements FileScanner {
  scan(content: Uint8Array): Promise<FileScanResult> {
    const sample = Buffer.from(content).toString('latin1');
    return Promise.resolve({
      status: sample.includes('EICAR-STANDARD-ANTIVIRUS-TEST-FILE') ? 'infected' : 'clean',
      engine: 'signature-baseline-v1',
    });
  }
}
