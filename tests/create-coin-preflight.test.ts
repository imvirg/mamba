import { expect } from "chai";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { createLaunchState } from "../scripts/lib/launch-state-store";
import { LaunchState } from "../scripts/lib/launch-state";

const creatorPath = path.resolve(process.cwd(), "scripts/create-coin.ts");

function runCreator(environment: Record<string, string | undefined>) {
  const processEnvironment = { ...process.env };
  for (const [name, value] of Object.entries(environment)) {
    if (value === undefined) delete processEnvironment[name];
    else processEnvironment[name] = value;
  }
  return spawnSync(process.execPath, ["-r", "ts-node/register", creatorPath], {
    env: processEnvironment,
    encoding: "utf8",
  });
}

const explicitDevnetConfig = {
  CLUSTER: "devnet",
  LAUNCH_ID: "launch-1",
  LAUNCH_STATE: "/tmp/launch-state.json",
  MINT_SIGNER_PATH: "/tmp/mint-signer.json",
  AUTHORITY_MULTISIG: "11111111111111111111111111111111",
  DECIMALS: "9",
  SUPPLY: "1000",
  TRANSFER_FEE_BPS: "0",
  TRANSFER_FEE_MAX_BASE_UNITS: "18446744073709551615",
};

describe("create-coin preflight", function () {
  this.timeout(10000);

  it("requires an explicit cluster before launch setup", () => {
    const result = runCreator({
      CLUSTER: undefined,
      LAUNCH_ID: undefined,
      LAUNCH_STATE: undefined,
      MINT_SIGNER_PATH: undefined,
      AUTHORITY_MULTISIG: undefined,
    });

    expect(result.status).to.equal(1);
    expect(`${result.stdout}${result.stderr}`).to.contain(
      "Set CLUSTER=<value> env var"
    );
  });

  it("rejects unsupported clusters before launch setup", () => {
    const result = runCreator({
      CLUSTER: "invalid",
      LAUNCH_ID: "launch-1",
      LAUNCH_STATE: "/tmp/launch-state.json",
      MINT_SIGNER_PATH: "/tmp/mint-signer.json",
      AUTHORITY_MULTISIG: "11111111111111111111111111111111",
    });

    expect(result.status).to.equal(1);
    expect(`${result.stdout}${result.stderr}`).to.contain(
      "Unsupported cluster: invalid"
    );
  });

  it("rejects invalid decimals before launch setup", () => {
    const result = runCreator({ ...explicitDevnetConfig, DECIMALS: "256" });

    expect(result.status).to.equal(1);
    expect(`${result.stdout}${result.stderr}`).to.contain(
      "DECIMALS must be an integer between 0 and 255"
    );
  });

  it("rejects invalid transfer fee maximum before launch setup", () => {
    const result = runCreator({
      ...explicitDevnetConfig,
      TRANSFER_FEE_MAX_BASE_UNITS: "18446744073709551616",
    });

    expect(result.status).to.equal(1);
    expect(`${result.stdout}${result.stderr}`).to.contain(
      "TRANSFER_FEE_MAX_BASE_UNITS"
    );
  });

  it("blocks a second launch when state already exists", () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "mamba-preflight-")
    );
    fs.chmodSync(directory, 0o700);
    const launchStatePath = path.join(directory, "launch.json");
    const state: LaunchState = {
      schemaVersion: 1,
      launchId: "existing-launch",
      phase: "mint_initialized",
      cluster: "devnet",
      mintPublicKey: "11111111111111111111111111111111",
      mintSignerKeyRef: path.join(directory, "mint-signer.json"),
      payerPublicKey: "SysvarRent111111111111111111111111111111111",
      authorityMultisig: "11111111111111111111111111111111",
      expectedMultisig: "11111111111111111111111111111111",
      expectedThreshold: 2,
      expectedMembers: [
        "11111111111111111111111111111111",
        "SysvarRent111111111111111111111111111111111",
      ],
      decimals: 9,
      supplyWholeTokens: "1000",
      supplyBaseUnits: "1000000000000",
      metadata: {
        name: "MAMBA",
        symbol: "MAMBA",
        uri: "https://example.com/mamba.json",
      },
      transactions: {
        mintInitialization: {
          signature: "signature",
          submittedAt: "2026-09-03T00:00:00.000Z",
          outcome: "confirmed",
        },
        metadataAttachment: null,
        initialMint: null,
        authorityRevocation: null,
      },
      createdAt: "2026-09-03T00:00:00.000Z",
      updatedAt: "2026-09-03T00:00:00.000Z",
    };
    createLaunchState(launchStatePath, state);

    try {
      const result = runCreator({
        ...explicitDevnetConfig,
        LAUNCH_STATE: launchStatePath,
        MINT_SIGNER_PATH: path.join(directory, "mint-signer.json"),
      });

      expect(result.status).to.equal(1);
      expect(`${result.stdout}${result.stderr}`).to.contain(
        "Launch state already exists"
      );
      expect(`${result.stdout}${result.stderr}`).to.contain("existing-launch");
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects resume when launch state is missing", () => {
    const result = runCreator({
      ...explicitDevnetConfig,
      RESUME_LAUNCH: "1",
      LAUNCH_STATE: "/tmp/mamba-missing-resume-state.json",
    });

    expect(result.status).to.equal(1);
    expect(`${result.stdout}${result.stderr}`).to.contain(
      "Cannot resume launch because state does not exist"
    );
  });
});
