import { execFile } from 'node:child_process';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  PdfOcrFailedError,
  type PdfOcrEngine,
  PdfOcrUnavailableError,
} from './pdf-attachments.js';

const COMMAND_TIMEOUT_MS = 90_000;
const MAXIMUM_COMMAND_OUTPUT_BYTES = 16 * 1024 * 1024;

interface CommandResult {
  stderr: string;
  stdout: string;
}

export type OcrCommandRunner = (
  executable: string,
  arguments_: string[],
) => Promise<CommandResult>;

function command(
  executable: string,
  arguments_: string[],
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    execFile(
      executable,
      arguments_,
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          LANG: 'C.UTF-8',
          OMP_THREAD_LIMIT: '1',
        },
        maxBuffer: MAXIMUM_COMMAND_OUTPUT_BYTES,
        timeout: COMMAND_TIMEOUT_MS,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            error instanceof Error
              ? error
              : new Error('OCR command execution failed'),
          );
          return;
        }
        resolve({ stderr, stdout });
      },
    );
  });
}

function unavailable(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

function normalizeOcrText(text: string): string {
  return text
    .replaceAll('\r\n', '\n')
    .replace(/[ \t]+\n/gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

export class LocalPdfOcrEngine implements PdfOcrEngine {
  constructor(
    private readonly temporaryRoot: string,
    private readonly run: OcrCommandRunner = command,
  ) {}

  async recognize(
    bytes: Uint8Array,
    pageCount: number,
  ): Promise<Map<number, string>> {
    await mkdir(this.temporaryRoot, { recursive: true });
    const directory = await mkdtemp(join(this.temporaryRoot, 'pdf-ocr-'));
    const inputPath = join(directory, 'input.pdf');
    const pages = new Map<number, string>();
    try {
      await writeFile(inputPath, bytes, { mode: 0o600 });
      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        const outputPrefix = join(directory, `page-${pageNumber}`);
        const imagePath = `${outputPrefix}.png`;
        try {
          await this.run('pdftoppm', [
            '-f',
            String(pageNumber),
            '-l',
            String(pageNumber),
            '-r',
            '200',
            '-png',
            '-singlefile',
            inputPath,
            outputPrefix,
          ]);
          await access(imagePath);
          const result = await this.run('tesseract', [
            imagePath,
            'stdout',
            '-l',
            'kor+eng',
            '--psm',
            '3',
          ]);
          pages.set(pageNumber, normalizeOcrText(result.stdout));
        } catch (error) {
          if (unavailable(error)) throw new PdfOcrUnavailableError();
          throw new PdfOcrFailedError();
        } finally {
          await rm(imagePath, { force: true }).catch(() => undefined);
        }
      }
      return pages;
    } finally {
      await rm(directory, { force: true, recursive: true }).catch(
        () => undefined,
      );
    }
  }
}
