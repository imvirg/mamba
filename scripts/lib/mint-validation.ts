import { getTransferFeeConfig, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";

export type TransferFeeConfig = NonNullable<
  ReturnType<typeof getTransferFeeConfig>
>;

export function requireTransferFeeConfig(
  feeConfig: ReturnType<typeof getTransferFeeConfig>
): asserts feeConfig is TransferFeeConfig {
  if (!feeConfig) {
    throw new Error("TransferFeeConfig extension is required");
  }
}

export interface MintVerificationSnapshot {
  accountOwner: PublicKey;
  supply: bigint;
  decimals: number;
  mintAuthority: PublicKey | null;
  freezeAuthority: PublicKey | null;
  transferFeeConfig: TransferFeeConfig | null;
}

export function assertFinalMintState(
  snapshot: MintVerificationSnapshot,
  expected: {
    authority: PublicKey;
    supply: bigint;
    decimals: number;
  }
): void {
  if (!snapshot.accountOwner.equals(TOKEN_2022_PROGRAM_ID)) {
    throw new Error("Mint account is not owned by Token-2022");
  }
  if (snapshot.decimals !== expected.decimals) {
    throw new Error(
      `Mint decimals mismatch: expected ${expected.decimals}, found ${snapshot.decimals}`
    );
  }
  if (snapshot.supply !== expected.supply) {
    throw new Error(
      `Mint supply mismatch: expected ${expected.supply}, found ${snapshot.supply}`
    );
  }
  if (snapshot.mintAuthority !== null) {
    throw new Error("Mint authority was not revoked");
  }
  if (snapshot.freezeAuthority !== null) {
    throw new Error("Freeze authority is still set");
  }

  const feeConfig = snapshot.transferFeeConfig;
  requireTransferFeeConfig(feeConfig);
  if (!feeConfig.transferFeeConfigAuthority?.equals(expected.authority)) {
    throw new Error("Transfer-fee-config authority mismatch");
  }
  if (!feeConfig.withdrawWithheldAuthority?.equals(expected.authority)) {
    throw new Error("Withdraw-withheld authority mismatch");
  }
}

export function assertPreMintState(
  snapshot: MintVerificationSnapshot,
  expected: {
    mintAuthority: PublicKey;
    authority: PublicKey;
    decimals: number;
  }
): void {
  if (!snapshot.accountOwner.equals(TOKEN_2022_PROGRAM_ID)) {
    throw new Error("Mint account is not owned by Token-2022");
  }
  if (snapshot.decimals !== expected.decimals) {
    throw new Error(
      `Mint decimals mismatch: expected ${expected.decimals}, found ${snapshot.decimals}`
    );
  }
  if (snapshot.supply !== 0n) {
    throw new Error(
      `Mint already has supply; refusing initial mint: ${snapshot.supply}`
    );
  }
  if (
    snapshot.mintAuthority === null ||
    !snapshot.mintAuthority.equals(expected.mintAuthority)
  ) {
    throw new Error("Mint authority does not match the launch payer");
  }
  if (snapshot.freezeAuthority !== null) {
    throw new Error("Freeze authority is still set");
  }

  const feeConfig = snapshot.transferFeeConfig;
  requireTransferFeeConfig(feeConfig);
  if (!feeConfig.transferFeeConfigAuthority?.equals(expected.authority)) {
    throw new Error("Transfer-fee-config authority mismatch");
  }
  if (!feeConfig.withdrawWithheldAuthority?.equals(expected.authority)) {
    throw new Error("Withdraw-withheld authority mismatch");
  }
}
