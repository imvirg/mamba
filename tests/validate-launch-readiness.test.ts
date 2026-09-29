import { expect } from "chai";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { Keypair } from "@solana/web3.js";

const validatorPath = path.resolve(
  process.cwd(),
  "scripts/validate-launch-readiness.ts"
);
const approvedMainnetAuthority = "HbMnEvNGdWmUr7Zdqj6aKMkzXUtUVUXviPDd3qQVtDoW";
const explicitLaunchConfig = {
  DECIMALS: "9",
  SUPPLY: "1000",
  TRANSFER_FEE_BPS: "0",
  TRANSFER_FEE_MAX_BASE_UNITS: "18446744073709551615",
  TEAM_ALLOCATION_BPS: "2000",
};

function runValidator(environment: Record<string, string | undefined>): {
  status: number | null;
  output: string;
} {
  const processEnvironment: Record<string, string | undefined> = {
    ...process.env,
    ...explicitLaunchConfig,
  };
  for (const [name, value] of Object.entries(environment)) {
    if (value === undefined) {
      delete processEnvironment[name];
    } else {
      processEnvironment[name] = value;
    }
  }

  const result = spawnSync(
    process.execPath,
    ["-r", "ts-node/register", validatorPath],
    {
      env: processEnvironment,
      encoding: "utf8",
    }
  );

  return {
    status: result.status,
    output: `${result.stdout}${result.stderr}`,
  };
}

