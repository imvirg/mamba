import { PublicKey } from "@solana/web3.js";
import {
  MAMBA_NAME,
  MAMBA_SYMBOL,
  resolveClusterEndpoint,
} from "../../../shared/mamba";

export { MAMBA_NAME, MAMBA_SYMBOL };
export const MAMBA_LOGO_URL = "/mamba-snake.webp";

export const SOLANA_CLUSTER =
  process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";

export const SOLANA_ENDPOINT = resolveClusterEndpoint(SOLANA_CLUSTER);

// Unset until MAMBA is actually launched (see scripts/create-coin.ts) — the
// dashboard renders a "not launched yet" state in that case.
export const MAMBA_MINT: PublicKey | null = process.env.NEXT_PUBLIC_MAMBA_MINT
  ? new PublicKey(process.env.NEXT_PUBLIC_MAMBA_MINT)
  : null;

function explorerUrl(path: string): string {
  const base = `https://explorer.solana.com/${path}`;
  return SOLANA_CLUSTER === "mainnet-beta"
    ? base
    : `${base}?cluster=${SOLANA_CLUSTER}`;
}

export function explorerAddressUrl(address: string): string {
  return explorerUrl(`address/${address}`);
}

export function explorerTxUrl(signature: string): string {
  return explorerUrl(`tx/${signature}`);
}
