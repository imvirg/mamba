// Shared helpers for the CLI scripts: wallet loading and cluster resolution.
import { Keypair, clusterApiUrl, Cluster } from "@solana/web3.js";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const LOCALHOST_RPC_URL = "http://127.0.0.1:8899";
const DEFAULT_WALLET_PATH = path.join(os.homedir(), ".config/solana/id.json");

export function resolveClusterEndpoint(cluster: string): string {
  return cluster === "localhost"
    ? LOCALHOST_RPC_URL
    : clusterApiUrl(cluster as Cluster);
}

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
