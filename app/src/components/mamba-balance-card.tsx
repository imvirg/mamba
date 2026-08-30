"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useMambaTokenStats, useMambaWalletBalance } from "@/lib/use-mamba-token";
import { MAMBA_MINT, MAMBA_SYMBOL } from "@/lib/mamba-config";
import { formatTokenAmount } from "@/lib/format";

export function MambaBalanceCard() {
  const { connected } = useWallet();
  const balance = useMambaWalletBalance();
  const stats = useMambaTokenStats();

  if (!MAMBA_MINT) return null;

  return (
    <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-left shadow-sm">
      <p className="text-sm text-muted-foreground">Your balance</p>
      {!connected && (
        <p className="mt-1 text-lg font-medium text-card-foreground">
          Connect your wallet to see your {MAMBA_SYMBOL} balance
        </p>
      )}
      {connected && (balance.status === "loading" || stats.status === "loading") && (
        <p className="mt-1 text-lg font-medium text-card-foreground">
          Loading…
        </p>
      )}
      {connected && balance.status === "error" && (
        <p className="mt-1 text-sm text-destructive">
          Couldn&apos;t load balance: {balance.error}
        </p>
      )}
      {connected && balance.status === "ready" && stats.status === "ready" && (
        <p className="mt-1 text-2xl font-semibold text-card-foreground">
          {formatTokenAmount(balance.data, stats.data.decimals)}{" "}
          <span className="text-base font-normal text-muted-foreground">
            {MAMBA_SYMBOL}
          </span>
        </p>
      )}
    </div>
  );
}
