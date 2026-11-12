import { createHmac, timingSafeEqual } from 'node:crypto';

export function equal(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function requestJSON(fetcher, url, { token, body, headers, timeout = 9000 } = {}) {
  const response = await fetcher(url, {
    method: body ? 'POST' : 'GET',
    headers: {
      accept: 'application/json',
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: 'Bearer ' + token } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeout),
  });
  if (!response.ok) throw new Error('Servicio externo: HTTP ' + response.status);
  const result = await response.json();
  if (result.ok === false || result.error) throw new Error('El servicio externo rechazó la operación.');
  return result;
}

export function verifyMercadoPago(id, requestId, signature, secret) {
  if (!secret || !/^[A-Za-z0-9_-]+$/.test(id || '') || !requestId || !signature) return false;
  const timestamp = /(?:^|,)\s*ts=(\d+)(?:,|$)/.exec(signature)?.[1];
  const digest = /(?:^|,)\s*v1=([a-f0-9]{64})(?:,|$)/i.exec(signature)?.[1];
  if (!timestamp || !digest) return false;
  const manifest = 'id:' + id.toLowerCase() + ';request-id:' + requestId + ';ts:' + timestamp + ';';
  return equal(createHmac('sha256', secret).update(manifest).digest('hex'), digest.toLowerCase());
}

export function phoneNumber(input) {
  if (typeof input !== 'string' || !/^[+\d() .-]{8,26}$/.test(input)) return null;
  const digits = input.replace(/\D/g, '');
  if (/^09\d{7}$/.test(digits)) return '598' + digits.slice(1);
  if (/^5989\d{7}$/.test(digits)) return digits;
  return input.startsWith('+') && /^[1-9]\d{7,14}$/.test(digits) ? digits : null;
}
