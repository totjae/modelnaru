import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const MAXIMUM_EXTRACTED_CHARACTERS = 2_000_000;

export class PdfInvalidError extends Error {}
export class PdfOcrRequiredError extends Error {}
export class PdfPageLimitError extends Error {}
export class PdfPasswordProtectedError extends Error {}
export class PdfTextTooLargeError extends Error {}

export interface ExtractedPdfAttachment {
  pageCount: number;
  text: string;
}

function pdfErrorName(error: unknown): string {
  return error instanceof Error ? error.name : '';
}

export async function extractPdfAttachment(
  bytes: Uint8Array,
  maximumPages: number,
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
    const text = pages.join('\n\n').trim();
    if (!text.replace(/\[PDF \d+페이지\]/gu, '').trim()) {
      throw new PdfOcrRequiredError();
    }
    return { pageCount: document.numPages, text };
  } catch (error) {
    if (
      error instanceof PdfOcrRequiredError ||
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
