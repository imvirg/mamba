import { expect } from "chai";
import { MAMBA_U64_MAX, parseLaunchConfig } from "../scripts/lib/launch-config";

const validEnvironment = {
  CLUSTER: "devnet",
  DECIMALS: "9",
  SUPPLY: "1000",
  TRANSFER_FEE_BPS: "0",
  TRANSFER_FEE_MAX_BASE_UNITS: MAMBA_U64_MAX.toString(),
  TEAM_ALLOCATION_BPS: "2000",
};

describe("launch configuration", () => {
  it("requires an explicit cluster", () => {
    expect(() =>
      parseLaunchConfig({ ...validEnvironment, CLUSTER: undefined })
    ).to.throw("Set CLUSTER=<value> env var");
  });

  it("computes the 1,000-token devnet supply consistently", () => {
    const config = parseLaunchConfig(validEnvironment, {
      requireExplicitValues: true,
    });

    expect(config.cluster).to.equal("devnet");
    expect(config.decimals).to.equal(9);
    expect(config.supplyWholeTokens).to.equal(1000n);
    expect(config.supplyBaseUnits).to.equal(1000000000000n);
  });

  it("defaults the launch supply to 1,000 whole tokens", () => {
    const config = parseLaunchConfig({ CLUSTER: "devnet" });

    expect(config.supplyWholeTokens).to.equal(1000n);
    expect(config.supplyBaseUnits).to.equal(1000000000000n);
  });

  it("splits supply into a 20% team share and an 80% airdrop share", () => {
    const config = parseLaunchConfig(validEnvironment, {
      requireExplicitValues: true,
    });

    expect(config.teamAllocationBps).to.equal(2000);
    expect(config.teamBaseUnits).to.equal(200000000000n);
    expect(config.airdropBaseUnits).to.equal(800000000000n);
  });

  it("requires an explicit team allocation for launches", () => {
    expect(() =>
      parseLaunchConfig(
        { ...validEnvironment, TEAM_ALLOCATION_BPS: undefined },
        { requireExplicitValues: true }
      )
    ).to.throw("TEAM_ALLOCATION_BPS is required");
    expect(() =>
      parseLaunchConfig({ ...validEnvironment, TEAM_ALLOCATION_BPS: "10001" })
    ).to.throw("TEAM_ALLOCATION_BPS must be an integer between 0 and 10000");
  });

  it("rejects a team allocation that splits base units", () => {
    expect(() =>
      parseLaunchConfig({
        ...validEnvironment,
        DECIMALS: "0",
        SUPPLY: "3",
        TEAM_ALLOCATION_BPS: "2000",
      })
    ).to.throw("TEAM_ALLOCATION_BPS must split SUPPLY into whole base units");
  });

  it("rejects decimals outside Token-2022 bounds", () => {
    expect(() =>
      parseLaunchConfig({ ...validEnvironment, DECIMALS: "256" })
    ).to.throw("DECIMALS must be an integer between 0 and 255");
  });

  it("rejects supply overflow after decimal scaling", () => {
    expect(() =>
      parseLaunchConfig({
        ...validEnvironment,
        SUPPLY: MAMBA_U64_MAX.toString(),
        DECIMALS: "1",
      })
    ).to.throw("SUPPLY exceeds the Token-2022 u64 limit");
  });

  it("rejects invalid transfer fee settings", () => {
    expect(() =>
      parseLaunchConfig({ ...validEnvironment, TRANSFER_FEE_BPS: "10001" })
    ).to.throw("TRANSFER_FEE_BPS must be an integer between 0 and 10000");
    expect(() =>
      parseLaunchConfig({
        ...validEnvironment,
        TRANSFER_FEE_MAX_BASE_UNITS: (MAMBA_U64_MAX + 1n).toString(),
      })
    ).to.throw("TRANSFER_FEE_MAX_BASE_UNITS");
  });

  it("rejects non-canonical numeric syntax", () => {
    expect(() =>
      parseLaunchConfig({ ...validEnvironment, SUPPLY: "1e3" })
    ).to.throw("SUPPLY must be a canonical unsigned integer");
  });
});
