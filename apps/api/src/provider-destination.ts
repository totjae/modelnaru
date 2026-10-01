import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';
import { Readable } from 'node:stream';

export type DestinationKind = 'public' | 'local';

export class ProviderDestinationError extends Error {
  readonly code = 'PROVIDER_DESTINATION_DENIED';
}

const deniedV4 = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  deniedV4.addSubnet(address, prefix, 'ipv4');

const deniedV6 = new BlockList();
const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');
for (const [address, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['::ffff:0:0', 96],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
  ['2001::', 32],
  ['2001:10::', 28],
  ['2001:db8::', 32],
  ['2002::', 16],
] as const)
  deniedV6.addSubnet(address, prefix, 'ipv6');

function denied(): never {
  throw new ProviderDestinationError('Provider destination is not allowed.');
}

function addressKind(address: string): 'public' | 'local' | 'denied' {
  const family = isIP(address);
  if (family === 4) {
    if (deniedV4.check(address, 'ipv4')) {
      const privateV4 = new BlockList();
      privateV4.addSubnet('10.0.0.0', 8);
      privateV4.addSubnet('172.16.0.0', 12);
      privateV4.addSubnet('192.168.0.0', 16);
      return privateV4.check(address) ? 'local' : 'denied';
    }
    return 'public';
  }
  if (family === 6) {
    if (address.toLowerCase().startsWith('::ffff:')) return 'denied';
    if (deniedV6.check(address, 'ipv6'))
      return address.toLowerCase().startsWith('fc') ||
        address.toLowerCase().startsWith('fd')
        ? 'local'
        : 'denied';
    return globalV6.check(address, 'ipv6') ? 'public' : 'denied';
  }
  return 'denied';
}

export interface CustomDestination {
  baseUrl: string;
  destinationKind: DestinationKind;
  approvedLocalIp: string | null;
  approvedLocalPort: number | null;
}

export function normalizeCustomDestination(
  input: CustomDestination,
): CustomDestination {
  if (typeof input.baseUrl !== 'string' || input.baseUrl.length > 2_048)
    denied();
  const raw = input.baseUrl.trim();
  if (/[%](?:2e|2f|5c)/iu.test(raw) || /\\/u.test(raw)) denied();
  const rawPath = raw.match(/^[A-Za-z]+:\/\/[^/?#]+(\/[^?#]*)?/u)?.[1] ?? '';
  if (rawPath.split('/').some((segment) => segment === '.' || segment === '..'))
    denied();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return denied();
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !url.hostname ||
    raw.includes('?') ||
    raw.includes('#') ||
    url.pathname
      .split('/')
      .some((segment) => segment === '.' || segment === '..')
  )
    denied();
  const host = url.hostname.replace(/^\[|\]$/gu, '');
  if (host.includes('%')) denied();
  if (input.destinationKind === 'public') {
    if (
      url.protocol !== 'https:' ||
      input.approvedLocalIp !== null ||
      input.approvedLocalPort !== null
    )
      denied();
    if (isIP(host) && addressKind(host) !== 'public') denied();
  } else if (input.destinationKind === 'local') {
    const port = Number(url.port);
    if (
      url.protocol !== 'http:' ||
      !isIP(host) ||
      addressKind(host) !== 'local' ||
      !Number.isInteger(port) ||
      port < 1 ||
      port > 65_535 ||
      input.approvedLocalIp !== host ||
      input.approvedLocalPort !== port
    )
      denied();
  } else denied();
  return { ...input, baseUrl: url.href.replace(/\/$/u, '') };
}

export async function resolveCustomDestination(
  input: CustomDestination,
  resolver: typeof lookup = lookup,
): Promise<{ address: string; family: 4 | 6; baseUrl: string }> {
  const normalized = normalizeCustomDestination(input);
  const host = new URL(normalized.baseUrl).hostname.replace(/^\[|\]$/gu, '');
  if (normalized.destinationKind === 'local')
    return {
      address: host,
      family: isIP(host) as 4 | 6,
      baseUrl: normalized.baseUrl,
    };
  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await resolver(host, { all: true, verbatim: true });
  } catch {
    return denied();
  }
  if (
    !Array.isArray(addresses) ||
    addresses.length === 0 ||
    addresses.some((entry) => addressKind(entry.address) !== 'public')
  )
    denied();
  const first = addresses[0]!;
  return {
    address: first.address,
    family: first.family as 4 | 6,
    baseUrl: normalized.baseUrl,
  };
}

export function createPinnedLookup(
  address: string,
  family: 4 | 6,
): LookupFunction {
  return (_host, options, callback) => {
    if (options.all) callback(null, [{ address, family }]);
    else callback(null, address, family);
  };
}

export async function secureProviderFetch(
  url: string,
  init: RequestInit,
  destination: CustomDestination,
): Promise<Response> {
  const resolved = await resolveCustomDestination(destination);
  const target = new URL(url);
  const base = new URL(resolved.baseUrl);
  if (
    target.origin !== base.origin ||
    !(
      target.pathname === base.pathname ||
      target.pathname.startsWith(`${base.pathname.replace(/\/$/u, '')}/`)
    )
  )
    denied();
  const headers = new Headers(init.headers);
  if (
    headers.has('host') ||
    headers.has('cookie') ||
    headers.has('proxy-authorization')
  )
    denied();
  return new Promise<Response>((resolve, reject) => {
    const request = (target.protocol === 'https:' ? httpsRequest : httpRequest)(
      target,
      {
        agent: false,
        headers: Object.fromEntries(headers),
        method: init.method ?? 'GET',
        lookup: createPinnedLookup(resolved.address, resolved.family),
        ...(target.protocol === 'https:' ? { servername: base.hostname } : {}),
      },
      (response) => {
        if (
          response.statusCode &&
          response.statusCode >= 300 &&
          response.statusCode < 400
        ) {
          response.destroy();
          reject(
            new ProviderDestinationError('Provider redirects are not allowed.'),
          );
          return;
        }
        try {
          const status = response.statusCode ?? 502;
          const bodyless =
            init.method?.toUpperCase() === 'HEAD' ||
            status === 204 ||
            status === 205 ||
            status === 304;
          const body = bodyless
            ? null
            : (Readable.toWeb(response) as ReadableStream<Uint8Array>);
          if (bodyless) response.resume();
          resolve(
            new Response(body, {
              status,
              headers: response.headers as Record<string, string>,
            }),
          );
        } catch (error) {
          response.destroy();
          reject(
            error instanceof Error
              ? error
              : new Error('Provider response conversion failed.'),
          );
        }
      },
    );
    request.once('socket', (socket) => {
      const connected = () => {
        if (socket.remoteAddress !== resolved.address) {
          request.destroy(
            new ProviderDestinationError('Provider peer address changed.'),
          );
        }
      };
      socket.once(
        target.protocol === 'https:' ? 'secureConnect' : 'connect',
        connected,
      );
    });
    request.once('error', reject);
    if (init.signal) {
      if (init.signal.aborted)
        request.destroy(new DOMException('Aborted', 'AbortError'));
      else
        init.signal.addEventListener(
          'abort',
          () => request.destroy(new DOMException('Aborted', 'AbortError')),
          { once: true },
        );
    }
    request.end(typeof init.body === 'string' ? init.body : undefined);
  });
}
