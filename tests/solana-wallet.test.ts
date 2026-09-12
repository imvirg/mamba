import { expect } from "chai";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Keypair } from "@solana/web3.js";
import { loadWalletKeypair } from "../scripts/lib/solana";

describe("payer wallet loading", () => {
  let directoryPath: string;
  let walletPath: string;
  let previousWallet: string | undefined;

  beforeEach(() => {
    directoryPath = fs.mkdtempSync(path.join(os.tmpdir(), "mamba-wallet-"));
    walletPath = path.join(directoryPath, "id.json");
    previousWallet = process.env.WALLET;
  });

  afterEach(() => {
    if (previousWallet === undefined) {
      delete process.env.WALLET;
    } else {
      process.env.WALLET = previousWallet;
    }
    fs.rmSync(directoryPath, { recursive: true, force: true });
  });

  it("loads a private wallet with an absolute path", () => {
    const expected = Keypair.generate();
    fs.writeFileSync(
      walletPath,
      JSON.stringify(Array.from(expected.secretKey)),
      {
        mode: 0o600,
      }
    );
    process.env.WALLET = walletPath;

    expect(loadWalletKeypair().publicKey.equals(expected.publicKey)).to.equal(
      true
    );
  });

  it("rejects a wallet with broad permissions", () => {
    fs.writeFileSync(walletPath, JSON.stringify(Array(64).fill(1)), {
      mode: 0o644,
    });
    process.env.WALLET = walletPath;

    expect(() => loadWalletKeypair()).to.throw(
      "Wallet permissions are too broad"
    );
  });

  it("rejects a wallet symlink", () => {
    const targetPath = path.join(directoryPath, "target.json");
    fs.writeFileSync(targetPath, JSON.stringify(Array(64).fill(1)), {
      mode: 0o600,
    });
    fs.symlinkSync(targetPath, walletPath);
    process.env.WALLET = walletPath;

    expect(() => loadWalletKeypair()).to.throw("Wallet is not a regular file");
  });
});
