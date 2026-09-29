import { expect } from "chai";
import { Keypair, PublicKey } from "@solana/web3.js";
import { assertAutonomousMultisig } from "../scripts/lib/authority";

describe("squads authority", () => {
  it("accepts an autonomous multisig (no config authority)", () => {
    expect(() => assertAutonomousMultisig(PublicKey.default)).not.to.throw();
  });

  it("rejects a controlled multisig whose config authority can bypass votes", () => {
    const configAuthority = Keypair.generate().publicKey;
    expect(() => assertAutonomousMultisig(configAuthority)).to.throw(
      `Multisig has a config authority (${configAuthority.toBase58()})`
    );
  });
});
