import { expect } from "chai";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  createLaunchState,
  loadLaunchState,
  updateLaunchState,
  withLaunchStateLock,
} from "../scripts/lib/launch-state-store";
import { LaunchState } from "../scripts/lib/launch-state";

const stateDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "mamba-state-"));
const memberOne = "11111111111111111111111111111111";
const memberTwo = "SysvarRent111111111111111111111111111111111";

function makeState(): LaunchState {
  return {
    schemaVersion: 1,
    launchId: "launch-1",
    phase: "prepared",
    cluster: "devnet",
    mintPublicKey: memberOne,
    mintSignerKeyRef: "/secure/mamba/launch-1-mint.json",
    payerPublicKey: memberTwo,
    authorityMultisig: memberOne,
    expectedMultisig: memberTwo,
    expectedThreshold: 2,
    expectedMembers: [memberOne, memberTwo],
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
      mintInitialization: null,
      metadataAttachment: null,
      initialMint: null,
      authorityRevocation: null,
    },
    createdAt: "2026-09-03T00:00:00.000Z",
    updatedAt: "2026-09-03T00:00:00.000Z",
  };
}

function statePath(name: string): string {
  return path.join(stateDirectory, name);
}

describe("launch state store", () => {
  it("round-trips a state with private permissions", () => {
    const filePath = statePath("round-trip.json");
    const state = makeState();

    createLaunchState(filePath, state);

    expect(loadLaunchState(filePath)).to.deep.equal(state);
    expect(fs.statSync(filePath).mode & 0o777).to.equal(0o600);
  });

  it("rejects replacing an existing state", () => {
    const filePath = statePath("existing.json");
    createLaunchState(filePath, makeState());

    expect(() => createLaunchState(filePath, makeState())).to.throw();
  });

  it("rejects malformed JSON", () => {
    const filePath = statePath("malformed.json");
    fs.writeFileSync(filePath, "not-json", { mode: 0o600 });

    expect(() => loadLaunchState(filePath)).to.throw(
      "Invalid launch state JSON"
    );
  });

  it("updates only through the next phase", () => {
    const filePath = statePath("update.json");
    createLaunchState(filePath, makeState());

    const updated = updateLaunchState(filePath, (state) => ({
      ...state,
      phase: "mint_initialized",
      transactions: {
        ...state.transactions,
        mintInitialization: {
          signature: "signature",
          submittedAt: "2026-09-03T00:00:01.000Z",
          outcome: "confirmed",
        },
      },
    }));

    expect(updated.phase).to.equal("mint_initialized");
    expect(loadLaunchState(filePath).phase).to.equal("mint_initialized");
  });

  it("persists a confirmed transaction checkpoint", () => {
    const filePath = statePath("transaction.json");
    createLaunchState(filePath, makeState());

    updateLaunchState(filePath, (state) => ({
      ...state,
      transactions: {
        ...state.transactions,
        mintInitialization: {
          signature: "5qapM6hL6JqYc3wQj7w9KQ5w6XwVfTt3uB9pY8J2wN1x",
          submittedAt: "2026-09-03T00:00:01.000Z",
          outcome: "confirmed",
        },
      },
      phase: "mint_initialized",
    }));

    expect(
      loadLaunchState(filePath).transactions.mintInitialization
    ).to.deep.include({
      outcome: "confirmed",
    });
  });

  it("rejects configuration changes during an update", () => {
    const filePath = statePath("immutable.json");
    createLaunchState(filePath, makeState());

    expect(() =>
      updateLaunchState(filePath, (state) => ({
        ...state,
        phase: "mint_initialized",
        authorityMultisig: memberTwo,
        transactions: {
          ...state.transactions,
          mintInitialization: {
            signature: "signature",
            submittedAt: "2026-09-03T00:00:01.000Z",
            outcome: "confirmed",
          },
        },
      }))
    ).to.throw("Launch identity cannot change");
  });

  it("rejects a symlinked state path", () => {
    const targetPath = statePath("target.json");
    const linkPath = statePath("link.json");
    createLaunchState(targetPath, makeState());
    fs.symlinkSync(targetPath, linkPath);

    expect(() => loadLaunchState(linkPath)).to.throw(
      "Launch state is not a regular file"
    );
  });

  it("saves state while a whole launch run holds its lock", async () => {
    const filePath = statePath("run-lock.json");
    createLaunchState(filePath, makeState());

    await withLaunchStateLock(filePath, async () => {
      updateLaunchState(filePath, (state) => ({ ...state, phase: "blocked" }));
    });

    expect(loadLaunchState(filePath).phase).to.equal("blocked");
    expect(fs.existsSync(`${filePath}.run.lock`)).to.equal(false);
    expect(fs.existsSync(`${filePath}.lock`)).to.equal(false);
  });

  it("refuses a second run on the same launch", async () => {
    const filePath = statePath("second-run.json");
    createLaunchState(filePath, makeState());

    let secondRunError: unknown;
    await withLaunchStateLock(filePath, async () => {
      try {
        await withLaunchStateLock(filePath, async () => undefined);
      } catch (error) {
        secondRunError = error;
      }
    });

    expect(String(secondRunError)).to.contain("EEXIST");
  });
});
