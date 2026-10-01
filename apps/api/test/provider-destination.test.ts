import { createServer } from 'node:http';
import { request as httpRequest } from 'node:http';
import { networkInterfaces } from 'node:os';

import { describe, expect, it } from 'vitest';

import {
  createPinnedLookup,
  normalizeCustomDestination,
  resolveCustomDestination,
  secureProviderFetch,
} from '../src/provider-destination.js';

const publicInput = {
  approvedLocalIp: null,
  approvedLocalPort: null,
  baseUrl: 'https://models.example.com/v1/',
  destinationKind: 'public' as const,
};

describe('custom Provider destination boundary', () => {
  it('normalizes a public path and rejects URL syntax escapes', () => {
    expect(normalizeCustomDestination(publicInput).baseUrl).toBe(
      'https://models.example.com/v1',
    );
    for (const baseUrl of [
      'http://models.example.com/v1',
      'https://user@models.example.com/v1',
      'https://models.example.com/v1?key=x',
      'https://models.example.com/v1#part',
      'https://models.example.com/v1/../admin',
      'https://models.example.com/v1/%2e%2e/admin',
      'https://models.example.com/v1/%2fadmin',
      'https://127.0.0.1/v1',
      'https://169.254.169.254/v1',
    ])
      expect(() =>
        normalizeCustomDestination({ ...publicInput, baseUrl }),
      ).toThrow();
  });

  it('accepts only exact approved private IP and port for local HTTP', () => {
    const local = {
      approvedLocalIp: '192.168.1.10',
      approvedLocalPort: 11434,
      baseUrl: 'http://192.168.1.10:11434/v1',
      destinationKind: 'local' as const,
    };
    expect(normalizeCustomDestination(local)).toEqual(local);
    for (const baseUrl of [
      'http://192.168.1.11:11434/v1',
      'http://192.168.1.10:11435/v1',
      'http://127.0.0.1:11434/v1',
      'http://169.254.169.254:11434/v1',
      'http://[::ffff:192.168.1.10]:11434/v1',
      'http://[fe80::1]:11434/v1',
      'http://models.local:11434/v1',
    ])
      expect(() => normalizeCustomDestination({ ...local, baseUrl })).toThrow();
    expect(
      normalizeCustomDestination({
        ...local,
        baseUrl: 'http://[fd00::10]:11434/v1',
        approvedLocalIp: 'fd00::10',
      }).destinationKind,
    ).toBe('local');
  });

  it('refuses mixed public/private DNS and validates again on each request', async () => {
    let count = 0;
    const resolver = () => {
      count++;
      return Promise.resolve(
        count === 1
          ? [{ address: '8.8.8.8', family: 4 }]
          : [
              { address: '8.8.8.8', family: 4 },
              { address: '10.1.2.3', family: 4 },
            ],
      );
    };
    expect(
      (await resolveCustomDestination(publicInput, resolver as never)).address,
    ).toBe('8.8.8.8');
    await expect(
      resolveCustomDestination(publicInput, resolver as never),
    ).rejects.toThrow();
    expect(count).toBe(2);
  });

  it('connects a domain through Node automatic address-family selection using the pinned IP', async () => {
    const server = createServer((_request, response) => response.end('pinned'));
    try {
      await new Promise<void>((resolve, reject) =>
        server.listen(0, '127.0.0.1', resolve).once('error', reject),
      );
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('No port');
      let usedAllAddresses = false;
      const pinnedLookup = createPinnedLookup('127.0.0.1', 4);
      const body = await new Promise<string>((resolve, reject) => {
        const request = httpRequest(
          `http://provider.example:${address.port}/v1/models`,
          {
            lookup: (host, options, callback) => {
              usedAllAddresses = options.all === true;
              pinnedLookup(host, options, callback);
            },
          },
          (response) => {
            let text = '';
            response.setEncoding('utf8');
            response.on('data', (chunk: string) => (text += chunk));
            response.once('end', () => resolve(text));
          },
        );
        request.once('error', reject);
        request.end();
      });
      expect(body).toBe('pinned');
      expect(usedAllAddresses).toBe(true);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('converts HEAD, 204 and 205 without bodies and rejects an invalid response status', async () => {
    const localIp = Object.values(networkInterfaces())
      .flat()
      .find(
        (address) =>
          address?.family === 'IPv4' &&
          !address.internal &&
          /^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/u.test(
            address.address,
          ),
      )?.address;
    if (!localIp) throw new Error('No RFC1918 test interface');
    const server = createServer((request, response) => {
      response.writeHead(
        request.url === '/v1/no-content'
          ? 204
          : request.url === '/v1/reset-content'
            ? 205
            : request.url === '/v1/invalid'
              ? 600
              : 200,
      );
      response.end();
    });
    try {
      await new Promise<void>((resolve, reject) =>
        server.listen(0, localIp, resolve).once('error', reject),
      );
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('No port');
      const destination = {
        approvedLocalIp: localIp,
        approvedLocalPort: address.port,
        baseUrl: `http://${localIp}:${address.port}/v1`,
        destinationKind: 'local' as const,
      };
      for (const [path, method, status] of [
        ['/', 'HEAD', 200],
        ['/no-content', 'HEAD', 204],
        ['/no-content', 'GET', 204],
        ['/reset-content', 'GET', 205],
      ] as const) {
        const response = await secureProviderFetch(
          `${destination.baseUrl}${path}`,
          { method },
          destination,
        );
        expect(response.status).toBe(status);
        expect(response.body).toBeNull();
      }
      await expect(
        secureProviderFetch(
          `${destination.baseUrl}/invalid`,
          { method: 'GET' },
          destination,
        ),
      ).rejects.toThrow();
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
