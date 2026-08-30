"use client";

import Image from "next/image";
import { useMambaTokenStats } from "@/lib/use-mamba-token";
import {
  MAMBA_LOGO_URL,
  MAMBA_MINT,
  MAMBA_NAME,
  MAMBA_SYMBOL,
  explorerAddressUrl,
} from "@/lib/mamba-config";
import { formatTokenAmount, truncateAddress } from "@/lib/format";

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-2.5 last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

export function MambaTokenCard() {
  const stats = useMambaTokenStats();

  return (
    <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-left shadow-sm">
      <div className="flex items-center gap-3">
        <Image
          src={MAMBA_LOGO_URL}
          alt={`${MAMBA_NAME} logo`}
          width={48}
          height={48}
          className="rounded-full"
        />
        <div>
          <p className="font-semibold text-card-foreground">{MAMBA_NAME}</p>
          <p className="text-sm text-muted-foreground">${MAMBA_SYMBOL}</p>
        </div>
      </div>

      <div className="mt-5">
        {!MAMBA_MINT && (
          <p className="rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground">
            Not launched yet — set NEXT_PUBLIC_MAMBA_MINT once
            scripts/create-coin.ts has run.
          </p>
        )}

        {MAMBA_MINT && stats.status === "loading" && (
          <p className="text-sm text-muted-foreground">
            Loading on-chain data…
          </p>
        )}

        {MAMBA_MINT && stats.status === "error" && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            Couldn&apos;t load token data: {stats.error}
          </p>
        )}

        {MAMBA_MINT && stats.status === "ready" && (
          <div>
            <Stat
              label="Mint"
              value={
                <a
                  href={explorerAddressUrl(MAMBA_MINT.toBase58())}
                  target="_blank"
                  rel="noreferrer"
                  className="underline decoration-dotted underline-offset-4 hover:text-primary"
                >
                  {truncateAddress(MAMBA_MINT.toBase58())}
                </a>
              }
            />
            <Stat
              label="Supply"
              value={formatTokenAmount(stats.data.supply, stats.data.decimals)}
            />
            <Stat label="Decimals" value={stats.data.decimals} />
            <Stat
              label="Transfer tax"
              value={
                stats.data.transferFeeBps === 0
                  ? "0% (inactive)"
                  : `${(stats.data.transferFeeBps / 100).toFixed(2)}%`
              }
            />
            <Stat
              label="Mint authority"
              value={stats.data.mintAuthority ? "Retained" : "Revoked"}
            />
            <Stat
              label="Freeze authority"
              value={stats.data.freezeAuthority ? "Retained" : "Revoked"}
            />
          </div>
        )}
      </div>
    </div>
  );
}
