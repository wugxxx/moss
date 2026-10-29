const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function encodeTime(timestamp: number): string {
  let remaining = timestamp;
  let result = '';
  for (let index = 0; index < 10; index += 1) {
    result = CROCKFORD[remaining % 32]! + result;
    remaining = Math.floor(remaining / 32);
  }
  return result;
}

function encodeRandom(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let result = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += CROCKFORD[(value >>> bits) & 31]!;
    }
  }
  if (bits > 0) result += CROCKFORD[(value << (5 - bits)) & 31]!;
  return result;
}

export function createEntityId(timestamp = Date.now()): string {
  const random = new Uint8Array(10);
  crypto.getRandomValues(random);
  return encodeTime(timestamp) + encodeRandom(random).slice(0, 16);
}
