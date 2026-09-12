export const MAMBA_U64_MAX = 18446744073709551615n;

export const ALLOWED_CLUSTERS = [
  "localhost",
  "devnet",
  "testnet",
  "mainnet-beta",
] as const;

export type MambaCluster = (typeof ALLOWED_CLUSTERS)[number];

type LaunchConfigEnv = Readonly<Record<string, string | undefined>>;

export interface LaunchConfig {
  cluster: MambaCluster;
  decimals: number;
  supplyWholeTokens: bigint;
  supplyBaseUnits: bigint;
  transferFeeBps: number;
  transferFeeMaxBaseUnits: bigint;
}

function requireCanonicalUnsignedInteger(
  env: LaunchConfigEnv,
  name: string,
  defaultValue: string | undefined,
  requireExplicitValues: boolean
): bigint {
  const raw = env[name] ?? (requireExplicitValues ? undefined : defaultValue);
  if (raw === undefined) {
    throw new Error(`${name} is required`);
  }
  if (!/^(0|[1-9][0-9]*)$/.test(raw)) {
    throw new Error(`${name} must be a canonical unsigned integer`);
  }
  return BigInt(raw);
}

function parseIntegerInRange(
  env: LaunchConfigEnv,
  name: string,
  min: bigint,
  max: bigint,
  defaultValue: string | undefined,
  requireExplicitValues: boolean
): number {
  const value = requireCanonicalUnsignedInteger(
    env,
    name,
    defaultValue,
    requireExplicitValues
  );
  if (value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return Number(value);
}

export function parseLaunchConfig(
  env: LaunchConfigEnv,
  options: { requireExplicitValues?: boolean } = {}
): LaunchConfig {
  const requireExplicitValues = options.requireExplicitValues ?? false;
  const rawCluster = env.CLUSTER;
  if (rawCluster === undefined) {
    throw new Error("Set CLUSTER=<value> env var");
  }
  if (!(ALLOWED_CLUSTERS as readonly string[]).includes(rawCluster)) {
    throw new Error(
      `Unsupported cluster: ${rawCluster}. Allowed: ${ALLOWED_CLUSTERS.join(
        ", "
      )}`
    );
  }

  const decimals = parseIntegerInRange(
    env,
    "DECIMALS",
    0n,
    255n,
    "9",
    requireExplicitValues
  );
  const supplyWholeTokens = requireCanonicalUnsignedInteger(
    env,
    "SUPPLY",
    "1000",
    requireExplicitValues
  );
  if (supplyWholeTokens <= 0n) {
    throw new Error("SUPPLY must be a positive integer");
  }
  const scale = 10n ** BigInt(decimals);
  if (supplyWholeTokens > MAMBA_U64_MAX / scale) {
    throw new Error("SUPPLY exceeds the Token-2022 u64 limit");
  }
  const supplyBaseUnits = supplyWholeTokens * scale;

  const transferFeeBps = parseIntegerInRange(
    env,
    "TRANSFER_FEE_BPS",
    0n,
    10000n,
    "0",
    requireExplicitValues
  );
  const transferFeeMaxBaseUnits = requireCanonicalUnsignedInteger(
    env,
    "TRANSFER_FEE_MAX_BASE_UNITS",
    MAMBA_U64_MAX.toString(),
    requireExplicitValues
  );
  if (transferFeeMaxBaseUnits > MAMBA_U64_MAX) {
    throw new Error(
      "TRANSFER_FEE_MAX_BASE_UNITS must be between 0 and 18446744073709551615"
    );
  }

  return {
    cluster: rawCluster as MambaCluster,
    decimals,
    supplyWholeTokens,
    supplyBaseUnits,
    transferFeeBps,
    transferFeeMaxBaseUnits,
  };
}
