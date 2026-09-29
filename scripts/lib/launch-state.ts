import { PublicKey } from "@solana/web3.js";
import { MAMBA_MAINNET_AUTHORITY } from "../../shared/mamba";

export const LAUNCH_STATE_VERSION = 1;

export type LaunchPhase =
  | "prepared"
  | "mint_initialized"
  | "metadata_attached"
  | "supply_minted"
  | "authority_revoked"
  | "verified"
  | "blocked";

export type LaunchTransactionOutcome = "unknown" | "confirmed" | "rejected";

export interface LaunchTransaction {
  signature: string | null;
  submittedAt: string;
  outcome: LaunchTransactionOutcome;
}

export interface LaunchState {
  schemaVersion: 1;
  launchId: string;
  phase: LaunchPhase;
  cluster: "localhost" | "devnet" | "testnet" | "mainnet-beta";
  mintPublicKey: string;
  mintSignerKeyRef: string;
  payerPublicKey: string;
  authorityMultisig: string;
  expectedMultisig: string;
  expectedThreshold: number;
  expectedMembers: string[];
  decimals: number;
  supplyWholeTokens: string;
  supplyBaseUnits: string;
  metadata: {
    name: string;
    symbol: string;
    uri: string;
  };
  transactions: {
    mintInitialization: LaunchTransaction | null;
    metadataAttachment: LaunchTransaction | null;
    initialMint: LaunchTransaction | null;
    authorityRevocation: LaunchTransaction | null;
  };
  createdAt: string;
  updatedAt: string;
}

