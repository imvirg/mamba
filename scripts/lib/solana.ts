// Shared helpers for the CLI scripts: wallet loading and cluster resolution.
import { Keypair } from "@solana/web3.js";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { resolveClusterEndpoint } from "../../shared/mamba";

export { resolveClusterEndpoint };

const DEFAULT_WALLET_PATH = path.join(os.homedir(), ".config/solana/id.json");

function assertWalletPath(filePath: string): void {
  if (!path.isAbsolute(filePath)) {
    throw new Error("Wallet path must be absolute");
  }
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`Wallet is not a regular file: ${filePath}`);
  }
  if (process.getuid && stat.uid !== process.getuid()) {
    throw new Error(`Wallet is not owned by the current user: ${filePath}`);
  }
  if ((stat.mode & 0o077) !== 0) {
    throw new Error(`Wallet permissions are too broad: ${filePath}`);
  }
}

function readWalletSecret(): Uint8Array {
  const keyPath = process.env.WALLET ?? DEFAULT_WALLET_PATH;
  assertWalletPath(keyPath);
  let value: unknown;
  try {
    value = JSON.parse(fs.readFileSync(keyPath, "utf-8"));
  } catch (error) {
    throw new Error(
      `Invalid wallet JSON: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
  if (
    !Array.isArray(value) ||
    value.length !== 64 ||
    value.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)
  ) {
    throw new Error("Wallet must contain a 64-byte secret key array");
  }
  return Uint8Array.from(value);
}

export function loadWalletKeypair(): Keypair {
  return Keypair.fromSecretKey(readWalletSecret());
}

export function loadWalletSecretBytes(): Uint8Array {
  return readWalletSecret();
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Set ${name}=<value> env var`);
  }
  return value;
}

export function requireNonProductionCluster(
  cluster: string,
  scriptName: string
): void {
  if (cluster === "testnet" || cluster === "mainnet-beta") {
    throw new Error(
      `${scriptName} is restricted to localhost or devnet; use the governed launch flow for ${cluster}`
    );
  }
}