describe("validate-launch-readiness", () => {
  before(function () {
    this.timeout(10000);
  });

  it("rejects unsupported clusters", () => {
    const result = runValidator({
      CLUSTER: "invalid",
      AUTHORITY_MULTISIG: undefined,
    });

    expect(result.status).to.equal(1);
    expect(result.output).to.contain("Unsupported cluster");
  });

  it("rejects missing authority in strict mode", () => {
    const result = runValidator({
      CLUSTER: "devnet",
      STRICT_LAUNCH: "1",
      AUTHORITY_MULTISIG: undefined,
    });

    expect(result.status).to.equal(1);
    expect(result.output).to.contain("AUTHORITY_MULTISIG is required");
  });

  it("rejects missing authority on devnet by default", () => {
    const result = runValidator({
      CLUSTER: "devnet",
      AUTHORITY_MULTISIG: undefined,
    });

    expect(result.status).to.equal(1);
    expect(result.output).to.contain(
      "AUTHORITY_MULTISIG is required for every non-local cluster"
    );
  });

  it("rejects missing authority on testnet by default", () => {
    const result = runValidator({
      CLUSTER: "testnet",
      AUTHORITY_MULTISIG: undefined,
    });

    expect(result.status).to.equal(1);
    expect(result.output).to.contain(
      "AUTHORITY_MULTISIG is required for every non-local cluster"
    );
  });

  it("rejects a missing wallet on devnet by default", () => {
    const result = runValidator({
      CLUSTER: "devnet",
      AUTHORITY_MULTISIG: "11111111111111111111111111111111",
      WALLET: "/tmp/mamba-test-wallet-does-not-exist.json",
    });

    expect(result.status).to.equal(1);
    expect(result.output).to.contain("Wallet file not found");
  });

  it("rejects missing launch economics", () => {
    const result = runValidator({
      CLUSTER: "devnet",
      DECIMALS: undefined,
    });

    expect(result.status).to.equal(1);
    expect(result.output).to.contain("DECIMALS is required");
  });

  it("requires expected governance configuration for a devnet authority", () => {
    // Needs a real wallet file so the validator gets past the wallet check
    // to the governance check (CI has no ~/.config/solana/id.json).
    const walletPath = path.join(
      process.cwd(),
      "tests",
      `.mamba-devnet-governance-wallet-${process.pid}.json`
    );
    const wallet = Keypair.generate();
    fs.writeFileSync(walletPath, JSON.stringify(Array.from(wallet.secretKey)), {
      mode: 0o600,
    });
    try {
      const result = runValidator({
        CLUSTER: "devnet",
        AUTHORITY_MULTISIG: "11111111111111111111111111111111",
        WALLET: walletPath,
        EXPECTED_MULTISIG: undefined,
        EXPECTED_THRESHOLD: undefined,
        EXPECTED_MEMBERS: undefined,
      });

      expect(result.status).to.equal(1);
      expect(result.output).to.contain(
        "Set EXPECTED_THRESHOLD=<value> env var"
      );
    } finally {
      fs.rmSync(walletPath, { force: true });
    }
  });

  it("rejects an unapproved mainnet authority", () => {
    const result = runValidator({
      CLUSTER: "mainnet-beta",
      AUTHORITY_MULTISIG: "11111111111111111111111111111111",
      WALLET: "/dev/null",
    });

    expect(result.status).to.equal(1);
    expect(result.output).to.contain(
      "AUTHORITY_MULTISIG is not the approved mainnet governance authority"
    );
  });

  it("requires live governance configuration for the approved mainnet authority", () => {
    const walletPath = path.join(
      process.cwd(),
      "tests",
      `.mamba-governance-wallet-${process.pid}.json`
    );
    const wallet = Keypair.generate();
    fs.writeFileSync(walletPath, JSON.stringify(Array.from(wallet.secretKey)), {
      mode: 0o600,
    });
    try {
      const result = runValidator({
        CLUSTER: "mainnet-beta",
        AUTHORITY_MULTISIG: approvedMainnetAuthority,
        WALLET: walletPath,
        EXPECTED_MULTISIG: undefined,
        EXPECTED_THRESHOLD: undefined,
        EXPECTED_MEMBERS: undefined,
      });

      expect(result.status).to.equal(1);
      expect(result.output).to.contain(
        "Set EXPECTED_THRESHOLD=<value> env var"
      );
    } finally {
      fs.rmSync(walletPath, { force: true });
    }
  });

  it("rejects malformed supply", () => {
    const result = runValidator({
      CLUSTER: "devnet",
      SUPPLY: "not-a-number",
      AUTHORITY_MULTISIG: undefined,
    });

    expect(result.status).to.equal(1);
    expect(result.output).to.contain(
      "SUPPLY must be a canonical unsigned integer"
    );
  });

  it("rejects an invalid transfer fee maximum", () => {
    const result = runValidator({
      CLUSTER: "devnet",
      TRANSFER_FEE_MAX_BASE_UNITS: "18446744073709551616",
      AUTHORITY_MULTISIG: undefined,
    });

    expect(result.status).to.equal(1);
    expect(result.output).to.contain("TRANSFER_FEE_MAX_BASE_UNITS");
  });

  it("rejects supply that exceeds the Token-2022 u64 limit", () => {
    const result = runValidator({
      CLUSTER: "devnet",
      SUPPLY: "18446744073709551615",
      DECIMALS: "1",
      AUTHORITY_MULTISIG: undefined,
    });

    expect(result.status).to.equal(1);
    expect(result.output).to.contain("SUPPLY");
  });

  it("rejects a missing wallet in strict mode", () => {
    const result = runValidator({
      CLUSTER: "devnet",
      STRICT_LAUNCH: "1",
      AUTHORITY_MULTISIG: "11111111111111111111111111111111",
      WALLET: "/tmp/mamba-test-wallet-does-not-exist.json",
    });

    expect(result.status).to.equal(1);
    expect(result.output).to.contain("Wallet file not found");
  });

  it("rejects an existing wallet with broad permissions", () => {
    const walletPath = path.join(
      process.cwd(),
      "tests",
      `.mamba-invalid-wallet-${process.pid}.json`
    );
    fs.writeFileSync(walletPath, "[]", { mode: 0o644 });
    try {
      const result = runValidator({
        CLUSTER: "devnet",
        AUTHORITY_MULTISIG: "11111111111111111111111111111111",
        WALLET: walletPath,
      });

      expect(result.status).to.equal(1);
      expect(result.output).to.contain("Wallet permissions are too broad");
    } finally {
      fs.rmSync(walletPath, { force: true });
    }
  });

  it("allows a localhost dry run with a missing wallet", () => {
    const result = runValidator({
      CLUSTER: "localhost",
      AUTHORITY_MULTISIG: undefined,
      WALLET: "/tmp/mamba-test-wallet-does-not-exist.json",
    });

    expect(result.status).to.equal(0);
    expect(result.output).to.contain("Launch readiness checks passed");
  });
});
