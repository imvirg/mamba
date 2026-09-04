// Shared helpers for the CLI scripts: wallet loading and cluster resolution.
import { Keypair } from "@solana/web3.js";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { resolveClusterEndpoint } from "../../shared/mamba";

export { resolveClusterEndpoint };

const DEFAULT_WALLET_PATH = path.join(os.homedir(), ".config/solana/id.json");

function readWalletSecret(): number[] {
  const keyPath = process.env.WALLET ?? DEFAULT_WALLET_PATH;
  return JSON.parse(fs.readFileSync(keyPath, "utf-8"));
}

export function loadWalletKeypair(): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(readWalletSecret()));
}

export function loadWalletSecretBytes(): Uint8Array {
  return Uint8Array.from(readWalletSecret());
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
