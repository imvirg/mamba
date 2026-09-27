"use client";

import { useState } from "react";
import Image from "next/image";
import { Check, Copy, ExternalLink } from "lucide-react";
import { useMambaTokenStats } from "@/lib/use-mamba-token";
import {
  MAMBA_LOGO_URL,
  MAMBA_MINT,
  MAMBA_NAME,
  MAMBA_SYMBOL,
  explorerAddressUrl,
} from "@/lib/mamba-config";

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-2.5 last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium text-foreground">
        {value}
      </span>
    </div>
  );
}

/** "TransferFeeConfig" -> "Transfer fee config". */
const humanize = (name: string) =>
  name
    .replace(/(?<=[a-z])(?=[A-Z])/g, " ")
    .replace(/ [A-Z]/g, (m) => m.toLowerCase());

/**
 * Reference facts about the mint: the things you look up, not the live
 * status (supply, tax and authorities live in the hero's on-chain strip).
 */
export function MambaTokenCard() {
  const stats = useMambaTokenStats();
  const [copied, setCopied] = useState(false);
  const mint = MAMBA_MINT?.toBase58();

  async function copyMint() {
    if (!mint) return;
    try {
      await navigator.clipboard.writeText(mint);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard can be unavailable; the address is selectable text.
    }
  }

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

      {!mint ? (
        <p className="mt-5 rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground">
          Not launched yet — set NEXT_PUBLIC_MAMBA_MINT once
          scripts/create-coin.ts has run.
        </p>
      ) : (
        <>
          <div className="mamba-token-mint">
            <span className="text-sm text-muted-foreground">Mint address</span>
            <code>{mint}</code>
            <div className="mamba-token-actions">
              <button
                type="button"
                onClick={copyMint}
                aria-label={
                  copied ? "Mint address copied" : "Copy mint address"
                }
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? "Copied" : "Copy"}
              </button>
              <a
                href={explorerAddressUrl(mint)}
                target="_blank"
                rel="noreferrer"
              >
                View on Solana Explorer <ExternalLink size={13} />
              </a>
            </div>
          </div>

          <div className="mt-2">
            <Stat label="Token program" value="Token-2022" />
            {stats.status === "error" && (
              <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
                Couldn&apos;t load token data: {stats.error}
              </p>
            )}
            {stats.status !== "error" && (
              <>
                <Stat
                  label="Decimals"
                  value={
                    stats.status === "ready" ? (
                      stats.data.decimals
                    ) : (
                      <span className="mamba-skeleton" aria-label="Loading" />
                    )
                  }
                />
                <Stat
                  label="Extensions"
                  value={
                    stats.status === "ready" ? (
                      stats.data.extensions.length ? (
                        stats.data.extensions.map(humanize).join(", ")
                      ) : (
                        "None"
                      )
                    ) : (
                      <span className="mamba-skeleton" aria-label="Loading" />
                    )
                  }
                />
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
