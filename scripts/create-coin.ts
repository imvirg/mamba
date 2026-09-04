// Launches MAMBA as a Token-2022 mint (with on-chain Metaplex name/symbol/logo
// metadata) instead of legacy SPL Token. Token-2022 is required so the mint can
// later support a transfer fee (tax) and withheld-fee burn without a re-mint /
// holder migration. The fee starts at 0 bps — flip it on later via
// createSetTransferFeeInstruction once there's revenue to justify it.
//
// Authority story: mint authority is revoked once the initial supply exists
// (fixed supply forever), freeze authority is never set (no account can ever
// be frozen), and the tax/burn authorities go to AUTHORITY_MULTISIG instead
// of this hot wallet — see the "Still open" note in the mamba/ project memory.
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  ExtensionType,
  AuthorityType,
  getMintLen,
  createInitializeTransferFeeConfigInstruction,
  createInitializeMintInstruction,
  createSetAuthorityInstruction,
  getOrCreateAssociatedTokenAccount,
  getMint,
  getTransferFeeConfig,
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
  requireEnv,
  resolveClusterEndpoint,
} from "./lib/solana";
import {
  loadSquadsAuthorityConfig,
  validateSquadsAuthority,
} from "./lib/authority";
import {
  assertFinalMintState,
  assertPreMintState,
} from "./lib/mint-validation";
import { createLaunchState, updateLaunchState } from "./lib/launch-state-store";
import { createMintSigner, loadMintSigner } from "./lib/mint-signer";
import { MAMBA_MAINNET_AUTHORITY } from "../shared/mamba";

