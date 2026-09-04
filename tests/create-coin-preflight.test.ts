import { expect } from "chai";
import { spawnSync } from "child_process";
import * as path from "path";

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

describe("create-coin preflight", () => {
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
});
