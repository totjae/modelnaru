import { describe, expect, it } from 'vitest';

import {
  extractImageAttachment,
  ImageDimensionsError,
  imageMediaType,
  ImageTypeError,
} from '../src/image-attachments.js';

function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  new DataView(bytes.buffer).setUint32(8, 13);
  bytes.set(new TextEncoder().encode('IHDR'), 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes.set([8, 6, 0, 0, 0], 24);
  return bytes;
}

describe('image attachments', () => {
  it('accepts matching JPEG, PNG and WebP extension MIME pairs', () => {
    expect(imageMediaType('photo.JPG', 'image/jpeg')).toBe('image/jpeg');
    expect(imageMediaType('chart.png', 'image/png')).toBe('image/png');
    expect(imageMediaType('screen.webp', 'image/webp')).toBe('image/webp');
  });

  it('rejects a mismatched image extension and MIME', () => {
    expect(() => imageMediaType('photo.jpg', 'image/png')).toThrow(
      ImageTypeError,
    );
  });

  it('reads dimensions from the actual image body', () => {
    expect(
      extractImageAttachment(pngHeader(320, 240), 'image/png', 40_000_000),
    ).toEqual({
      height: 240,
      mediaType: 'image/png',
      width: 320,
    });
  });

  it('rejects images above the decoded pixel limit', () => {
    expect(() =>
      extractImageAttachment(
        pngHeader(10_000, 10_000),
        'image/png',
        40_000_000,
      ),
    ).toThrow(ImageDimensionsError);
  });

  it('rejects image content that does not match its declared type', () => {
    expect(() =>
      extractImageAttachment(pngHeader(1, 1), 'image/jpeg', 40_000_000),
    ).toThrow(ImageTypeError);
  });
});
