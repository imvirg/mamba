import { expect } from "chai";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Keypair, PublicKey } from "@solana/web3.js";
import { createMintSigner, loadMintSigner } from "../scripts/lib/mint-signer";

const signerDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "mamba-signer-"));

function signerPath(name: string): string {
  return path.join(signerDirectory, name);
}

describe("mint signer store", () => {
  it("round-trips a signer with private permissions", () => {
    const mint = Keypair.generate();
    const filePath = signerPath("round-trip.json");

    createMintSigner(filePath, mint);

    expect(
      loadMintSigner(filePath, mint.publicKey).publicKey.equals(mint.publicKey)
    ).to.equal(true);
    expect(fs.statSync(filePath).mode & 0o777).to.equal(0o600);
  });

  it("rejects an existing signer path", () => {
    const mint = Keypair.generate();
    const filePath = signerPath("existing.json");
    createMintSigner(filePath, mint);

    expect(() => createMintSigner(filePath, Keypair.generate())).to.throw();
  });

  it("rejects a signer for a different mint", () => {
    const mint = Keypair.generate();
    const filePath = signerPath("wrong-mint.json");
    createMintSigner(filePath, mint);

    expect(() => loadMintSigner(filePath, PublicKey.default)).to.throw(
      "does not match expected mint"
    );
  });

  it("rejects a symlinked signer path", () => {
    const mint = Keypair.generate();
    const targetPath = signerPath("target.json");
    const linkPath = signerPath("link.json");
    createMintSigner(targetPath, mint);
    fs.symlinkSync(targetPath, linkPath);

    expect(() => loadMintSigner(linkPath, mint.publicKey)).to.throw(
      "Mint signer is not a regular file"
    );
  });

  it("rejects an invalid signer file", () => {
    const filePath = signerPath("invalid.json");
    fs.writeFileSync(filePath, "[1, 2, 3]\n", { mode: 0o600 });

    expect(() => loadMintSigner(filePath, PublicKey.default)).to.throw(
      "64-byte secret key array"
    );
  });
});
