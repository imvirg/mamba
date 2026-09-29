import * as fs from "fs";
import * as path from "path";
import { Keypair, PublicKey } from "@solana/web3.js";

function assertDirectory(directoryPath: string): void {
  const stat = fs.lstatSync(directoryPath);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(
      `Mint signer directory is not a real directory: ${directoryPath}`
    );
  }
  if (process.getuid && stat.uid !== process.getuid()) {
    throw new Error(
      `Mint signer directory is not owned by the current user: ${directoryPath}`
    );
  }
  if ((stat.mode & 0o077) !== 0) {
    throw new Error(
      `Mint signer directory permissions are too broad: ${directoryPath}`
    );
  }
}

function assertSignerPath(filePath: string): string {
  if (!path.isAbsolute(filePath)) {
    throw new Error("Mint signer path must be absolute");
  }
  const directoryPath = path.dirname(filePath);
  assertDirectory(directoryPath);
  return directoryPath;
}

function assertPrivateSigner(filePath: string): void {
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`Mint signer is not a regular file: ${filePath}`);
  }
  if (process.getuid && stat.uid !== process.getuid()) {
    throw new Error(
      `Mint signer is not owned by the current user: ${filePath}`
    );
  }
  if ((stat.mode & 0o077) !== 0) {
    throw new Error(`Mint signer permissions are too broad: ${filePath}`);
  }
}

function parseSigner(filePath: string, expectedMint: PublicKey): Keypair {
  assertPrivateSigner(filePath);
  let value: unknown;
  try {
    value = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(
      `Invalid mint signer JSON: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
  if (
    !Array.isArray(value) ||
    value.length !== 64 ||
    value.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)
  ) {
    throw new Error("Mint signer must contain a 64-byte secret key array");
  }
  let signer: Keypair;
  try {
    signer = Keypair.fromSecretKey(Uint8Array.from(value));
  } catch (error) {
    throw new Error(
      `Invalid mint signer secret key: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
  if (!signer.publicKey.equals(expectedMint)) {
    throw new Error(
      `Mint signer public key does not match expected mint: ${signer.publicKey.toBase58()}`
    );
  }
  return signer;
}

export function createMintSigner(filePath: string, mint: Keypair): void {
  assertSignerPath(filePath);
  const descriptor = fs.openSync(filePath, "wx", 0o600);
  let completed = false;
  try {
    fs.writeFileSync(
      descriptor,
      `${JSON.stringify(Array.from(mint.secretKey))}\n`,
      "utf8"
    );
    fs.fsyncSync(descriptor);
    completed = true;
  } finally {
    fs.closeSync(descriptor);
    if (!completed) fs.rmSync(filePath, { force: true });
  }
  fs.chmodSync(filePath, 0o600);
  parseSigner(filePath, mint.publicKey);
}

export function loadMintSigner(
  filePath: string,
  expectedMint: PublicKey
): Keypair {
  assertSignerPath(filePath);
  return parseSigner(filePath, expectedMint);
}
