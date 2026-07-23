import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { LocalPdfOcrEngine } from '../src/pdf-ocr.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

describe('LocalPdfOcrEngine', () => {
  it('renders pages sequentially and recognizes Korean and English', async () => {
    const root = await mkdtemp(join(tmpdir(), 'modelnaru-ocr-test-'));
    roots.push(root);
    const run = vi.fn(async (executable: string, arguments_: string[]) => {
      if (executable === 'pdftoppm') {
        await writeFile(`${arguments_.at(-1)}.png`, 'png');
        return { stderr: '', stdout: '' };
      }
      return {
        stderr: '',
        stdout: ` 페이지 ${run.mock.calls.filter(([name]) => name === 'tesseract').length} OCR \r\n`,
      };
    });

    const result = await new LocalPdfOcrEngine(root, run).recognize(
      new TextEncoder().encode('%PDF-test'),
      2,
    );

    expect(result).toEqual(
      new Map([
        [1, '페이지 1 OCR'],
        [2, '페이지 2 OCR'],
      ]),
    );
    expect(run).toHaveBeenCalledTimes(4);
    expect(run).toHaveBeenCalledWith(
      'tesseract',
      expect.arrayContaining(['kor+eng']),
    );
  });
});
