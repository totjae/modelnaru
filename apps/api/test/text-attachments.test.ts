import { describe, expect, it } from 'vitest';

import {
  attachmentContext,
  extractTextAttachment,
  safeOriginalName,
  TextAttachmentTooLargeError,
  TextAttachmentTypeError,
  textFileExtension,
  validateTextMediaType,
} from '../src/text-attachments.js';

describe('text attachments', () => {
  it('normalizes path-like names without using them as storage keys', () => {
    expect(safeOriginalName('../../문서.md')).toBe('문서.md');
    expect(() => safeOriginalName('../')).toThrow(TextAttachmentTypeError);
  });

  it('allows documented text extensions and compatible media types', () => {
    expect(textFileExtension('config.JSON')).toBe('.json');
    expect(validateTextMediaType('text/markdown; charset=utf-8')).toBe(
      'text/markdown',
    );
    expect(validateTextMediaType('application/octet-stream')).toBe(
      'application/octet-stream',
    );
    expect(() => textFileExtension('photo.png')).toThrow(
      TextAttachmentTypeError,
    );
    expect(() => validateTextMediaType('image/png')).toThrow(
      TextAttachmentTypeError,
    );
  });

  it('extracts UTF-8 and UTF-16 text and normalizes newlines', () => {
    expect(
      extractTextAttachment(new TextEncoder().encode('첫 줄\r\n둘째 줄')),
    ).toEqual({ encoding: 'utf-8', text: '첫 줄\n둘째 줄' });
    expect(
      extractTextAttachment(
        Uint8Array.from([0xff, 0xfe, 0x41, 0x00, 0x42, 0x00]),
      ),
    ).toEqual({ encoding: 'utf-16le', text: 'AB' });
  });

  it('rejects binary NUL content and oversized extracted text', () => {
    expect(() =>
      extractTextAttachment(Uint8Array.from([0x41, 0x00, 0x42])),
    ).toThrow(TextAttachmentTypeError);
    expect(() =>
      extractTextAttachment(new TextEncoder().encode('abcd'), 3),
    ).toThrow(TextAttachmentTooLargeError);
  });

  it('adds extracted text without changing the stored user content', () => {
    expect(
      attachmentContext('질문', [
        { originalName: 'notes.md', text: '첨부 내용' },
      ]),
    ).toBe('질문\n\n[첨부파일: notes.md]\n첨부 내용');
  });
});
