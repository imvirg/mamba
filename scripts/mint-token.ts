// Mints additional supply of an existing SPL token to a destination wallet.
import { Connection, PublicKey } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import {
  loadWalletKeypair,
  requireEnv,
  requireNonProductionCluster,
  resolveClusterEndpoint,
} from "./lib/solana";

const CLUSTER = process.env.CLUSTER ?? "localhost";
const AMOUNT = BigInt(process.env.AMOUNT ?? "1000000000"); // in base units
const DEST = process.env.DEST; // optional: base58 owner pubkey, defaults to payer

async function main() {
  requireNonProductionCluster(CLUSTER, "mint-token");
  const mint = new PublicKey(requireEnv("MINT"));
  const endpoint = resolveClusterEndpoint(CLUSTER);
  const connection = new Connection(endpoint, "confirmed");
  const payer = loadWalletKeypair();
  const owner = DEST ? new PublicKey(DEST) : payer.publicKey;

  // Mints can be legacy SPL Token or Token-2022 (e.g. MAMBA); read the owning
  // program off the mint account instead of assuming one.
  const mintAccountInfo = await connection.getAccountInfo(mint);
  if (!mintAccountInfo) {
    throw new Error(`Mint account not found: ${mint.toBase58()}`);
  }
  const programId = mintAccountInfo.owner;

  const tokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mint,
    owner,
    false,
    "confirmed",
    undefined,
    programId
  );
  const sig = await mintTo(
    connection,
    payer,
    mint,
    tokenAccount.address,
    payer,
    AMOUNT,
    undefined,
    undefined,
    programId
  );

  console.log(
    `Minted ${AMOUNT} base units of ${mint.toBase58()} to ${tokenAccount.address.toBase58()}`
  );
  console.log(`Tx: ${sig}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