const CLUSTER = process.env.CLUSTER ?? "devnet"; // localhost | devnet | testnet | mainnet-beta
const LAUNCH_ID = process.env.LAUNCH_ID;
const LAUNCH_STATE = process.env.LAUNCH_STATE;
const MINT_SIGNER_PATH = process.env.MINT_SIGNER_PATH;
const ALLOWED_CLUSTERS = ["localhost", "devnet", "testnet", "mainnet-beta"];
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
  const cluster = requireEnv("CLUSTER");
  if (cluster !== CLUSTER) {
    throw new Error("CLUSTER must be set explicitly for create-coin");
  }
  if (!ALLOWED_CLUSTERS.includes(cluster)) {
    throw new Error(
      `Unsupported cluster: ${cluster}. Allowed: ${ALLOWED_CLUSTERS.join(", ")}`
    );
  }
  const launchId = requireEnv("LAUNCH_ID");
  const launchStatePath = requireEnv("LAUNCH_STATE");
  const mintSignerPath = requireEnv("MINT_SIGNER_PATH");
  if (
    !Number.isInteger(TRANSFER_FEE_BPS) ||
    TRANSFER_FEE_BPS < 0 ||
    TRANSFER_FEE_BPS > 10000
  ) {
    throw new Error("TRANSFER_FEE_BPS must be an integer between 0 and 10000");
  }

  const authorityMultisig = new PublicKey(requireEnv("AUTHORITY_MULTISIG"));
  if (
    CLUSTER === "mainnet-beta" &&
    !authorityMultisig.equals(new PublicKey(MAMBA_MAINNET_AUTHORITY))
  ) {
    throw new Error(
      `AUTHORITY_MULTISIG is not the approved mainnet governance authority: ${MAMBA_MAINNET_AUTHORITY}`
    );
  }
  const endpoint = resolveClusterEndpoint(CLUSTER);
  const connection = new Connection(endpoint, "confirmed");
  const payer = loadWalletKeypair();
  const authorityConfig = loadSquadsAuthorityConfig(authorityMultisig);
  if (CLUSTER === "mainnet-beta") {
    await validateSquadsAuthority(connection, authorityConfig);
  }
  const mintKeypair = Keypair.generate();
  const baseUnits = SUPPLY * 10n ** BigInt(DECIMALS);

  const preparedAt = new Date().toISOString();
  createLaunchState(launchStatePath, {
    schemaVersion: 1,
    launchId,
    phase: "prepared",
    cluster: cluster as "localhost" | "devnet" | "testnet" | "mainnet-beta",
    mintPublicKey: mintKeypair.publicKey.toBase58(),
    mintSignerKeyRef: mintSignerPath,
    payerPublicKey: payer.publicKey.toBase58(),
    authorityMultisig: authorityMultisig.toBase58(),
    expectedMultisig: authorityConfig.multisig.toBase58(),
    expectedThreshold: authorityConfig.threshold,
    expectedMembers: authorityConfig.members.map((member) => member.toBase58()),
    decimals: DECIMALS,
    supplyWholeTokens: SUPPLY.toString(),
    supplyBaseUnits: baseUnits.toString(),
    metadata: { name: NAME, symbol: SYMBOL, uri: URI },
    transactions: {
      mintInitialization: null,
      metadataAttachment: null,
      initialMint: null,
      authorityRevocation: null,
    },
    createdAt: preparedAt,
    updatedAt: preparedAt,
  });
  createMintSigner(mintSignerPath, mintKeypair);

  // Authority story (see mamba/ project memory): mint authority is revoked
  // after the initial mint (fixed supply forever), freeze authority is never
  // set, and the tax/burn authorities move to the explicitly configured
  // multisig instead of staying on this hot wallet.

  console.log(`Creating "${NAME}" (${SYMBOL}) on ${CLUSTER} as Token-2022`);
  console.log(`Payer: ${payer.publicKey.toBase58()}`);
  console.log(`Mint:  ${mintKeypair.publicKey.toBase58()}`);
  console.log(`Transfer fee: ${TRANSFER_FEE_BPS} bps`);
  console.log(`Fee/withdraw authority: ${authorityMultisig.toBase58()}`);

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
      authorityMultisig, // transferFeeConfigAuthority: can raise/lower the tax later
      authorityMultisig, // withdrawWithheldAuthority: can sweep withheld fees (for burn) later
      TRANSFER_FEE_BPS,
      TRANSFER_FEE_MAX_BASE_UNITS,
      TOKEN_2022_PROGRAM_ID
    ),
    createInitializeMintInstruction(
      mintKeypair.publicKey,
      DECIMALS,
      payer.publicKey, // mint authority — revoked below once the initial supply is minted
      null, // freeze authority: never set, so no account can ever be frozen
      TOKEN_2022_PROGRAM_ID
    )
  );
  const mintSubmittedAt = new Date().toISOString();
  const mintSig = await sendAndConfirmTransaction(connection, createMintTx, [
    payer,
    mintKeypair,
  ]);
  updateLaunchState(launchStatePath, (state) => ({
    ...state,
    phase: "mint_initialized",
    transactions: {
      ...state.transactions,
      mintInitialization: {
        signature: mintSig,
        submittedAt: mintSubmittedAt,
        outcome: "confirmed",
      },
    },
  }));
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
    umi.eddsa.createKeypairFromSecretKey(
      loadMintSigner(mintSignerPath, mintKeypair.publicKey).secretKey
    )
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
  const preMintAccount = await connection.getAccountInfo(
    mintKeypair.publicKey,
    "confirmed"
  );
  if (!preMintAccount) {
    throw new Error(
      `Mint account not found before initial mint: ${mintKeypair.publicKey.toBase58()}`
    );
  }
  const preMint = await getMint(
    connection,
    mintKeypair.publicKey,
    "confirmed",
    TOKEN_2022_PROGRAM_ID
  );
  assertPreMintState(
    {
      accountOwner: preMintAccount.owner,
      supply: preMint.supply,
      decimals: preMint.decimals,
      mintAuthority: preMint.mintAuthority,
      freezeAuthority: preMint.freezeAuthority,
      transferFeeConfig: getTransferFeeConfig(preMint),
    },
    {
      mintAuthority: payer.publicKey,
      authority: authorityMultisig,
      decimals: DECIMALS,
    }
  );
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

  // Phase 4: revoke mint authority now that the full supply exists — fixes
  // the supply forever, no re-mint possible from here on.
  const revokeMintAuthTx = new Transaction().add(
    createSetAuthorityInstruction(
      mintKeypair.publicKey,
      payer.publicKey,
      AuthorityType.MintTokens,
      null,
      [],
      TOKEN_2022_PROGRAM_ID
    )
  );
  const revokeSig = await sendAndConfirmTransaction(
    connection,
    revokeMintAuthTx,
    [payer]
  );
  const finalMintAccount = await connection.getAccountInfo(
    mintKeypair.publicKey,
    "confirmed"
  );
  if (!finalMintAccount) {
    throw new Error(
      `Mint account not found during final verification: ${mintKeypair.publicKey.toBase58()}`
    );
  }
  const finalMint = await getMint(
    connection,
    mintKeypair.publicKey,
    "confirmed",
    TOKEN_2022_PROGRAM_ID
  );
  assertFinalMintState(
    {
      accountOwner: finalMintAccount.owner,
      supply: finalMint.supply,
      decimals: finalMint.decimals,
      mintAuthority: finalMint.mintAuthority,
      freezeAuthority: finalMint.freezeAuthority,
      transferFeeConfig: getTransferFeeConfig(finalMint),
    },
    {
      authority: authorityMultisig,
      supply: baseUnits,
      decimals: DECIMALS,
    }
  );
  console.log(`Mint authority revoked. Tx: ${revokeSig}`);

  console.log(`Mint address: ${mintKeypair.publicKey.toBase58()}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
