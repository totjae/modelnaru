import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const MAXIMUM_EXTRACTED_CHARACTERS = 2_000_000;

export class PdfInvalidError extends Error {}
export class PdfOcrFailedError extends Error {}
export class PdfOcrNoTextError extends Error {}
export class PdfOcrRequiredError extends Error {}
export class PdfOcrUnavailableError extends Error {}
export class PdfPageLimitError extends Error {}
export class PdfPasswordProtectedError extends Error {}
export class PdfTextTooLargeError extends Error {}

export interface ExtractedPdfAttachment {
  ocrPageCount: number;
  pageCount: number;
  text: string;
}

export interface PdfOcrEngine {
  recognize(bytes: Uint8Array, pageCount: number): Promise<Map<number, string>>;
}

function pdfErrorName(error: unknown): string {
  return error instanceof Error ? error.name : '';
}

export async function extractPdfAttachment(
  bytes: Uint8Array,
  maximumPages: number,
  ocr?: PdfOcrEngine,
): Promise<ExtractedPdfAttachment> {
  if (
    bytes.byteLength < 5 ||
    new TextDecoder('ascii').decode(bytes.subarray(0, 5)) !== '%PDF-'
  ) {
    throw new PdfInvalidError();
  }

  let document: Awaited<ReturnType<typeof getDocument>['promise']>;
  try {
    document = await getDocument({
      data: new Uint8Array(bytes),
      isEvalSupported: false,
      useSystemFonts: false,
    }).promise;
  } catch (error) {
    if (pdfErrorName(error) === 'PasswordException') {
      throw new PdfPasswordProtectedError();
    }
    throw new PdfInvalidError();
  }

  try {
    if (document.numPages > maximumPages) throw new PdfPageLimitError();
    const pages: string[] = [];
    let extractedCharacters = 0;
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) =>
          'str' in item ? `${item.str}${item.hasEOL ? '\n' : ' '}` : '',
        )
        .join('')
        .replace(/\s+\n/gu, '\n')
        .replace(/[ \t]{2,}/gu, ' ')
        .trim();
      const section = `[PDF ${pageNumber}페이지]\n${text}`;
      extractedCharacters += section.length;
      if (extractedCharacters > MAXIMUM_EXTRACTED_CHARACTERS) {
        throw new PdfTextTooLargeError();
      }
      pages.push(section);
    }
    let text = pages.join('\n\n').trim();
    let ocrPageCount = 0;
    if (!text.replace(/\[PDF \d+페이지\]/gu, '').trim()) {
      if (!ocr) throw new PdfOcrRequiredError();
      const recognized = await ocr.recognize(bytes, document.numPages);
      const ocrPages: string[] = [];
      for (
        let pageNumber = 1;
        pageNumber <= document.numPages;
        pageNumber += 1
      ) {
        const pageText = recognized.get(pageNumber)?.trim() ?? '';
        ocrPages.push(`[PDF ${pageNumber}페이지 · OCR]\n${pageText}`);
      }
      text = ocrPages.join('\n\n').trim();
      ocrPageCount = document.numPages;
      if (!text.replace(/\[PDF \d+페이지 · OCR\]/gu, '').trim()) {
        throw new PdfOcrNoTextError();
      }
      if (text.length > MAXIMUM_EXTRACTED_CHARACTERS) {
        throw new PdfTextTooLargeError();
      }
    }
    return { ocrPageCount, pageCount: document.numPages, text };
  } catch (error) {
    if (
      error instanceof PdfOcrFailedError ||
      error instanceof PdfOcrNoTextError ||
      error instanceof PdfOcrRequiredError ||
      error instanceof PdfOcrUnavailableError ||
      error instanceof PdfPageLimitError ||
      error instanceof PdfTextTooLargeError
    ) {
      throw error;
    }
    if (pdfErrorName(error) === 'PasswordException') {
      throw new PdfPasswordProtectedError();
    }
    throw new PdfInvalidError();
  } finally {
    await document.destroy();
  }
}
