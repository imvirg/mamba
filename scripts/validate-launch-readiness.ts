import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { PublicKey } from "@solana/web3.js";
import { MAMBA_MAINNET_AUTHORITY } from "../shared/mamba";
import {
  loadSquadsAuthorityConfig,
  validateSquadsAuthority,
} from "./lib/authority";
import { Connection } from "@solana/web3.js";
import { resolveClusterEndpoint } from "./lib/solana";

const allowedClusters = ["localhost", "devnet", "testnet", "mainnet-beta"];
const prodLikeClusters = ["mainnet-beta"];
const strictMode =
  process.env.STRICT_LAUNCH === "1" || process.argv.includes("--strict");

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function warn(message: string): void {
  console.warn(`WARN: ${message}`);
}

function requireNumericEnv(name: string, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw) {
    return 0;
  }

  const value = Number(raw);
  if (
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
    fail(`${name} must be an integer between ${min} and ${max}`);
  }

  return value;
}

function validatePublicKey(value: string | undefined, label: string): void {
  if (!value) return;

  try {
    new PublicKey(value);
  } catch {
    fail(`${label} is not a valid Solana public key: ${value}`);
  }
}

const cluster = process.env.CLUSTER ?? "devnet";
const authorityMultisig = process.env.AUTHORITY_MULTISIG;
const walletPath =
  process.env.WALLET ?? path.join(os.homedir(), ".config/solana/id.json");
const transferFeeBps = requireNumericEnv("TRANSFER_FEE_BPS", 0, 10000);
const decimals = requireNumericEnv("DECIMALS", 0, 255);
const supply = process.env.SUPPLY ?? "100000000";

console.log(`Validating launch readiness for cluster: ${cluster}`);

if (!allowedClusters.includes(cluster)) {
  fail(
    `Unsupported cluster: ${cluster}. Allowed: ${allowedClusters.join(", ")}`
  );
}

if (prodLikeClusters.includes(cluster) && !authorityMultisig) {
  fail(
    "AUTHORITY_MULTISIG is required for mainnet-beta or production-like clusters."
  );
}

if (strictMode && !authorityMultisig) {
  fail(
    "STRICT_LAUNCH is enabled and AUTHORITY_MULTISIG is required for this cluster."
  );
}

if (!authorityMultisig && cluster !== "localhost" && cluster !== "devnet") {
  fail(
    "Missing AUTHORITY_MULTISIG for a non-local cluster. Do not continue without explicit governance control."
  );
}

if (authorityMultisig) {
  validatePublicKey(authorityMultisig, "AUTHORITY_MULTISIG");
  if (
    prodLikeClusters.includes(cluster) &&
    authorityMultisig !== MAMBA_MAINNET_AUTHORITY
  ) {
    fail(
      `AUTHORITY_MULTISIG is not the approved mainnet governance authority: ${MAMBA_MAINNET_AUTHORITY}`
    );
  }
}

try {
  const supplyBaseUnits = BigInt(supply) * 10n ** BigInt(decimals);
  const maxU64 = 18446744073709551615n;
  if (BigInt(supply) <= 0n || supplyBaseUnits > maxU64) {
    fail("SUPPLY must be a positive integer");
  }
} catch {
  fail("SUPPLY must be a positive integer within the Token-2022 u64 limit");
}

if (transferFeeBps < 0 || transferFeeBps > 10000) {
  fail("TRANSFER_FEE_BPS must be between 0 and 10000");
}

if (!fs.existsSync(walletPath)) {
  if (prodLikeClusters.includes(cluster) || strictMode) {
    fail(`Wallet file not found at ${walletPath}`);
  }
  warn(`Wallet file not found at ${walletPath}.`);
}

if (!authorityMultisig && cluster === "devnet") {
  if (strictMode) {
    fail(
      "STRICT_LAUNCH is enabled; AUTHORITY_MULTISIG is required even on devnet."
    );
  }
  warn(
    "AUTHORITY_MULTISIG is not set. This is a devnet convenience fallback only; do not treat it as launch-safe."
  );
}

async function finishValidation(): Promise<void> {
  if (authorityMultisig && cluster === "mainnet-beta") {
    const authority = new PublicKey(authorityMultisig);
    const config = loadSquadsAuthorityConfig(authority);
    const connection = new Connection(
      resolveClusterEndpoint(cluster),
      "confirmed"
    );
    await validateSquadsAuthority(connection, config);
  }

  if (authorityMultisig && cluster === "devnet") {
    console.log(`Using multisig authority for devnet: ${authorityMultisig}`);
  }

  console.log("Launch readiness checks passed.");
  console.log(`Wallet path: ${walletPath}`);
  console.log(`Transfer fee BPS: ${transferFeeBps}`);
  console.log(`Supply: ${supply}`);
}

finishValidation().catch((err: unknown) => {
  fail(err instanceof Error ? err.message : String(err));
});
