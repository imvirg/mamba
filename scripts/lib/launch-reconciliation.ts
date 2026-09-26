import { LaunchState, LaunchTransactionOutcome } from "./launch-state";

export interface SignatureStatusLike {
  err: unknown;
  confirmationStatus?: "processed" | "confirmed" | "finalized" | null;
}

const transactionNames = [
  "mintInitialization",
  "metadataAttachment",
  "initialMint",
  "authorityRevocation",
] as const;

type TransactionName = (typeof transactionNames)[number];

export function classifySignatureStatus(
  status: SignatureStatusLike | null
): LaunchTransactionOutcome {
  if (status === null) return "unknown";
  if (status.err !== null) return "rejected";
  if (status.confirmationStatus === "finalized") {
    return "confirmed";
  }
  return "unknown";
}

export function reconcileUnknownTransactions(
  state: LaunchState,
  statuses: ReadonlyArray<SignatureStatusLike | null>
): LaunchState["transactions"] {
  const transactions = { ...state.transactions };
  let statusIndex = 0;

  for (const name of transactionNames) {
    const transaction = transactions[name];
    if (transaction?.outcome !== "unknown" || transaction.signature === null) {
      continue;
    }
    const outcome = classifySignatureStatus(statuses[statusIndex] ?? null);
    statusIndex += 1;
    transactions[name] = { ...transaction, outcome };
  }

  return transactions;
}

export function hasUnknownTransactions(
  transactions: LaunchState["transactions"]
): boolean {
  return transactionNames.some(
    (name: TransactionName) => transactions[name]?.outcome === "unknown"
  );
}

export function hasRejectedTransactions(
  transactions: LaunchState["transactions"]
): boolean {
  return transactionNames.some(
    (name: TransactionName) => transactions[name]?.outcome === "rejected"
  );
}
