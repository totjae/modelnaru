import { isIP } from 'node:net';

import { z } from 'zod';

const integer = (minimum: number, maximum: number) =>
  z.number().int().min(minimum).max(maximum);

const relativeOrAbsolutePath = z
  .string()
  .trim()
  .min(1)
  .refine(
    (value) => !value.includes('\0'),
    'Path must not contain a null byte',
  );

const httpsUrl = z
  .url()
  .refine((value) => new URL(value).protocol === 'https:', {
    message: 'Public base URL must use HTTPS',
  });

export const modelNaruConfigSchema = z
  .object({
    version: z.literal(1),
    server: z
      .object({
        host: z
          .string()
          .trim()
          .refine(
            (value) => isIP(value) === 4,
            'Bind host must be an IPv4 address',
          )
          .default('127.0.0.1'),
        port: integer(1, 65_535).default(32_432),
        publicBaseUrl: httpsUrl,
        trustProxy: z
          .object({
            enabled: z.boolean().default(true),
            addresses: z.array(z.string().trim().min(1)).min(1),
          })
          .strict(),
        shutdownGraceSeconds: integer(1, 300).default(30),
      })
      .strict(),
    admin: z
      .object({
        username: z
          .string()
          .trim()
          .min(3)
          .max(64)
          .regex(/^[a-zA-Z0-9_.-]+$/),
        passwordHash: z
          .string()
          .regex(
            /^\$argon2id\$v=\d+\$m=\d+,t=\d+,p=\d+\$[A-Za-z0-9+/.=-]+\$[A-Za-z0-9+/.=-]+$/,
          ),
        totpSecret: z
          .string()
          .trim()
          .min(16)
          .max(128)
          .regex(/^[A-Z2-7]+$/),
        requireTotp: z.literal(true),
      })
      .strict(),
    database: z
      .object({
        urlFile: relativeOrAbsolutePath,
      })
      .strict(),
    storage: z
      .object({
        root: relativeOrAbsolutePath,
        temp: relativeOrAbsolutePath,
        attachmentRetentionDays: integer(1, 3_650).default(30),
        minimumFreeBytesForUpload: integer(0, Number.MAX_SAFE_INTEGER).default(
          21_474_836_480,
        ),
        warningFreeBytes: integer(0, Number.MAX_SAFE_INTEGER).default(
          42_949_672_960,
        ),
      })
      .strict()
      .refine(
        (value) => value.warningFreeBytes >= value.minimumFreeBytesForUpload,
        {
          message:
            'warningFreeBytes must be greater than or equal to minimumFreeBytesForUpload',
          path: ['warningFreeBytes'],
        },
      ),
    security: z
      .object({
        cookieSecure: z.literal(true),
        cookieSameSite: z.enum(['lax', 'strict']).default('lax'),
        allowedHosts: z
          .array(
            z
              .string()
              .trim()
              .min(1)
              .regex(/^(?:\[[0-9a-fA-F:]+\]|[a-zA-Z0-9.-]+)(?::\d{1,5})?$/),
          )
          .min(1),
        csrfEnabled: z.literal(true),
      })
      .strict(),
    sessions: z
      .object({
        maximumActivePerAccount: integer(1, 10).default(3),
        idleTimeoutHours: integer(1, 168).default(24),
        absoluteTimeoutDays: integer(1, 30).default(7),
      })
      .strict(),
    limits: z
      .object({
        maximumGlobalAiGenerations: integer(1, 20).default(3),
        maximumAiGenerationsPerUser: integer(1, 10).default(2),
        maximumPdfWorkers: integer(1, 4).default(1),
        maximumOcrWorkers: integer(1, 4).default(1),
        maximumFileBytes: integer(1, 104_857_600).default(10_485_760),
        maximumImagePixels: integer(1, 100_000_000).default(40_000_000),
        maximumAttachmentsPerMessage: integer(1, 20).default(10),
        maximumPdfPages: integer(1, 500).default(100),
      })
      .strict()
      .refine(
        (value) =>
          value.maximumAiGenerationsPerUser <= value.maximumGlobalAiGenerations,
        {
          message:
            'Per-user AI generation limit must not exceed the global limit',
          path: ['maximumAiGenerationsPerUser'],
        },
      ),
    logging: z
      .object({
        level: z
          .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
          .default('info'),
        directory: relativeOrAbsolutePath,
      })
      .strict(),
    providerSecrets: z
      .object({
        masterEncryptionKeyFile: relativeOrAbsolutePath,
      })
      .strict(),
  })
  .strict();

export type ModelNaruConfig = z.infer<typeof modelNaruConfigSchema>;
