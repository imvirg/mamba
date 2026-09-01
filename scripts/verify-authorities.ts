// Independently checks a Token-2022 mint's authorities against MAMBA's
// documented invariants (see mamba/audit-readiness.md). Anyone — not just
// this team — can run this against the real mint address to confirm the
// claims in that document without trusting our word for it.
import { Connection, PublicKey } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  getMint,
  getTransferFeeConfig,
} from "@solana/spl-token";
import { resolveClusterEndpoint } from "../shared/mamba";
import { requireEnv } from "./lib/solana";

const CLUSTER = process.env.CLUSTER ?? "mainnet-beta"; // localhost | devnet | testnet | mainnet-beta
const MINT = new PublicKey(requireEnv("MINT"));
// Optional: the expected multisig/vault address for the tax authorities.
// Without it, the script just reports what it finds instead of pass/failing.
const EXPECTED_AUTHORITY = process.env.EXPECTED_AUTHORITY
  ? new PublicKey(process.env.EXPECTED_AUTHORITY)
  : null;

function report(label: string, ok: boolean | null, detail: string) {
  const status = ok === null ? "INFO" : ok ? "PASS" : "FAIL";
  console.log(`[${status}] ${label}: ${detail}`);
  return ok;
}

async function main() {
  const connection = new Connection(
    resolveClusterEndpoint(CLUSTER),
    "confirmed"
  );
  const mint = await getMint(
    connection,
    MINT,
    "confirmed",
    TOKEN_2022_PROGRAM_ID
  );
  const feeConfig = getTransferFeeConfig(mint);

  console.log(`Verifying ${MINT.toBase58()} on ${CLUSTER}\n`);

  const results = [
    report(
      "Mint authority revoked",
      mint.mintAuthority === null,
      mint.mintAuthority
        ? `still set (${mint.mintAuthority.toBase58()}) — supply is NOT fixed`
        : "null — supply is fixed forever"
    ),
    report(
      "Freeze authority unset",
      mint.freezeAuthority === null,
      mint.freezeAuthority
        ? `still set (${mint.freezeAuthority.toBase58()}) — accounts CAN be frozen`
        : "null — no account can ever be frozen"
    ),
  ];

  if (feeConfig) {
    const feeAuthOk = EXPECTED_AUTHORITY
      ? feeConfig.transferFeeConfigAuthority?.equals(EXPECTED_AUTHORITY) ??
        false
      : null;
    const withdrawAuthOk = EXPECTED_AUTHORITY
      ? feeConfig.withdrawWithheldAuthority?.equals(EXPECTED_AUTHORITY) ?? false
      : null;
    results.push(
      report(
        "Transfer-fee-config authority",
        feeAuthOk,
        feeConfig.transferFeeConfigAuthority?.toBase58() ?? "unset"
      ),
      report(
        "Withdraw-withheld authority",
        withdrawAuthOk,
        feeConfig.withdrawWithheldAuthority?.toBase58() ?? "unset"
      )
    );
    console.log(
      `\nCurrent transfer fee: ${feeConfig.olderTransferFee.transferFeeBasisPoints} bps (older), ` +
        `${feeConfig.newerTransferFee.transferFeeBasisPoints} bps (newer, epoch ${feeConfig.newerTransferFee.epoch})`
    );
  } else {
    console.log("\nNo TransferFeeConfig extension found on this mint.");
  }

  const failed = results.some((r) => r === false);
  if (failed) {
    console.log("\nOne or more checks FAILED.");
    process.exit(1);
  }
  console.log("\nAll checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
