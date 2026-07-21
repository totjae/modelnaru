import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function sha256(value: string | Uint8Array): Buffer {
  return createHash('sha256').update(value).digest();
}

export function createOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

export function createAdminCredentialFingerprint(input: {
  passwordHash: string;
  requireTotp: boolean;
  totpSecret: string;
  username: string;
}): Buffer {
  return sha256(
    [
      'modelnaru:admin-credential:v1',
      input.username.toLowerCase(),
      input.passwordHash,
      input.totpSecret,
      input.requireTotp ? '1' : '0',
    ].join('\0'),
  );
}

export function createKeyedMetadataHash(
  key: Uint8Array,
  domain: 'ip' | 'login-rate',
  value: string,
): Buffer {
  return createHmac('sha256', key)
    .update(`modelnaru:${domain}:v1\0`)
    .update(value)
    .digest();
}

export function constantTimeStringEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function constantTimeBufferEqual(
  left: Uint8Array,
  right: Uint8Array,
): boolean {
  return left.byteLength === right.byteLength && timingSafeEqual(left, right);
}

function decodeBase32(value: string): Buffer {
  let bits = 0;
  let accumulator = 0;
  const output: number[] = [];

  for (const character of value.replace(/=+$/u, '').toUpperCase()) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index < 0) {
      throw new Error('Invalid Base32 value');
    }
    accumulator = (accumulator << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((accumulator >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(output);
}

function generateTotp(secret: Uint8Array, counter: bigint): string {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(counter);
  const digest = createHmac('sha1', secret).update(counterBuffer).digest();
  const offset = (digest.at(-1) ?? 0) & 0x0f;
  const binary =
    (((digest[offset] ?? 0) & 0x7f) << 24) |
    ((digest[offset + 1] ?? 0) << 16) |
    ((digest[offset + 2] ?? 0) << 8) |
    (digest[offset + 3] ?? 0);
  return String(binary % 1_000_000).padStart(6, '0');
}

export function verifyTotp(
  base32Secret: string,
  code: string,
  nowMilliseconds = Date.now(),
): boolean {
  if (!/^\d{6}$/u.test(code)) {
    return false;
  }

  let secret: Buffer;
  try {
    secret = decodeBase32(base32Secret);
  } catch {
    return false;
  }
  const currentCounter = BigInt(Math.floor(nowMilliseconds / 30_000));
  for (const offset of [-1n, 0n, 1n]) {
    if (currentCounter + offset < 0n) {
      continue;
    }
    if (
      constantTimeStringEqual(
        generateTotp(secret, currentCounter + offset),
        code,
      )
    ) {
      return true;
    }
  }
  return false;
}
