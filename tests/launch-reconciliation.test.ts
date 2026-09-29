import { expect } from "chai";
import { LaunchState } from "../scripts/lib/launch-state";
import {
  classifySignatureStatus,
  reconcileUnknownTransactions,
} from "../scripts/lib/launch-reconciliation";

const unknownTransaction = {
  signature: "signature",
  submittedAt: "2026-09-03T00:00:00.000Z",
  outcome: "unknown" as const,
};

function makeState(): LaunchState {
  return {
    schemaVersion: 1,
    launchId: "reconcile-test",
    phase: "mint_initialized",
    cluster: "devnet",
    mintPublicKey: "11111111111111111111111111111111",
    mintSignerKeyRef: "/secure/mamba/mint.json",
    payerPublicKey: "SysvarRent111111111111111111111111111111111",
    authorityMultisig: "11111111111111111111111111111111",
    expectedMultisig: "SysvarRent111111111111111111111111111111111",
    expectedThreshold: 2,
    expectedMembers: [
      "11111111111111111111111111111111",
      "SysvarRent111111111111111111111111111111111",
    ],
    decimals: 2,
    supplyWholeTokens: "1000",
    supplyBaseUnits: "100000",
    teamAllocationBps: 2000,
    metadata: {
      name: "MAMBA",
      symbol: "MAMBA",
      uri: "https://example.com/mamba.json",
    },
    transactions: {
      mintInitialization: unknownTransaction,
      metadataAttachment: null,
      initialMint: null,
      authorityRevocation: null,
    },
    createdAt: "2026-09-03T00:00:00.000Z",
    updatedAt: "2026-09-03T00:00:00.000Z",
  };
}

describe("launch reconciliation", () => {
  it("requires finalized signatures", () => {
    expect(
      classifySignatureStatus({ err: null, confirmationStatus: "confirmed" })
    ).to.equal("unknown");
    expect(
      classifySignatureStatus({ err: null, confirmationStatus: "finalized" })
    ).to.equal("confirmed");
  });

  it("classifies failed signatures as rejected", () => {
    expect(
      classifySignatureStatus({
        err: { InstructionError: [0, "Custom"] },
        confirmationStatus: "confirmed",
      })
    ).to.equal("rejected");
  });

  it("keeps missing or processed signatures unknown", () => {
    expect(classifySignatureStatus(null)).to.equal("unknown");
    expect(
      classifySignatureStatus({ err: null, confirmationStatus: "processed" })
    ).to.equal("unknown");

    const transactions = reconcileUnknownTransactions(makeState(), [null]);
    expect(transactions.mintInitialization?.outcome).to.equal("unknown");
  });

  it("updates only the persisted unknown transaction", () => {
    const transactions = reconcileUnknownTransactions(makeState(), [
      { err: null, confirmationStatus: "finalized" },
    ]);

    expect(transactions.mintInitialization?.outcome).to.equal("confirmed");
    expect(transactions.metadataAttachment).to.equal(null);
  });
});
