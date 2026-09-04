import { expect } from "chai";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { createLaunchState } from "../scripts/lib/launch-state-store";
import { LaunchState } from "../scripts/lib/launch-state";

const statusPath = path.resolve(process.cwd(), "scripts/launch-status.ts");
const statusDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "mamba-status-"));

function makeState(phase: LaunchState["phase"]): LaunchState {
  return {
    schemaVersion: 1,
    launchId: "launch-status-test",
    phase,
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
    metadata: {
      name: "MAMBA",
      symbol: "MAMBA",
      uri: "https://example.com/mamba.json",
    },
    transactions: {
      mintInitialization: null,
      metadataAttachment: null,
      initialMint: null,
      authorityRevocation: null,
    },
    createdAt: "2026-09-03T00:00:00.000Z",
    updatedAt: "2026-09-03T00:00:00.000Z",
  };
}

function runStatus(filePath: string) {
  return spawnSync(
    process.execPath,
    ["-r", "ts-node/register", statusPath, "--state", filePath],
    { encoding: "utf8" }
  );
}

describe("launch-status", () => {
  it("reports an incomplete local state without RPC", () => {
    const filePath = path.join(statusDirectory, "incomplete.json");
    createLaunchState(filePath, makeState("prepared"));

    const result = runStatus(filePath);
    const output = JSON.parse(result.stdout);

    expect(result.status).to.equal(2);
    expect(output.status).to.equal("incomplete");
    expect(output.decision).to.equal("BLOCK");
    expect(output).not.to.have.property("mintSignerKeyRef");
  });

  it("reports unknown transaction state as blocked", () => {
    const filePath = path.join(statusDirectory, "unknown.json");
    const state = makeState("mint_initialized");
    state.transactions.mintInitialization = {
      signature: "signature",
      submittedAt: "2026-09-03T00:00:00.000Z",
      outcome: "unknown",
    };
    createLaunchState(filePath, state);

    const result = runStatus(filePath);
    expect(result.status).to.equal(3);
    expect(JSON.parse(result.stdout).status).to.equal("unknown");
  });

  it("reports blocked state with a blocking decision", () => {
    const filePath = path.join(statusDirectory, "blocked.json");
    createLaunchState(filePath, makeState("blocked"));

    const result = runStatus(filePath);
    expect(result.status).to.equal(4);
    expect(JSON.parse(result.stdout).decision).to.equal("BLOCK");
  });

  it("never signals production readiness from local state", () => {
    const filePath = path.join(statusDirectory, "recorded.json");
    const state = makeState("verified");
    for (const key of Object.keys(state.transactions) as Array<
      keyof LaunchState["transactions"]
    >) {
      state.transactions[key] = {
        signature: "signature",
        submittedAt: "2026-09-03T00:00:00.000Z",
        outcome: "confirmed",
      };
    }
    createLaunchState(filePath, state);

    const result = runStatus(filePath);
    const output = JSON.parse(result.stdout);
    expect(result.status).to.equal(0);
    expect(output.status).to.equal("complete_recorded");
    expect(output.decision).to.equal("BLOCK");
  });
});
