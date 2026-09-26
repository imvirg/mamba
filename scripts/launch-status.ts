import { PublicKey } from "@solana/web3.js";
import { getVaultPda } from "@sqds/multisig";
import { loadLaunchState } from "./lib/launch-state-store";
import { LaunchState } from "./lib/launch-state";

function requireStatePath(): string {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--state") {
    throw new Error("Usage: launch-status --state <absolute-path>");
  }
  return args[1];
}

function getStatus(state: LaunchState): {
  status: "incomplete" | "unknown" | "blocked" | "complete_recorded";
  decision: "BLOCK" | "PROCEED";
  exitCode: number;
} {
  if (state.phase === "blocked") {
    return { status: "blocked", decision: "BLOCK", exitCode: 4 };
  }
  const transactions = Object.entries(state.transactions);
  if (
    transactions.some(([, transaction]) => transaction?.outcome === "unknown")
  ) {
    return { status: "unknown", decision: "BLOCK", exitCode: 3 };
  }
  if (
    state.phase !== "verified" ||
    transactions.some(([, transaction]) => transaction?.outcome !== "confirmed")
  ) {
    return { status: "incomplete", decision: "BLOCK", exitCode: 2 };
  }
  return { status: "complete_recorded", decision: "BLOCK", exitCode: 2 };
}

function authoritiesMatch(state: LaunchState): boolean {
  const [expectedAuthorityVault] = getVaultPda({
    multisigPda: new PublicKey(state.expectedMultisig),
    index: 0,
  });
  return expectedAuthorityVault.toBase58() === state.authorityMultisig;
}

try {
  const state = loadLaunchState(requireStatePath());
  const result = getStatus(state);
  console.log(
    JSON.stringify({
      schemaVersion: state.schemaVersion,
      launchId: state.launchId,
      cluster: state.cluster,
      mintPublicKey: state.mintPublicKey,
      phase: state.phase,
      status: result.status,
      decision: result.decision,
      authorityMultisig: state.authorityMultisig,
      authorityVault: state.authorityMultisig,
      expectedMultisig: state.expectedMultisig,
      authoritiesMatch: authoritiesMatch(state),
      transactions: state.transactions,
      note: "Local state only; chain verification is required before launch decisions.",
    })
  );
  process.exit(result.exitCode);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
