// Creates a new SPL token mint (an "alt-coin") on the configured cluster.
import { Connection } from "@solana/web3.js";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { loadWalletKeypair, resolveClusterEndpoint } from "./lib/solana";

const CLUSTER = process.env.CLUSTER ?? "localhost"; // localhost | devnet | testnet | mainnet-beta
const DECIMALS = Number(process.env.DECIMALS ?? 9);
const INITIAL_SUPPLY = BigInt(process.env.INITIAL_SUPPLY ?? "1000000000"); // in base units

async function main() {
  const endpoint = resolveClusterEndpoint(CLUSTER);
  const connection = new Connection(endpoint, "confirmed");
  const payer = loadWalletKeypair();

  console.log(`Creating token mint on ${CLUSTER} (${endpoint})`);
  console.log(`Payer: ${payer.publicKey.toBase58()}`);

  const mint = await createMint(
    connection,
    payer,
    payer.publicKey, // mint authority
    payer.publicKey, // freeze authority
    DECIMALS
  );
  console.log(`Mint address: ${mint.toBase58()}`);

  const tokenAccount = await getOrCreateAssociatedTokenAccount(connection, payer, mint, payer.publicKey);
  console.log(`Token account: ${tokenAccount.address.toBase58()}`);

  if (INITIAL_SUPPLY > 0n) {
    const sig = await mintTo(connection, payer, mint, tokenAccount.address, payer, INITIAL_SUPPLY);
    console.log(`Minted ${INITIAL_SUPPLY} base units. Tx: ${sig}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
