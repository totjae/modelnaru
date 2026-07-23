import { imageSize } from 'image-size';

const imageExtensions = new Map([
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
]);

export class ImageDimensionsError extends Error {}
export class ImageTypeError extends Error {}

export interface ExtractedImageAttachment {
  height: number;
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
  width: number;
}

export function imageMediaType(
  fileName: string,
  mediaType: string,
): ExtractedImageAttachment['mediaType'] {
  const separator = fileName.lastIndexOf('.');
  const extension =
    separator >= 0 ? fileName.slice(separator).toLowerCase() : '';
  const expected = imageExtensions.get(extension);
  const normalized = mediaType.split(';', 1)[0]!.trim().toLowerCase();
  if (!expected || normalized !== expected) throw new ImageTypeError();
  return expected as ExtractedImageAttachment['mediaType'];
}

export function extractImageAttachment(
  bytes: Uint8Array,
  expectedMediaType: ExtractedImageAttachment['mediaType'],
  maximumPixels: number,
): ExtractedImageAttachment {
  let dimensions: ReturnType<typeof imageSize>;
  try {
    dimensions = imageSize(bytes);
  } catch {
    throw new ImageTypeError();
  }
  const actualMediaType =
    dimensions.type === 'jpg'
      ? 'image/jpeg'
      : dimensions.type === 'png'
        ? 'image/png'
        : dimensions.type === 'webp'
          ? 'image/webp'
          : null;
  if (
    actualMediaType !== expectedMediaType ||
    !dimensions.width ||
    !dimensions.height
  ) {
    throw new ImageTypeError();
  }
  if (dimensions.width * dimensions.height > maximumPixels) {
    throw new ImageDimensionsError();
  }
  return {
    height: dimensions.height,
    mediaType: actualMediaType,
    width: dimensions.width,
  };
}
