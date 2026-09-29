import { expect } from "chai";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  assertMetadataAuthority,
  parseMetadataAuthority,
  TOKEN_METADATA_PROGRAM_ID,
} from "../scripts/lib/metadata-authority";

function borshString(value: string): Buffer {
  const bytes = Buffer.from(value);
  const length = Buffer.alloc(4);
  length.writeUInt32LE(bytes.length);
  return Buffer.concat([length, bytes]);
}

// Same layout as a Token Metadata V1 account, trailing fields zeroed.
function metadataBytes(
  updateAuthority: PublicKey,
  mint: PublicKey,
  options: { isMutable: boolean; creators: number }
): Buffer {
  const creators =
    options.creators === 0
      ? Buffer.from([0])
      : Buffer.concat([
          Buffer.from([1]),
          (() => {
            const count = Buffer.alloc(4);
            count.writeUInt32LE(options.creators);
            return count;
          })(),
          Buffer.alloc(34 * options.creators, 7),
        ]);
  return Buffer.concat([
    Buffer.from([4]),
    updateAuthority.toBuffer(),
    mint.toBuffer(),
    borshString("MAMBA"),
    borshString("MAMBA"),
    borshString("https://example.com/mamba.json"),
    Buffer.from([0, 0]),
    creators,
    Buffer.from([0, options.isMutable ? 1 : 0]),
    Buffer.alloc(40),
  ]);
}

describe("metadata authority", () => {
  const vault = Keypair.generate().publicKey;
  const payer = Keypair.generate().publicKey;
  const mint = Keypair.generate().publicKey;

  it("reads the update authority, mint and mutability", () => {
    for (const creators of [0, 1, 3]) {
      for (const isMutable of [true, false]) {
        const parsed = parseMetadataAuthority(
          TOKEN_METADATA_PROGRAM_ID,
          metadataBytes(vault, mint, { isMutable, creators })
        );
        expect(parsed.updateAuthority.equals(vault)).to.equal(true);
        expect(parsed.mint.equals(mint)).to.equal(true);
        expect(parsed.isMutable).to.equal(isMutable);
      }
    }
  });

  it("accepts the governance vault as update authority", () => {
    const parsed = parseMetadataAuthority(
      TOKEN_METADATA_PROGRAM_ID,
      metadataBytes(vault, mint, { isMutable: true, creators: 1 })
    );
    expect(() =>
      assertMetadataAuthority(parsed, { mint, authority: vault })
    ).not.to.throw();
  });

  it("rejects a payer (hot wallet) update authority", () => {
    const parsed = parseMetadataAuthority(
      TOKEN_METADATA_PROGRAM_ID,
      metadataBytes(payer, mint, { isMutable: true, creators: 1 })
    );
    expect(() =>
      assertMetadataAuthority(parsed, { mint, authority: vault })
    ).to.throw("Metadata update authority must be");
  });

  it("rejects metadata for another mint or owned by another program", () => {
    const otherMint = Keypair.generate().publicKey;
    const forOtherMint = parseMetadataAuthority(
      TOKEN_METADATA_PROGRAM_ID,
      metadataBytes(vault, otherMint, { isMutable: true, creators: 0 })
    );
    expect(() =>
      assertMetadataAuthority(forOtherMint, { mint, authority: vault })
    ).to.throw("different mint");

    const wrongOwner = parseMetadataAuthority(
      PublicKey.default,
      metadataBytes(vault, mint, { isMutable: true, creators: 0 })
    );
    expect(() =>
      assertMetadataAuthority(wrongOwner, { mint, authority: vault })
    ).to.throw("not owned by Token Metadata");
  });

  it("rejects truncated or non-metadata data", () => {
    expect(() =>
      parseMetadataAuthority(TOKEN_METADATA_PROGRAM_ID, Buffer.alloc(10))
    ).to.throw("truncated");
    const wrongKey = metadataBytes(vault, mint, {
      isMutable: true,
      creators: 0,
    });
    wrongKey[0] = 6;
    expect(() =>
      parseMetadataAuthority(TOKEN_METADATA_PROGRAM_ID, wrongKey)
    ).to.throw("Unexpected metadata account key");
  });
});
