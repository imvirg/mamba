import { Connection } from "@solana/web3.js";
import { resolveClusterEndpoint } from "./lib/solana";
import { loadLaunchState, updateLaunchState } from "./lib/launch-state-store";
import {
  hasRejectedTransactions,
  hasUnknownTransactions,
  reconcileUnknownTransactions,
} from "./lib/launch-reconciliation";

function requireStatePath(): string {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--state") {
    throw new Error("Usage: reconcile-launch --state <absolute-path>");
  }
  return args[1];
}

async function main(): Promise<void> {
  const statePath = requireStatePath();
  const state = loadLaunchState(statePath);
  const pendingTransactions = Object.values(state.transactions).filter(
    (transaction) => transaction?.outcome === "unknown" && transaction.signature
  );

  if (pendingTransactions.length === 0) {
    const rejected = hasRejectedTransactions(state.transactions);
    console.log(
      JSON.stringify({
        launchId: state.launchId,
        reconciled: 0,
        status: rejected ? "rejected" : "no_unknown_transactions",
      })
    );
    if (rejected) process.exitCode = 2;
    return;
  }

  const connection = new Connection(
    resolveClusterEndpoint(state.cluster),
    "confirmed"
  );
  const statuses = await connection.getSignatureStatuses(
    pendingTransactions.map((transaction) => transaction!.signature!)
  );
  const statusesBySignature = new Map(
    pendingTransactions.map((transaction, index) => [
      transaction!.signature!,
      statuses.value[index] ?? null,
    ])
  );
  const finalState = updateLaunchState(statePath, (current) => {
    const currentPendingTransactions = Object.values(
      current.transactions
    ).filter(
      (transaction) =>
        transaction?.outcome === "unknown" && transaction.signature
    );
    const currentStatuses = currentPendingTransactions.map(
      (transaction) => statusesBySignature.get(transaction!.signature!) ?? null
    );
    const transactions = reconcileUnknownTransactions(current, currentStatuses);
    return { ...current, transactions };
  });

  console.log(
    JSON.stringify({
      launchId: finalState.launchId,
      reconciled: pendingTransactions.length,
      status: hasUnknownTransactions(finalState.transactions)
        ? "unknown"
        : hasRejectedTransactions(finalState.transactions)
        ? "rejected"
        : "reconciled",
      transactions: finalState.transactions,
    })
  );

  if (hasUnknownTransactions(finalState.transactions)) {
    process.exitCode = 3;
  } else if (hasRejectedTransactions(finalState.transactions)) {
    process.exitCode = 2;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
