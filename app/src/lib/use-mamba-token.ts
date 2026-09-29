"use client";

import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  ExtensionType,
  getAssociatedTokenAddressSync,
  getExtensionTypes,
  getMint,
  getTransferFeeConfig,
  TOKEN_2022_PROGRAM_ID,
  unpackAccount,
} from "@solana/spl-token";
import { MAMBA_MINT } from "./mamba-config";

export type MambaTokenStats = {
  decimals: number;
  supply: bigint;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  transferFeeBps: number;
  transferFeeMaxBaseUnits: bigint;
  /** Token-2022 extensions enabled on the mint, e.g. "TransferFeeConfig". */
  extensions: string[];
};

type LoadState<T> =
  | { status: "idle" | "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; data: T };

// Results are keyed by what produced them (e.g. "<mint>" or "<mint>:<wallet>").
// A key mismatch (including no result yet) means "still loading" — this keeps
// setState calls confined to async callbacks, never synchronous in the effect
// body, which is what react-hooks/set-state-in-effect requires.
function useKeyedAsync<T>(
  key: string | null,
  fetcher: (signal: { cancelled: boolean }) => Promise<T>
): LoadState<T> {
  const [result, setResult] = useState<{
    key: string;
    state: LoadState<T>;
  } | null>(null);

  useEffect(() => {
    if (!key) return;
    const signal = { cancelled: false };

    fetcher(signal)
      .then((data) => {
        if (signal.cancelled) return;
        setResult({ key, state: { status: "ready", data } });
      })
      .catch((err) => {
        if (signal.cancelled) return;
        setResult({
          key,
          state: { status: "error", error: (err as Error).message },
        });
      });

    return () => {
      signal.cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetcher is recreated per render by design; key is the real dependency
  }, [key]);

  if (!key) return { status: "idle" };
  if (result?.key === key) return result.state;
  return { status: "loading" };
}

export function useMambaTokenStats(): LoadState<MambaTokenStats> {
  const { connection } = useConnection();
  const key = MAMBA_MINT ? MAMBA_MINT.toBase58() : null;

  return useKeyedAsync(key, async () => {
    const [mint, epochInfo] = await Promise.all([
      getMint(connection, MAMBA_MINT!, "confirmed", TOKEN_2022_PROGRAM_ID),
      connection.getEpochInfo("confirmed"),
    ]);
    const feeConfig = getTransferFeeConfig(mint);
    // Token-2022 delays a fee change by one epoch: "newer" only applies once
    // the chain reaches its epoch, otherwise "older" is still active.
    const activeFee =
      feeConfig && BigInt(epochInfo.epoch) >= feeConfig.newerTransferFee.epoch
        ? feeConfig.newerTransferFee
        : feeConfig?.olderTransferFee;

    return {
      decimals: mint.decimals,
      supply: mint.supply,
      mintAuthority: mint.mintAuthority?.toBase58() ?? null,
      freezeAuthority: mint.freezeAuthority?.toBase58() ?? null,
      transferFeeBps: activeFee?.transferFeeBasisPoints ?? 0,
      transferFeeMaxBaseUnits: activeFee?.maximumFee ?? 0n,
      extensions: getExtensionTypes(mint.tlvData).map(
        (type) => ExtensionType[type] ?? `Extension ${type}`
      ),
    };
  });
}

// refreshKey lets a caller force a refetch (e.g. after sending a transfer)
// by bumping it, since the mint/wallet pair alone wouldn't otherwise change.
export function useMambaWalletBalance(refreshKey = 0): LoadState<bigint> {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const key =
    MAMBA_MINT && publicKey
      ? `${MAMBA_MINT.toBase58()}:${publicKey.toBase58()}:${refreshKey}`
      : null;

  return useKeyedAsync(key, async () => {
    const ata = getAssociatedTokenAddressSync(
      MAMBA_MINT!,
      publicKey!,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    const info = await connection.getAccountInfo(ata, "confirmed");
    if (!info) return 0n;
    return unpackAccount(ata, info, TOKEN_2022_PROGRAM_ID).amount;
  });
}
