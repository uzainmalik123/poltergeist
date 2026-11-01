import { isIPv4, isIPv6 } from 'node:net';

/** Loopback hosts that are always allowed; `allowedHosts` extends them, never replaces them (D-05). */
export const DEFAULT_HOSTS = ['localhost', '127.0.0.1', '::1'] as const;

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

function isDnsName(name: string): boolean {
  const labels = name.split('.');
  // An all-numeric last label is never a DNS name (it would be a malformed IPv4 address).
  if (/^\d+$/.test(labels[labels.length - 1] ?? '')) return false;
  return labels.every((l) => LABEL.test(l));
}

/**
 * True for an exact host (DNS name, IPv4, unbracketed IPv6) or a `*.` subdomain wildcard.
 * Anything else, including characters that could widen Chromium's proxy bypass list, is rejected (D-29).
 */
export function isValidHostEntry(entry: string): boolean {
  if (entry.startsWith('*.')) return isDnsName(entry.slice(2));
  return isIPv4(entry) || isIPv6(entry) || isDnsName(entry);
}

/** Lower-cases a URL hostname and strips the brackets around an IPv6 address. */
export function normalizeHost(hostname: string): string {
  const h = hostname.toLowerCase();
  return h.startsWith('[') && h.endsWith(']') ? h.slice(1, -1) : h;
}

/** The loopback defaults followed by the configured hosts, lower-cased and de-duplicated. */
export function effectiveHosts(extra: readonly string[]): string[] {
  return [...new Set([...DEFAULT_HOSTS, ...extra.map((h) => h.toLowerCase())])];
}

/** Hostname-only match (any port or scheme). `*.x` matches subdomains of `x`, not `x` itself. */
export function isAllowedHost(hostname: string, hosts: readonly string[]): boolean {
  const host = normalizeHost(hostname);
  if (host === '') return false;
  return hosts.some((entry) =>
    entry.startsWith('*.') ? host.endsWith(entry.slice(1)) : host === entry,
  );
}
