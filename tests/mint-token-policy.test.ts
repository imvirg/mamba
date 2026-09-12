import { expect } from "chai";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { assertToken2022MintAuthority } from "../scripts/lib/mint-token-policy";

const payer = new PublicKey("11111111111111111111111111111111");
const other = new PublicKey("SysvarRent111111111111111111111111111111111");

describe("mint-token policy", () => {
  it("accepts a Token-2022 mint controlled by the payer", () => {
    expect(() =>
      assertToken2022MintAuthority(TOKEN_2022_PROGRAM_ID, payer, payer)
    ).not.to.throw();
  });

  it("rejects a non-Token-2022 mint", () => {
    expect(() =>
      assertToken2022MintAuthority(PublicKey.default, payer, payer)
    ).to.throw("Mint must be owned by Token-2022");
  });

  it("rejects a revoked or different mint authority", () => {
    expect(() =>
      assertToken2022MintAuthority(TOKEN_2022_PROGRAM_ID, null, payer)
    ).to.throw("Mint authority does not match the payer");
    expect(() =>
      assertToken2022MintAuthority(TOKEN_2022_PROGRAM_ID, other, payer)
    ).to.throw("Mint authority does not match the payer");
  });
});
