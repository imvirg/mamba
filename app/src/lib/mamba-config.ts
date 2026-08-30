import { Cluster, clusterApiUrl, PublicKey } from "@solana/web3.js";

export const MAMBA_NAME = "MAMBA";
export const MAMBA_SYMBOL = "MAMBA";
export const MAMBA_LOGO_URL = "/mamba-logo.png";

const LOCALHOST_RPC_URL = "http://127.0.0.1:8899";

export const SOLANA_CLUSTER =
  process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";

// Mirrors scripts/lib/solana.ts's resolveClusterEndpoint.
export const SOLANA_ENDPOINT =
  SOLANA_CLUSTER === "localhost"
    ? LOCALHOST_RPC_URL
    : clusterApiUrl(SOLANA_CLUSTER as Cluster);

// Unset until MAMBA is actually launched (see scripts/create-coin.ts) — the
// dashboard renders a "not launched yet" state in that case.
export const MAMBA_MINT: PublicKey | null = process.env.NEXT_PUBLIC_MAMBA_MINT
  ? new PublicKey(process.env.NEXT_PUBLIC_MAMBA_MINT)
  : null;

export function explorerAddressUrl(address: string): string {
  const base = `https://explorer.solana.com/address/${address}`;
  return SOLANA_CLUSTER === "mainnet-beta"
    ? base
    : `${base}?cluster=${SOLANA_CLUSTER}`;
}
