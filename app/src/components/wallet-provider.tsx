"use client";

import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { SOLANA_ENDPOINT } from "@/lib/mamba-config";

import "@solana/wallet-adapter-react-ui/styles.css";

// Components that call the wallet (e.g. the send card) show its errors
// themselves; log here as a warning so Next's dev overlay doesn't also pop.
function logWalletError(error: Error) {
  console.warn(`[wallet] ${error.name}: ${error.message}`);
}

// Standard-compliant wallets (Phantom, Solflare, Backpack, etc.) register
// themselves automatically — no adapter list needed here.
export function SolanaWalletProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ConnectionProvider endpoint={SOLANA_ENDPOINT}>
      <WalletProvider wallets={[]} autoConnect onError={logWalletError}>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
