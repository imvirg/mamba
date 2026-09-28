"use client";

import { useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction } from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import {
  useMambaTokenStats,
  useMambaWalletBalance,
} from "@/lib/use-mamba-token";
import {
  MAMBA_MINT,
  MAMBA_SYMBOL,
  SOLANA_CLUSTER,
  explorerTxUrl,
} from "@/lib/mamba-config";
import {
  parseTokenAmount,
  tokenAmountToInputValue,
  truncateAddress,
} from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConnectHint } from "@/components/connect-hint";

// Wallets wrap their failures (the adapter keeps the original in `.error`)
// and often say only "Internal error", so turn the common cases into
// something a person can act on.
function sendErrorMessage(err: unknown): string {
  const inner = (err as { error?: { code?: unknown; message?: unknown } })
    ?.error;
  const text = `${err instanceof Error ? err.message : ""} ${
    typeof inner?.message === "string" ? inner.message : ""
  }`;
  if (inner?.code === 4001 || /reject|denied|cancel/i.test(text)) {
    return "You cancelled the transaction in your wallet.";
  }
  if (/internal error|blockhash not found/i.test(text)) {
    return `Your wallet couldn't send this. Make sure it's set to ${SOLANA_CLUSTER} and try again.`;
  }
  if (/insufficient (funds|lamports)/i.test(text)) {
    return "Not enough SOL in your wallet to pay the network fee.";
  }
  return err instanceof Error && err.message
    ? err.message
    : "Transaction failed";
}

type SendStatus =
  | { phase: "idle" | "submitting" }
  | { phase: "error"; message: string }
  | { phase: "success"; signature: string };

export function MambaSendCard({
  refreshKey,
  onSent,
}: {
  refreshKey: number;
  onSent: () => void;
}) {
  const { connection } = useConnection();
  const { connected, publicKey, sendTransaction } = useWallet();
  const stats = useMambaTokenStats();
  const balance = useMambaWalletBalance(refreshKey);

  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<SendStatus>({ phase: "idle" });

  if (!MAMBA_MINT) return null;

  const decimals = stats.status === "ready" ? stats.data.decimals : null;
  const submitting = status.phase === "submitting";

  function handleMax() {
    if (balance.status === "ready" && decimals !== null) {
      setAmount(tokenAmountToInputValue(balance.data, decimals));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!publicKey || decimals === null) return;

    let recipientPubkey: PublicKey;
    try {
      recipientPubkey = new PublicKey(recipient.trim());
    } catch {
      setStatus({ phase: "error", message: "Enter a valid recipient address" });
      return;
    }
    if (recipientPubkey.equals(publicKey)) {
      setStatus({ phase: "error", message: "Can't send to your own wallet" });
      return;
    }

    let amountBaseUnits: bigint;
    try {
      amountBaseUnits = parseTokenAmount(amount, decimals);
    } catch (err) {
      setStatus({ phase: "error", message: (err as Error).message });
      return;
    }
    if (amountBaseUnits <= 0n) {
      setStatus({ phase: "error", message: "Enter an amount greater than 0" });
      return;
    }
    if (balance.status === "ready" && amountBaseUnits > balance.data) {
      setStatus({
        phase: "error",
        message: `Amount exceeds your ${MAMBA_SYMBOL} balance`,
      });
      return;
    }

    setStatus({ phase: "submitting" });
    try {
      const senderAta = getAssociatedTokenAddressSync(
        MAMBA_MINT!,
        publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      const recipientAta = getAssociatedTokenAddressSync(
        MAMBA_MINT!,
        recipientPubkey,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      const recipientAtaInfo = await connection.getAccountInfo(recipientAta);

      const instructions = [];
      if (!recipientAtaInfo) {
        instructions.push(
          createAssociatedTokenAccountIdempotentInstruction(
            publicKey,
            recipientAta,
            recipientPubkey,
            MAMBA_MINT!,
            TOKEN_2022_PROGRAM_ID
          )
        );
      }
      instructions.push(
        createTransferCheckedInstruction(
          senderAta,
          MAMBA_MINT!,
          recipientAta,
          publicKey,
          amountBaseUnits,
          decimals,
          [],
          TOKEN_2022_PROGRAM_ID
        )
      );

      const latestBlockhash = await connection.getLatestBlockhash();
      const tx = new Transaction({
        feePayer: publicKey,
        ...latestBlockhash,
      }).add(...instructions);

      const signature = await sendTransaction(tx, connection);
      await connection.confirmTransaction(
        { signature, ...latestBlockhash },
        "confirmed"
      );

      setStatus({ phase: "success", signature });
      setAmount("");
      setRecipient("");
      onSent();
    } catch (err) {
      setStatus({ phase: "error", message: sendErrorMessage(err) });
    }
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-left shadow-sm">
      <p className="text-sm text-muted-foreground">Send {MAMBA_SYMBOL}</p>

      {!connected && (
        <ConnectHint>
          Connect a wallet with the button at the top right to send{" "}
          {MAMBA_SYMBOL}.
        </ConnectHint>
      )}

      {connected && (
        <>
          <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="recipient"
                className="text-xs text-muted-foreground"
              >
                Recipient address
              </label>
              <Input
                id="recipient"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="Wallet address"
                disabled={submitting}
                autoComplete="off"
                spellCheck={false}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="amount"
                  className="text-xs text-muted-foreground"
                >
                  Amount
                </label>
                <Button
                  type="button"
                  variant="link"
                  size="xs"
                  onClick={handleMax}
                  disabled={submitting || balance.status !== "ready"}
                >
                  Max
                </Button>
              </div>
              <Input
                id="amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.0"
                disabled={submitting}
              />
            </div>

            <Button type="submit" disabled={submitting || decimals === null}>
              {submitting ? "Sending…" : `Send ${MAMBA_SYMBOL}`}
            </Button>
          </form>

          {status.phase === "error" && (
            <p className="mt-3 text-sm text-destructive">{status.message}</p>
          )}
          {status.phase === "success" && (
            <p className="mt-3 text-sm text-muted-foreground">
              Sent.{" "}
              <a
                href={explorerTxUrl(status.signature)}
                target="_blank"
                rel="noreferrer"
                className="underline decoration-dotted underline-offset-4 hover:text-primary"
              >
                View transaction ({truncateAddress(status.signature)})
              </a>
            </p>
          )}
        </>
      )}
    </div>
  );
}
