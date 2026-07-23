import { describe, expect, it } from 'vitest';

import {
  extractPdfAttachment,
  PdfInvalidError,
  PdfOcrRequiredError,
  PdfPageLimitError,
} from '../src/pdf-attachments.js';

function pdfBytes(text: string): Uint8Array {
  const escaped = text
    .replaceAll('\\', '\\\\')
    .replaceAll('(', '\\(')
    .replaceAll(')', '\\)');
  const stream = `BT /F1 12 Tf 72 720 Td (${escaped}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(new TextEncoder().encode(pdf).byteLength);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = new TextEncoder().encode(pdf).byteLength;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

describe('PDF attachments', () => {
  it('extracts text and page count from a text PDF', async () => {
    await expect(
      extractPdfAttachment(pdfBytes('ModelNaru PDF TEST 7429'), 100),
    ).resolves.toEqual({
      pageCount: 1,
      text: '[PDF 1페이지]\nModelNaru PDF TEST 7429',
    });
  });

  it('rejects a PDF above the configured page limit', async () => {
    await expect(
      extractPdfAttachment(pdfBytes('one page'), 0),
    ).rejects.toBeInstanceOf(PdfPageLimitError);
  });

  it('identifies a PDF without a text layer as requiring OCR', async () => {
    await expect(
      extractPdfAttachment(pdfBytes(''), 100),
    ).rejects.toBeInstanceOf(PdfOcrRequiredError);
  });

  it('rejects data that only claims to be a PDF', async () => {
    await expect(
      extractPdfAttachment(new TextEncoder().encode('%PDF-not-valid'), 100),
    ).rejects.toBeInstanceOf(PdfInvalidError);
  });
});
