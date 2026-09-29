// Constants and helpers shared between scripts/ (Node CLI) and app/ (Next.js
// dashboard) so the two don't drift on cluster resolution or branding.
import { Cluster, clusterApiUrl } from "@solana/web3.js";

export const MAMBA_NAME = "MAMBA";
export const MAMBA_SYMBOL = "MAMBA";
export const MAMBA_MAINNET_AUTHORITY =
  "HbMnEvNGdWmUr7Zdqj6aKMkzXUtUVUXviPDd3qQVtDoW";

const LOCALHOST_RPC_URL = "http://127.0.0.1:8899";

export function resolveClusterEndpoint(cluster: string): string {
  return cluster === "localhost"
    ? LOCALHOST_RPC_URL
    : clusterApiUrl(cluster as Cluster);
}
