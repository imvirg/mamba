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
import { accounts, getVaultPda, PROGRAM_ID, types } from "@sqds/multisig";
import { resolveClusterEndpoint } from "../shared/mamba";
import { requireEnv } from "./lib/solana";
import { requireTransferFeeConfig } from "./lib/mint-validation";
import { assertAutonomousMultisig } from "./lib/authority";
import {
  findMetadataAddress,
  parseMetadataAuthority,
  TOKEN_METADATA_PROGRAM_ID,
} from "./lib/metadata-authority";

const CLUSTER = requireEnv("CLUSTER");
const MINT = new PublicKey(requireEnv("MINT"));
const EXPECTED_MULTISIG = new PublicKey(requireEnv("EXPECTED_MULTISIG"));
const EXPECTED_AUTHORITY = new PublicKey(requireEnv("EXPECTED_AUTHORITY"));
const expectedThreshold = Number(requireEnv("EXPECTED_THRESHOLD"));
const expectedMembers = requireEnv("EXPECTED_MEMBERS")
  .split(",")
  .map((member) => new PublicKey(member.trim()));

if (
  !Number.isInteger(expectedThreshold) ||
  expectedThreshold < 2 ||
  expectedThreshold > expectedMembers.length
) {
  throw new Error(
    "EXPECTED_THRESHOLD must be an integer between 2 and EXPECTED_MEMBERS count"
  );
}

if (
  new Set(expectedMembers.map((member) => member.toBase58())).size !==
  expectedMembers.length
) {
  throw new Error("EXPECTED_MEMBERS must not contain duplicate public keys");
}

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
  const multisigInfo = await connection.getAccountInfo(EXPECTED_MULTISIG);
  if (!multisigInfo) {
    throw new Error(
      `Expected multisig account not found: ${EXPECTED_MULTISIG.toBase58()}`
    );
  }
  if (!multisigInfo.owner.equals(PROGRAM_ID)) {
    throw new Error(
      `Expected multisig is not owned by the Squads program: ${multisigInfo.owner.toBase58()}`
    );
  }
  const multisig = await accounts.Multisig.fromAccountAddress(
    connection,
    EXPECTED_MULTISIG,
    "confirmed"
  );
  const voterCount = multisig.members.filter(
    (member) =>
      (member.permissions.mask & types.Permission.Vote) ===
      types.Permission.Vote
  ).length;
  const actualVoters = multisig.members
    .filter(
      (member) =>
        (member.permissions.mask & types.Permission.Vote) ===
        types.Permission.Vote
    )
    .map((member) => member.key.toBase58())
    .sort();
  const configuredVoters = expectedMembers
    .map((member) => member.toBase58())
    .sort();
  console.log(
    `Squads multisig: ${
      multisig.threshold
    }-of-${voterCount} voters; members: ${multisig.members
      .map((member) => member.key.toBase58())
      .join(", ")}`
  );
  if (voterCount < 2 || multisig.threshold < 2) {
    throw new Error(
      "Expected authority must have at least two voters and a threshold of at least two"
    );
  }
  assertAutonomousMultisig(multisig.configAuthority);
  if (multisig.threshold !== expectedThreshold) {
    throw new Error(
      `Multisig threshold mismatch: expected ${expectedThreshold}, found ${multisig.threshold}`
    );
  }
  if (
    actualVoters.length !== configuredVoters.length ||
    actualVoters.some((member, index) => member !== configuredVoters[index])
  ) {
    throw new Error(
      `Multisig voter set mismatch: expected ${configuredVoters.join(
        ", "
      )}, found ${actualVoters.join(", ")}`
    );
  }
  const [vaultPda] = getVaultPda({
    multisigPda: EXPECTED_MULTISIG,
    index: 0,
  });
  if (!vaultPda.equals(EXPECTED_AUTHORITY)) {
    throw new Error(
      `Expected authority does not match Squads vault 0: ${vaultPda.toBase58()}`
    );
  }
  const mint = await getMint(
    connection,
    MINT,
    "confirmed",
    TOKEN_2022_PROGRAM_ID
  );
  const feeConfig = getTransferFeeConfig(mint);
  requireTransferFeeConfig(feeConfig);

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

  const feeAuthOk =
    feeConfig.transferFeeConfigAuthority?.equals(EXPECTED_AUTHORITY) ?? false;
  const withdrawAuthOk =
    feeConfig.withdrawWithheldAuthority?.equals(EXPECTED_AUTHORITY) ?? false;
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
  const metadataAddress = findMetadataAddress(MINT);
  const metadataAccount = await connection.getAccountInfo(
    metadataAddress,
    "confirmed"
  );
  const metadata =
    metadataAccount && metadataAccount.owner.equals(TOKEN_METADATA_PROGRAM_ID)
      ? parseMetadataAuthority(metadataAccount.owner, metadataAccount.data)
      : null;
  const metadataOk =
    metadata !== null &&
    metadata.mint.equals(MINT) &&
    metadata.updateAuthority.equals(EXPECTED_AUTHORITY);
  results.push(
    report(
      "Metadata update authority",
      metadataOk,
      metadata
        ? `${metadata.updateAuthority.toBase58()} (${
            metadata.isMutable ? "mutable" : "immutable"
          })`
        : `no Token Metadata account at ${metadataAddress.toBase58()}`
    )
  );
  console.log(
    `\nCurrent transfer fee: ${feeConfig.olderTransferFee.transferFeeBasisPoints} bps (older), ` +
      `${feeConfig.newerTransferFee.transferFeeBasisPoints} bps (newer, epoch ${feeConfig.newerTransferFee.epoch})`
  );

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
