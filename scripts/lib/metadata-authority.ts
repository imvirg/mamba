// Reads a mint's Metaplex metadata account straight from its bytes so the
// launch and the independent verifier can check who may rewrite the token's
// name, symbol and URI. Left alone, Metaplex makes the payer (a hot wallet)
// the update authority; MAMBA requires the governance vault instead.
import { PublicKey } from "@solana/web3.js";

export const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);
const METADATA_V1_KEY = 4;
const CREATOR_SIZE = 34; // pubkey + verified + share

export function findMetadataAddress(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata"),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    TOKEN_METADATA_PROGRAM_ID
  )[0];
}

export interface MetadataAuthority {
  accountOwner: PublicKey;
  updateAuthority: PublicKey;
  mint: PublicKey;
  isMutable: boolean;
}

export function parseMetadataAuthority(
  accountOwner: PublicKey,
  data: Uint8Array
): MetadataAuthority {
  const bytes = Buffer.from(data);
  const need = (offset: number, length: number) => {
    if (offset + length > bytes.length) {
      throw new Error("Metadata account data is truncated");
    }
  };
  need(0, 65);
  if (bytes[0] !== METADATA_V1_KEY) {
    throw new Error(`Unexpected metadata account key: ${bytes[0]}`);
  }
  const updateAuthority = new PublicKey(bytes.subarray(1, 33));
  const mint = new PublicKey(bytes.subarray(33, 65));
  let offset = 65;
  // name, symbol, uri: borsh strings (u32 length + bytes).
  for (let i = 0; i < 3; i++) {
    need(offset, 4);
    const length = bytes.readUInt32LE(offset);
    offset += 4 + length;
  }
  offset += 2; // seller_fee_basis_points
  need(offset, 1);
  if (bytes[offset++] === 1) {
    need(offset, 4);
    offset += 4 + bytes.readUInt32LE(offset) * CREATOR_SIZE;
  }
  need(offset, 2);
  offset += 1; // primary_sale_happened
  const isMutable = bytes[offset] === 1;
  return { accountOwner, updateAuthority, mint, isMutable };
}

export function assertMetadataAuthority(
  actual: MetadataAuthority,
  expected: { mint: PublicKey; authority: PublicKey }
): void {
  if (!actual.accountOwner.equals(TOKEN_METADATA_PROGRAM_ID)) {
    throw new Error(
      `Metadata account is not owned by Token Metadata: ${actual.accountOwner.toBase58()}`
    );
  }
  if (!actual.mint.equals(expected.mint)) {
    throw new Error(
      `Metadata account belongs to a different mint: ${actual.mint.toBase58()}`
    );
  }
  if (!actual.updateAuthority.equals(expected.authority)) {
    throw new Error(
      `Metadata update authority must be ${expected.authority.toBase58()}, found ${actual.updateAuthority.toBase58()}`
    );
  }
}
