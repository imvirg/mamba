// Launches MAMBA as a Token-2022 mint (with on-chain Metaplex name/symbol/logo
// metadata) instead of legacy SPL Token. Token-2022 is required so the mint can
// later support a transfer fee (tax) and withheld-fee burn without a re-mint /
// holder migration. The fee starts at 0 bps — flip it on later via
// createSetTransferFeeInstruction once there's revenue to justify it.
import {
  Connection,
  Keypair,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  ExtensionType,
  getMintLen,
  createInitializeTransferFeeConfigInstruction,
  createInitializeMintInstruction,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  createSignerFromKeypair,
  keypairIdentity,
  percentAmount,
  publicKey as umiPublicKey,
} from "@metaplex-foundation/umi";
import { createFungible } from "@metaplex-foundation/mpl-token-metadata";
import { mplToolbox } from "@metaplex-foundation/mpl-toolbox";
import {
  loadWalletKeypair,
  loadWalletSecretBytes,
  resolveClusterEndpoint,
} from "./lib/solana";

const CLUSTER = process.env.CLUSTER ?? "devnet"; // localhost | devnet | testnet | mainnet-beta
const NAME = process.env.NAME ?? "MAMBA";
const SYMBOL = process.env.SYMBOL ?? "MAMBA";
// Hosted JSON metadata file (name/symbol/image) — see mamba/metadata.json
const URI =
  process.env.URI ??
  "https://raw.githubusercontent.com/imvirg/mamba/main/mamba/metadata.json";
const DECIMALS = Number(process.env.DECIMALS ?? 9);
const SUPPLY = BigInt(process.env.SUPPLY ?? "100000000"); // whole tokens, not base units
// Transfer fee (tax), in basis points. Starts inactive; raise later once MAMBA
// has real volume by calling createSetTransferFeeInstruction as the fee authority.
const TRANSFER_FEE_BPS = Number(process.env.TRANSFER_FEE_BPS ?? 0);
// Uncapped by default (u64::MAX) so a future bps increase isn't silently
// capped by a stale absolute ceiling. Override with TRANSFER_FEE_MAX_BASE_UNITS
// if you want a hard cap per transfer.
const TRANSFER_FEE_MAX_BASE_UNITS = BigInt(
  process.env.TRANSFER_FEE_MAX_BASE_UNITS ?? "18446744073709551615"
);

async function main() {
  if (
    !Number.isInteger(TRANSFER_FEE_BPS) ||
    TRANSFER_FEE_BPS < 0 ||
    TRANSFER_FEE_BPS > 10000
  ) {
    throw new Error("TRANSFER_FEE_BPS must be an integer between 0 and 10000");
  }

  const endpoint = resolveClusterEndpoint(CLUSTER);
  const connection = new Connection(endpoint, "confirmed");
  const payer = loadWalletKeypair();
  const mintKeypair = Keypair.generate();
  const baseUnits = SUPPLY * 10n ** BigInt(DECIMALS);

  console.log(`Creating "${NAME}" (${SYMBOL}) on ${CLUSTER} as Token-2022`);
  console.log(`Payer: ${payer.publicKey.toBase58()}`);
  console.log(`Mint:  ${mintKeypair.publicKey.toBase58()}`);
  console.log(`Transfer fee: ${TRANSFER_FEE_BPS} bps`);

  // Phase 1: create the mint account with the TransferFeeConfig extension.
  // Metaplex's create instruction (below) can't allocate extension space, so
  // the mint has to be created and initialized directly against Token-2022 first.
  const mintLen = getMintLen([ExtensionType.TransferFeeConfig]);
  const lamports = await connection.getMinimumBalanceForRentExemption(mintLen);

  const createMintTx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mintKeypair.publicKey,
      space: mintLen,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeTransferFeeConfigInstruction(
      mintKeypair.publicKey,
      payer.publicKey, // transferFeeConfigAuthority: can raise/lower the tax later
      payer.publicKey, // withdrawWithheldAuthority: can sweep withheld fees (for burn) later
      TRANSFER_FEE_BPS,
      TRANSFER_FEE_MAX_BASE_UNITS,
      TOKEN_2022_PROGRAM_ID
    ),
    createInitializeMintInstruction(
      mintKeypair.publicKey,
      DECIMALS,
      payer.publicKey, // mint authority
      payer.publicKey, // freeze authority
      TOKEN_2022_PROGRAM_ID
    )
  );
  const mintSig = await sendAndConfirmTransaction(connection, createMintTx, [
    payer,
    mintKeypair,
  ]);
  console.log(`Mint initialized. Tx: ${mintSig}`);

  // Phase 2: attach Metaplex name/symbol/logo metadata to the existing mint.
  const umi = createUmi(endpoint).use(mplToolbox());
  const walletKeypair = umi.eddsa.createKeypairFromSecretKey(
    loadWalletSecretBytes()
  );
  const umiPayer = createSignerFromKeypair(umi, walletKeypair);
  umi.use(keypairIdentity(umiPayer));

  // Metaplex's Create instruction requires the mint to co-sign even when the
  // account already exists (MintIsNotSigner otherwise) — we hold the keypair
  // in-process from phase 1, so just pass it through.
  const mintSigner = createSignerFromKeypair(
    umi,
    umi.eddsa.createKeypairFromSecretKey(mintKeypair.secretKey)
  );

  await createFungible(umi, {
    mint: mintSigner,
    name: NAME,
    symbol: SYMBOL,
    uri: URI,
    sellerFeeBasisPoints: percentAmount(0),
    decimals: DECIMALS,
    splTokenProgram: umiPublicKey(TOKEN_2022_PROGRAM_ID.toBase58()),
  }).sendAndConfirm(umi);
  console.log("Metadata attached");

  // Phase 3: mint the initial supply to the payer.
  const tokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mintKeypair.publicKey,
    payer.publicKey,
    false,
    "confirmed",
    undefined,
    TOKEN_2022_PROGRAM_ID
  );
  await mintTo(
    connection,
    payer,
    mintKeypair.publicKey,
    tokenAccount.address,
    payer,
    baseUnits,
    undefined,
    undefined,
    TOKEN_2022_PROGRAM_ID
  );

  console.log(`Minted ${SUPPLY} ${SYMBOL} to ${payer.publicKey}`);
  console.log(`Mint address: ${mintKeypair.publicKey.toBase58()}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
