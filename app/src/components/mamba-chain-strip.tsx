"use client";

import { useState } from "react";
import { AlertTriangle, Check, Copy, ExternalLink } from "lucide-react";
import { useMambaTokenStats } from "@/lib/use-mamba-token";
import { MAMBA_MINT, explorerAddressUrl } from "@/lib/mamba-config";
import { formatTokenAmount, truncateAddress } from "@/lib/format";

type Tone = "ok" | "warn" | "muted";

function Cell({
  label,
  value,
  note,
  tone = "muted",
}: {
  label: string;
  value: React.ReactNode;
  note?: string;
  tone?: Tone;
}) {
  return (
    <div className="mamba-chain-cell">
      <span className="mamba-chain-label">{label}</span>
      <strong className="mamba-chain-value">{value}</strong>
      {note && (
        <span className={`mamba-chain-note is-${tone}`}>
          {/* Warnings carry an icon so they don't rely on color alone. */}
          {tone === "warn" && (
            <AlertTriangle size={13} role="img" aria-label="Warning" />
          )}
          {note}
        </span>
      )}
    </div>
  );
}

const Skeleton = () => <span className="mamba-skeleton" aria-hidden />;

/**
 * Live summary of the MAMBA mint, read from chain. Every value (including
 * whether supply is fixed) comes from the mint account, so the labels stay
 * truthful as authorities are revoked.
 */
export function MambaChainStrip() {
  const stats = useMambaTokenStats();
  const [copied, setCopied] = useState(false);

  if (!MAMBA_MINT) {
    return (
      <div className="mamba-chain mamba-chain-empty">
        MAMBA isn&apos;t launched yet. Live supply and authority data will
        appear here once the mint exists.
      </div>
    );
  }

  const mint = MAMBA_MINT.toBase58();
  const data = stats.status === "ready" ? stats.data : null;
  const loading = stats.status === "loading" || stats.status === "idle";

  async function copyMint() {
    try {
      await navigator.clipboard.writeText(mint);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard can be unavailable (permissions, insecure context); the
      // explorer link still exposes the full address.
    }
  }

  return (
    <div className="mamba-chain" aria-busy={loading}>
      <div className="mamba-chain-head">
        <span className="mamba-chain-live" /> Live on-chain
      </div>

      {stats.status === "error" ? (
        <p className="mamba-chain-error">
          Couldn&apos;t load token data: {stats.error}
        </p>
      ) : (
        <div className="mamba-chain-cells">
          <Cell
            label="SUPPLY"
            value={
              data ? (
                formatTokenAmount(data.supply, data.decimals)
              ) : (
                <Skeleton />
              )
            }
            note={
              data
                ? data.mintAuthority
                  ? "Can increase"
                  : "Fixed supply"
                : undefined
            }
            tone={data?.mintAuthority ? "warn" : "ok"}
          />
          <Cell
            label="TRANSFER TAX"
            value={
              data ? `${(data.transferFeeBps / 100).toFixed(2)}%` : <Skeleton />
            }
            note={
              data
                ? data.transferFeeBps === 0
                  ? "Inactive"
                  : "Active"
                : undefined
            }
            tone={data && data.transferFeeBps > 0 ? "warn" : "muted"}
          />
          <Cell
            label="MINT AUTHORITY"
            value={
              data ? data.mintAuthority ? "Retained" : "Revoked" : <Skeleton />
            }
            note={
              data
                ? data.mintAuthority
                  ? "New tokens can be minted"
                  : "No new tokens can be minted"
                : undefined
            }
            tone={data?.mintAuthority ? "warn" : "ok"}
          />
          <Cell
            label="FREEZE AUTHORITY"
            value={
              data ? (
                data.freezeAuthority ? (
                  "Retained"
                ) : (
                  "Revoked"
                )
              ) : (
                <Skeleton />
              )
            }
            note={
              data
                ? data.freezeAuthority
                  ? "Accounts can be frozen"
                  : "Accounts can't be frozen"
                : undefined
            }
            tone={data?.freezeAuthority ? "warn" : "ok"}
          />
        </div>
      )}

      <div className="mamba-chain-mint">
        <span className="mamba-chain-label">MINT</span>
        <code title={mint}>{truncateAddress(mint, 6)}</code>
        <button
          type="button"
          onClick={copyMint}
          aria-label={copied ? "Mint address copied" : "Copy mint address"}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
        <a
          href={explorerAddressUrl(mint)}
          target="_blank"
          rel="noreferrer"
          aria-label="View mint on Solana Explorer"
        >
          Explorer <ExternalLink size={13} />
        </a>
      </div>
    </div>
  );
}