const phases: LaunchPhase[] = [
  "prepared",
  "mint_initialized",
  "metadata_attached",
  "supply_minted",
  "authority_revoked",
  "verified",
  "blocked",
];
const clusters = ["localhost", "devnet", "testnet", "mainnet-beta"] as const;
const allowedFields = new Set([
  "schemaVersion",
  "launchId",
  "phase",
  "cluster",
  "mintPublicKey",
  "mintSignerKeyRef",
  "payerPublicKey",
  "authorityMultisig",
  "expectedMultisig",
  "expectedThreshold",
  "expectedMembers",
  "decimals",
  "supplyWholeTokens",
  "supplyBaseUnits",
  "metadata",
  "transactions",
  "createdAt",
  "updatedAt",
]);

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Launch state ${field} must be a non-empty string`);
  }
  return value;
}

function requirePublicKey(value: unknown, field: string): string {
  const stringValue = requireString(value, field);
  try {
    new PublicKey(stringValue);
  } catch {
    throw new Error(
      `${field} is not a valid Solana public key: ${stringValue}`
    );
  }
  return stringValue;
}

function requireInteger(value: unknown, field: string, min: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min) {
    throw new Error(
      `${field} must be an integer greater than or equal to ${min}`
    );
  }
  return value;
}

function requirePositiveIntegerString(value: unknown, field: string): string {
  const stringValue = requireString(value, field);
  try {
    if (BigInt(stringValue) <= 0n) throw new Error();
  } catch {
    throw new Error(`${field} must be a positive integer`);
  }
  return stringValue;
}

function parseTransaction(
  value: unknown,
  field: string
): LaunchTransaction | null {
  if (value === null) return null;
  if (
    value === undefined ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new Error(`Launch state ${field} must be an object or null`);
  }
  const input = value as Record<string, unknown>;
  const outcome = input.outcome;
  if (
    outcome !== "unknown" &&
    outcome !== "confirmed" &&
    outcome !== "rejected"
  ) {
    throw new Error(`Unsupported transaction outcome: ${outcome}`);
  }
  if (input.signature !== null && input.signature !== undefined) {
    requireString(input.signature, `${field}.signature`);
  }
  return {
    signature:
      input.signature === null
        ? null
        : requireString(input.signature, `${field}.signature`),
    submittedAt: requireString(input.submittedAt, `${field}.submittedAt`),
    outcome,
  };
}

function requireTransactionCheckpoint(
  transaction: LaunchTransaction | null,
  field: string
): void {
  if (transaction === null || transaction.signature === null) {
    throw new Error(`Launch state phase requires the ${field} checkpoint`);
  }
}

function requireConfirmedTransaction(
  transaction: LaunchTransaction | null,
  field: string
): void {
  requireTransactionCheckpoint(transaction, field);
  if (transaction === null || transaction.outcome !== "confirmed") {
    throw new Error(
      `Verified launch state requires a confirmed ${field} transaction`
    );
  }
}

function validatePhaseEvidence(
  phase: LaunchPhase,
  transactions: LaunchState["transactions"]
): void {
  if (phase === "prepared" || phase === "blocked") return;
  requireTransactionCheckpoint(
    transactions.mintInitialization,
    "mintInitialization"
  );
  if (phase === "mint_initialized") return;

  requireTransactionCheckpoint(
    transactions.metadataAttachment,
    "metadataAttachment"
  );
  if (phase === "metadata_attached") return;

  requireTransactionCheckpoint(transactions.initialMint, "initialMint");
  if (phase === "supply_minted") return;

  // Recorded as soon as the revoke is sent (outcome still unknown), like
  // every earlier phase; only "verified" demands confirmed outcomes.
  requireTransactionCheckpoint(
    transactions.authorityRevocation,
    "authorityRevocation"
  );
  if (phase === "authority_revoked") return;

  requireConfirmedTransaction(
    transactions.mintInitialization,
    "mintInitialization"
  );
  requireConfirmedTransaction(
    transactions.metadataAttachment,
    "metadataAttachment"
  );
  requireConfirmedTransaction(transactions.initialMint, "initialMint");
  requireConfirmedTransaction(
    transactions.authorityRevocation,
    "authorityRevocation"
  );
}

export function parseLaunchState(value: unknown): LaunchState {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Launch state must be an object");
  }
  const input = value as Record<string, unknown>;
  for (const field of Object.keys(input)) {
    if (!allowedFields.has(field)) {
      throw new Error(`Unknown launch state field: ${field}`);
    }
  }
  if (input.schemaVersion !== LAUNCH_STATE_VERSION) {
    throw new Error(`Unsupported launch state version: ${input.schemaVersion}`);
  }
  if (!phases.includes(input.phase as LaunchPhase)) {
    throw new Error(`Unsupported launch phase: ${input.phase}`);
  }
  if (!clusters.includes(input.cluster as (typeof clusters)[number])) {
    throw new Error(`Unsupported cluster: ${input.cluster}`);
  }

  const expectedMembers = input.expectedMembers;
  if (
    !Array.isArray(expectedMembers) ||
    expectedMembers.length < 2 ||
    expectedMembers.some((member) => typeof member !== "string")
  ) {
    throw new Error(
      "Launch state expectedMembers must contain at least two keys"
    );
  }
  const memberKeys = expectedMembers.map((member, index) =>
    requirePublicKey(member, `expectedMembers[${index}]`)
  );
  if (new Set(memberKeys).size !== memberKeys.length) {
    throw new Error("Launch state expectedMembers must not contain duplicates");
  }
  const expectedThreshold = requireInteger(
    input.expectedThreshold,
    "expectedThreshold",
    2
  );
  if (expectedThreshold > memberKeys.length) {
    throw new Error(
      "Launch state expectedThreshold cannot exceed expectedMembers count"
    );
  }
  const decimals = requireInteger(input.decimals, "decimals", 0);
  if (decimals > 255) {
    throw new Error("Launch state decimals must not exceed 255");
  }

  const metadata = input.metadata;
  if (
    metadata === null ||
    typeof metadata !== "object" ||
    Array.isArray(metadata)
  ) {
    throw new Error("Launch state metadata must be an object");
  }
  const metadataInput = metadata as Record<string, unknown>;
  const transactions = input.transactions;
  if (
    transactions === null ||
    typeof transactions !== "object" ||
    Array.isArray(transactions)
  ) {
    throw new Error("Launch state transactions must be an object");
  }
  const transactionInput = transactions as Record<string, unknown>;
  const supplyWholeTokens = requirePositiveIntegerString(
    input.supplyWholeTokens,
    "supplyWholeTokens"
  );
  const supplyBaseUnits = requirePositiveIntegerString(
    input.supplyBaseUnits,
    "supplyBaseUnits"
  );
  const expectedBaseUnits = BigInt(supplyWholeTokens) * 10n ** BigInt(decimals);
  if (expectedBaseUnits > 18446744073709551615n) {
    throw new Error(
      "Launch state supplyBaseUnits exceeds the Token-2022 u64 limit"
    );
  }
  if (BigInt(supplyBaseUnits) !== expectedBaseUnits) {
    throw new Error(
      "Launch state supplyBaseUnits does not match supplyWholeTokens"
    );
  }

  const parsedTransactions = {
    mintInitialization: parseTransaction(
      transactionInput.mintInitialization,
      "transactions.mintInitialization"
    ),
    metadataAttachment: parseTransaction(
      transactionInput.metadataAttachment,
      "transactions.metadataAttachment"
    ),
    initialMint: parseTransaction(
      transactionInput.initialMint,
      "transactions.initialMint"
    ),
    authorityRevocation: parseTransaction(
      transactionInput.authorityRevocation,
      "transactions.authorityRevocation"
    ),
  };
  validatePhaseEvidence(input.phase as LaunchPhase, parsedTransactions);

  return {
    schemaVersion: 1,
    launchId: requireString(input.launchId, "launchId"),
    phase: input.phase as LaunchPhase,
    cluster: input.cluster as LaunchState["cluster"],
    mintPublicKey: requirePublicKey(input.mintPublicKey, "mintPublicKey"),
    mintSignerKeyRef: requireString(input.mintSignerKeyRef, "mintSignerKeyRef"),
    payerPublicKey: requirePublicKey(input.payerPublicKey, "payerPublicKey"),
    authorityMultisig: requirePublicKey(
      input.authorityMultisig,
      "authorityMultisig"
    ),
    expectedMultisig: requirePublicKey(
      input.expectedMultisig,
      "expectedMultisig"
    ),
    expectedThreshold,
    expectedMembers: memberKeys,
    decimals,
    supplyWholeTokens,
    supplyBaseUnits,
    metadata: {
      name: requireString(metadataInput.name, "metadata.name"),
      symbol: requireString(metadataInput.symbol, "metadata.symbol"),
      uri: requireString(metadataInput.uri, "metadata.uri"),
    },
    transactions: parsedTransactions,
    createdAt: requireString(input.createdAt, "createdAt"),
    updatedAt: requireString(input.updatedAt, "updatedAt"),
  };
}

export function transitionLaunchState(
  state: LaunchState,
  target: LaunchPhase
): LaunchState {
  if (!phases.includes(target)) {
    throw new Error(`Unsupported launch phase: ${target}`);
  }
  if (state.phase === "blocked") {
    throw new Error("Launch phase blocked is terminal");
  }
  if (target === "blocked") {
    return { ...state, phase: target };
  }
  const currentIndex = phases.indexOf(state.phase);
  const targetIndex = phases.indexOf(target);
  if (targetIndex !== currentIndex + 1) {
    throw new Error(
      `Invalid launch phase transition: ${state.phase} -> ${target}`
    );
  }
  return { ...state, phase: target };
}

export function requireApprovedMainnetAuthority(state: LaunchState): void {
  if (
    state.cluster === "mainnet-beta" &&
    state.authorityMultisig !== MAMBA_MAINNET_AUTHORITY
  ) {
    throw new Error(
      `AUTHORITY_MULTISIG is not the approved mainnet governance authority: ${MAMBA_MAINNET_AUTHORITY}`
    );
  }
}
