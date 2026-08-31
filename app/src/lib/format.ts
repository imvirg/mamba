function splitBaseUnits(
  baseUnits: bigint,
  decimals: number
): { whole: bigint; fraction: string } {
  const divisor = 10n ** BigInt(decimals);
  const whole = baseUnits / divisor;
  const fraction = (baseUnits % divisor)
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "");
  return { whole, fraction };
}

export function formatTokenAmount(baseUnits: bigint, decimals: number): string {
  const { whole, fraction } = splitBaseUnits(baseUnits, decimals);
  const wholeStr = whole.toLocaleString("en-US");
  return fraction ? `${wholeStr}.${fraction}` : wholeStr;
}

// Same value as formatTokenAmount but without locale thousands separators,
// so it round-trips through parseTokenAmount (e.g. for a "Max" button).
export function tokenAmountToInputValue(
  baseUnits: bigint,
  decimals: number
): string {
  const { whole, fraction } = splitBaseUnits(baseUnits, decimals);
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function parseTokenAmount(input: string, decimals: number): bigint {
  const trimmed = input.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error("Enter a valid amount");
  }
  const [wholeStr, fractionStr = ""] = trimmed.split(".");
  if (fractionStr.length > decimals) {
    throw new Error(`Enter at most ${decimals} decimal places`);
  }
  return (
    BigInt(wholeStr) * 10n ** BigInt(decimals) +
    BigInt(fractionStr.padEnd(decimals, "0") || "0")
  );
}

export function truncateAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars)}…${address.slice(-chars)}`;
}
