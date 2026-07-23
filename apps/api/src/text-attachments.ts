const supportedExtensions = new Set([
  '.c',
  '.cpp',
  '.cs',
  '.css',
  '.csv',
  '.go',
  '.h',
  '.hpp',
  '.html',
  '.java',
  '.js',
  '.json',
  '.jsonl',
  '.jsx',
  '.log',
  '.markdown',
  '.md',
  '.php',
  '.ps1',
  '.py',
  '.rb',
  '.rs',
  '.sh',
  '.sql',
  '.ts',
  '.tsv',
  '.tsx',
  '.txt',
  '.xml',
  '.yaml',
  '.yml',
]);

const acceptedApplicationTypes = new Set([
  'application/javascript',
  'application/json',
  'application/octet-stream',
  'application/sql',
  'application/x-httpd-php',
  'application/x-javascript',
  'application/x-sh',
  'application/xml',
  'application/yaml',
]);

export class TextAttachmentTypeError extends Error {}
export class TextAttachmentTooLargeError extends Error {}

export interface ExtractedTextAttachment {
  encoding: 'cp949' | 'utf-16be' | 'utf-16le' | 'utf-8';
  text: string;
}

export function safeOriginalName(value: string): string {
  const normalized = value.normalize('NFC').replaceAll('\0', '');
  const leaf = normalized.split(/[\\/]/u).at(-1)?.trim() ?? '';
  if (!leaf || leaf === '.' || leaf === '..' || leaf.length > 255) {
    throw new TextAttachmentTypeError();
  }
  return leaf;
}

export function textFileExtension(fileName: string): string {
  const lower = fileName.toLocaleLowerCase('en-US');
  const separator = lower.lastIndexOf('.');
  const extension = separator >= 0 ? lower.slice(separator) : '';
  if (!supportedExtensions.has(extension)) {
    throw new TextAttachmentTypeError();
  }
  return extension;
}

export function validateTextMediaType(mediaType: string): string {
  const normalized = mediaType.split(';', 1)[0]!.trim().toLowerCase();
  if (
    !normalized ||
    (!normalized.startsWith('text/') &&
      !acceptedApplicationTypes.has(normalized))
  ) {
    throw new TextAttachmentTypeError();
  }
  return normalized;
}

function decodeUtf16Be(input: Uint8Array): string {
  const swapped = new Uint8Array(input.byteLength);
  for (let index = 0; index < input.byteLength; index += 2) {
    swapped[index] = input[index + 1] ?? 0;
    swapped[index + 1] = input[index] ?? 0;
  }
  return new TextDecoder('utf-16le', { fatal: true }).decode(swapped);
}

function decodeText(input: Uint8Array): ExtractedTextAttachment {
  if (
    input.byteLength >= 3 &&
    input[0] === 0xef &&
    input[1] === 0xbb &&
    input[2] === 0xbf
  ) {
    return {
      encoding: 'utf-8',
      text: new TextDecoder('utf-8', { fatal: true }).decode(input.slice(3)),
    };
  }
  if (input.byteLength >= 2 && input[0] === 0xff && input[1] === 0xfe) {
    return {
      encoding: 'utf-16le',
      text: new TextDecoder('utf-16le', { fatal: true }).decode(input.slice(2)),
    };
  }
  if (input.byteLength >= 2 && input[0] === 0xfe && input[1] === 0xff) {
    return {
      encoding: 'utf-16be',
      text: decodeUtf16Be(input.slice(2)),
    };
  }
  try {
    return {
      encoding: 'utf-8',
      text: new TextDecoder('utf-8', { fatal: true }).decode(input),
    };
  } catch {
    try {
      return {
        encoding: 'cp949',
        text: new TextDecoder('euc-kr', { fatal: true }).decode(input),
      };
    } catch {
      throw new TextAttachmentTypeError();
    }
  }
}

export function extractTextAttachment(
  input: Uint8Array,
  maximumCharacters = 2_000_000,
): ExtractedTextAttachment {
  if (input.byteLength === 0) throw new TextAttachmentTypeError();
  const extracted = decodeText(input);
  const text = extracted.text.replace(/\r\n?/gu, '\n');
  if (text.includes('\0')) throw new TextAttachmentTypeError();
  if (text.length > maximumCharacters) {
    throw new TextAttachmentTooLargeError();
  }
  return { ...extracted, text };
}

export function attachmentContext(
  content: string,
  attachments: Array<{ originalName: string; text: string }>,
): string {
  if (attachments.length === 0) return content;
  const sections = attachments.map(
    (attachment) =>
      `[첨부파일: ${attachment.originalName}]\n${attachment.text}`,
  );
  return [content, ...sections].filter(Boolean).join('\n\n');
}
