import { expect } from "chai";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import {
  assertFinalMintState,
  assertPreMintState,
  requireTransferFeeConfig,
  TransferFeeConfig,
} from "../scripts/lib/mint-validation";

const authority = new PublicKey("HbMnEvNGdWmUr7Zdqj6aKMkzXUtUVUXviPDd3qQVtDoW");
const validFeeConfig = {
  transferFeeConfigAuthority: authority,
  withdrawWithheldAuthority: authority,
} as TransferFeeConfig;
const validSnapshot = {
  accountOwner: TOKEN_2022_PROGRAM_ID,
  supply: 1000n,
  decimals: 2,
  mintAuthority: null,
  freezeAuthority: null,
  transferFeeConfig: validFeeConfig,
};

describe("mint validation", () => {
  it("rejects a mint without TransferFeeConfig", () => {
    expect(() => requireTransferFeeConfig(null)).to.throw(
      "TransferFeeConfig extension is required"
    );
  });

  it("accepts a final Token-2022 mint state", () => {
    expect(() =>
      assertFinalMintState(validSnapshot, {
        authority,
        supply: 1000n,
        decimals: 2,
      })
    ).not.to.throw();
  });

  it("rejects an incorrect final supply", () => {
    expect(() =>
      assertFinalMintState(
        { ...validSnapshot, supply: 999n },
        { authority, supply: 1000n, decimals: 2 }
      )
    ).to.throw("Mint supply mismatch");
  });

  it("accepts a correctly initialized pre-mint state", () => {
    expect(() =>
      assertPreMintState(
        { ...validSnapshot, mintAuthority: authority, supply: 0n },
        { mintAuthority: authority, authority, decimals: 2 }
      )
    ).not.to.throw();
  });

  it("rejects nonzero pre-mint supply", () => {
    expect(() =>
      assertPreMintState(
        { ...validSnapshot, mintAuthority: authority, supply: 1n },
        { mintAuthority: authority, authority, decimals: 2 }
      )
    ).to.throw("refusing initial mint");
  });

  it("rejects pre-mint authority drift", () => {
    expect(() =>
      assertPreMintState(
        { ...validSnapshot, mintAuthority: PublicKey.default, supply: 0n },
        { mintAuthority: authority, authority, decimals: 2 }
      )
    ).to.throw("does not match the launch payer");
  });

  it("rejects a mint that is not owned by Token-2022", () => {
    expect(() =>
      assertFinalMintState(
        { ...validSnapshot, accountOwner: PublicKey.default },
        { authority, supply: 1000n, decimals: 2 }
      )
    ).to.throw("Mint account is not owned by Token-2022");
  });
});
