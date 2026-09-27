"use client";

import { useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  useMambaTokenStats,
  useMambaWalletBalance,
} from "@/lib/use-mamba-token";
import { MAMBA_MINT, MAMBA_SYMBOL } from "@/lib/mamba-config";
import { formatTokenAmount } from "@/lib/format";
import { ConnectHint } from "@/components/connect-hint";
import { cueSnake } from "@/lib/snake-events";

export function MambaBalanceCard({ refreshKey = 0 }: { refreshKey?: number }) {
  const { connected } = useWallet();
  const balance = useMambaWalletBalance(refreshKey);
  const stats = useMambaTokenStats();
  const loaded =
    connected && balance.status === "ready" && stats.status === "ready";

  // The snake curls up beside the balance whenever it (re)loads.
  useEffect(() => {
    if (loaded) cueSnake({ type: "curl", target: ".mamba-panel-balance" });
  }, [loaded, refreshKey]);

  if (!MAMBA_MINT) return null;

  return (
    <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-left shadow-sm">
      <p className="text-sm text-muted-foreground">Your balance</p>
      {!connected && (
        <>
          {/* Ghost value: previews where the balance will appear. */}
          <p className="mamba-balance-value is-ghost" aria-hidden>
            — <span>{MAMBA_SYMBOL}</span>
          </p>
          <ConnectHint>
            Connect a wallet with the button at the top right to load your
            balance.
          </ConnectHint>
        </>
      )}
      {connected &&
        (balance.status === "loading" || stats.status === "loading") && (
          <p className="mamba-balance-value" aria-busy>
            <span className="mamba-skeleton" aria-label="Loading balance" />
          </p>
        )}
      {connected && balance.status === "error" && (
        <p className="mt-1 text-sm text-destructive">
          Couldn&apos;t load balance: {balance.error}
        </p>
      )}
      {connected && balance.status === "ready" && stats.status === "ready" && (
        <p className="mamba-balance-value">
          {formatTokenAmount(balance.data, stats.data.decimals)}{" "}
          <span>{MAMBA_SYMBOL}</span>
        </p>
      )}
    </div>
  );
}
