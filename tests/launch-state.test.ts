import { expect } from "chai";
import { PublicKey } from "@solana/web3.js";
import {
  LaunchState,
  parseLaunchState,
  requireApprovedMainnetAuthority,
  transitionLaunchState,
} from "../scripts/lib/launch-state";

const memberOne = "11111111111111111111111111111111";
const memberTwo = "SysvarRent111111111111111111111111111111111";
const authority = "HbMnEvNGdWmUr7Zdqj6aKMkzXUtUVUXviPDd3qQVtDoW";

function makeState(overrides: Partial<LaunchState> = {}): LaunchState {
  return {
    schemaVersion: 1,
    launchId: "launch-1",
    phase: "prepared",
    cluster: "devnet",
    mintPublicKey: memberOne,
    mintSignerKeyRef: "/secure/mamba/launch-1-mint.json",
    payerPublicKey: memberTwo,
    authorityMultisig: authority,
    expectedMultisig: memberOne,
    expectedThreshold: 2,
    expectedMembers: [memberOne, memberTwo],
    decimals: 9,
    supplyWholeTokens: "100000000",
    supplyBaseUnits: "100000000000000000",
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
    ...overrides,
  };
}

describe("launch state", () => {
  it("parses a complete state without private key material", () => {
    const state = parseLaunchState(makeState());

    expect(state.phase).to.equal("prepared");
    expect(state.mintSignerKeyRef).to.contain("launch-1-mint.json");
  });

  it("rejects unknown fields", () => {
    expect(() =>
      parseLaunchState({ ...makeState(), privateKey: "secret" })
    ).to.throw("Unknown launch state field: privateKey");
  });

  it("rejects an invalid threshold", () => {
    expect(() =>
      parseLaunchState({ ...makeState(), expectedThreshold: 3 })
    ).to.throw("expectedThreshold cannot exceed expectedMembers count");
  });

  it("rejects decimals above the Token-2022 limit", () => {
    expect(() => parseLaunchState({ ...makeState(), decimals: 256 })).to.throw(
      "decimals must not exceed 255"
    );
  });

  it("rejects inconsistent base-unit supply", () => {
    expect(() =>
      parseLaunchState({ ...makeState(), supplyBaseUnits: "1000" })
    ).to.throw("supplyBaseUnits does not match supplyWholeTokens");
  });

  it("allows only the next forward phase", () => {
    const state = parseLaunchState(makeState());
    const configured = transitionLaunchState(state, "mint_initialized");

    expect(configured.phase).to.equal("mint_initialized");
    expect(() => transitionLaunchState(state, "supply_minted")).to.throw(
      "Invalid launch phase transition: prepared -> supply_minted"
    );
  });

  it("rejects backward transitions and changes after blocked", () => {
    const state = parseLaunchState(makeState({ phase: "metadata_attached" }));
    const blocked = transitionLaunchState(state, "blocked");

    expect(() => transitionLaunchState(state, "prepared")).to.throw(
      "Invalid launch phase transition: metadata_attached -> prepared"
    );
    expect(() => transitionLaunchState(blocked, "supply_minted")).to.throw(
      "Launch phase blocked is terminal"
    );
  });

  it("requires the approved mainnet authority", () => {
    const state = parseLaunchState(
      makeState({ cluster: "mainnet-beta", authorityMultisig: authority })
    );
    expect(() => requireApprovedMainnetAuthority(state)).not.to.throw();
    expect(() =>
      requireApprovedMainnetAuthority({
        ...state,
        authorityMultisig: PublicKey.default.toBase58(),
      })
    ).to.throw("not the approved mainnet governance authority");
  });
});
