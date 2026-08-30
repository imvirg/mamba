"use client";

import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { SOLANA_ENDPOINT } from "@/lib/mamba-config";

import "@solana/wallet-adapter-react-ui/styles.css";

// Standard-compliant wallets (Phantom, Solflare, Backpack, etc.) register
// themselves automatically — no adapter list needed here.
export function SolanaWalletProvider({ children }: { children: React.ReactNode }) {
  return (
    <ConnectionProvider endpoint={SOLANA_ENDPOINT}>
      <WalletProvider wallets={[]} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
