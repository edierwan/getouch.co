export function normalizeMyPhone(raw: string): string | null {
  let digits = String(raw || '').replace(/[^0-9]/g, '');
  if (!digits || digits.length < 8 || digits.length > 15) return null;

  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }

  if (digits.startsWith('0') && digits.length >= 9 && digits.length <= 12) {
    digits = `60${digits.slice(1)}`;
  } else if (!digits.startsWith('60') && digits.length >= 9 && digits.length <= 10) {
    digits = `60${digits}`;
  }

  if (!/^60\d{8,11}$/.test(digits)) return null;
  return digits;
}

export function samePhone(left: string | null | undefined, right: string | null | undefined): boolean {
  const normalizedLeft = left ? normalizeMyPhone(left) : null;
  const normalizedRight = right ? normalizeMyPhone(right) : null;
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

export function formatPairingCode(value: string | null | undefined): string | null {
  const compact = String(value || '').replace(/\s+/g, '');
  if (!compact) return null;
  return compact.match(/.{1,4}/g)?.join(' ') ?? compact;
}