import { PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

export function assertToken2022MintAuthority(
  mintOwner: PublicKey,
  mintAuthority: PublicKey | null,
  payer: PublicKey
): void {
  if (!mintOwner.equals(TOKEN_2022_PROGRAM_ID)) {
    throw new Error(
      `Mint must be owned by Token-2022: ${TOKEN_2022_PROGRAM_ID.toBase58()}`
    );
  }
  if (mintAuthority === null || !mintAuthority.equals(payer)) {
    throw new Error("Mint authority does not match the payer");
  }
}
