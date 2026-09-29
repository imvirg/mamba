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
import * as fs from "fs";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  ExtensionType,
  AuthorityType,
  getMintLen,
  createInitializeTransferFeeConfigInstruction,
  createInitializeMintInstruction,
  createSetAuthorityInstruction,
  createMintToInstruction,
  createAssociatedTokenAccountIdempotentInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  getMint,
  getTransferFeeConfig,
} from "@solana/spl-token";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  createSignerFromKeypair,
  keypairIdentity,
  none,
  percentAmount,
  publicKey as umiPublicKey,
  base58,
} from "@metaplex-foundation/umi";
import { createFungible } from "@metaplex-foundation/mpl-token-metadata";
import { mplToolbox } from "@metaplex-foundation/mpl-toolbox";
import {
  loadWalletKeypair,
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
import {
  createLaunchState,
  loadLaunchState,
  updateLaunchState,
  withLaunchStateLock,
} from "./lib/launch-state-store";
import { LaunchPhase } from "./lib/launch-state";
import { createMintSigner, loadMintSigner } from "./lib/mint-signer";
import {
  assertMetadataAuthority,
  findMetadataAddress,
  parseMetadataAuthority,
} from "./lib/metadata-authority";
import { parseLaunchConfig } from "./lib/launch-config";
import { MAMBA_MAINNET_AUTHORITY } from "../shared/mamba";

const LAUNCH_ID = process.env.LAUNCH_ID;
const LAUNCH_STATE = process.env.LAUNCH_STATE;
const MINT_SIGNER_PATH = process.env.MINT_SIGNER_PATH;
const NAME = process.env.NAME ?? "MAMBA";
const SYMBOL = process.env.SYMBOL ?? "MAMBA";
// Hosted JSON metadata file (name/symbol/image) — see mamba/metadata.json
const URI =
  process.env.URI ??
  "https://raw.githubusercontent.com/imvirg/mamba/main/mamba/metadata.json";
// Transfer fee (tax), in basis points. Starts inactive; raise later once MAMBA
// has real volume by calling createSetTransferFeeInstruction as the fee authority.

async function runLaunch() {
  const launchConfig = parseLaunchConfig(process.env, {
    requireExplicitValues: true,
  });
  const {
    cluster,
    decimals,
    supplyWholeTokens,
    supplyBaseUnits,
    transferFeeBps,
    transferFeeMaxBaseUnits,
    teamAllocationBps,
    teamBaseUnits,
    airdropBaseUnits,
  } = launchConfig;
  const launchId = requireEnv("LAUNCH_ID");
  const launchStatePath = requireEnv("LAUNCH_STATE");
  const mintSignerPath = requireEnv("MINT_SIGNER_PATH");
  const resumeRequested = process.env.RESUME_LAUNCH === "1";
  let existingState: ReturnType<typeof loadLaunchState> | undefined;
  if (fs.existsSync(launchStatePath)) {
    existingState = loadLaunchState(launchStatePath);
    if (!resumeRequested) {
      throw new Error(
        `Launch state already exists for ${existingState.launchId} at ${launchStatePath} ` +
          `(mint ${existingState.mintPublicKey}, phase ${existingState.phase}). ` +
          "Resume or reconcile this launch before starting another one."
      );
    }
  } else if (resumeRequested) {
    throw new Error(
      `Cannot resume launch because state does not exist at ${launchStatePath}`
    );
  }
  const authorityMultisig = new PublicKey(requireEnv("AUTHORITY_MULTISIG"));
  if (
    cluster === "mainnet-beta" &&
    !authorityMultisig.equals(new PublicKey(MAMBA_MAINNET_AUTHORITY))
  ) {
    throw new Error(
      `AUTHORITY_MULTISIG is not the approved mainnet governance authority: ${MAMBA_MAINNET_AUTHORITY}`
    );
  }
  const endpoint = resolveClusterEndpoint(cluster);
  const connection = new Connection(endpoint, "confirmed");
  const payer = loadWalletKeypair();
  const authorityConfig = loadSquadsAuthorityConfig(authorityMultisig);
  if (cluster !== "localhost") {
    await validateSquadsAuthority(connection, authorityConfig);
  }
  let mintKeypair: Keypair;
  let currentPhase: LaunchPhase;
  if (existingState) {
    const expectedMembers = authorityConfig.members
      .map((member) => member.toBase58())
      .sort();
    const expectedConfig = {
      cluster,
      authorityMultisig: authorityMultisig.toBase58(),
      expectedMultisig: authorityConfig.multisig.toBase58(),
      expectedThreshold: authorityConfig.threshold,
      expectedMembers,
      decimals,
      supplyWholeTokens: supplyWholeTokens.toString(),
      supplyBaseUnits: supplyBaseUnits.toString(),
      teamAllocationBps,
      metadata: { name: NAME, symbol: SYMBOL, uri: URI },
    };
    if (
      existingState.launchId !== launchId ||
      existingState.cluster !== expectedConfig.cluster ||
      existingState.authorityMultisig !== expectedConfig.authorityMultisig ||
      existingState.expectedMultisig !== expectedConfig.expectedMultisig ||
      existingState.expectedThreshold !== expectedConfig.expectedThreshold ||
      JSON.stringify([...existingState.expectedMembers].sort()) !==
        JSON.stringify(expectedConfig.expectedMembers) ||
      existingState.decimals !== expectedConfig.decimals ||
      existingState.supplyWholeTokens !== expectedConfig.supplyWholeTokens ||
      existingState.supplyBaseUnits !== expectedConfig.supplyBaseUnits ||
      existingState.teamAllocationBps !== expectedConfig.teamAllocationBps ||
      JSON.stringify(existingState.metadata) !==
        JSON.stringify(expectedConfig.metadata) ||
      existingState.mintSignerKeyRef !== mintSignerPath ||
      existingState.payerPublicKey !== payer.publicKey.toBase58()
    ) {
      throw new Error(
        "Resume configuration does not match the persisted launch identity"
      );
    }
    if (
      existingState.phase === "blocked" ||
      existingState.phase === "verified"
    ) {
      throw new Error(
        `Cannot resume launch from terminal phase ${existingState.phase}`
      );
    }
    const unresolvedTransaction = Object.values(
      existingState.transactions
    ).find((transaction) => transaction?.outcome === "unknown");
    if (unresolvedTransaction) {
      throw new Error(
        "Cannot resume while a transaction outcome is unknown; run reconcile-launch first"
      );
    }
    const rejectedTransaction = Object.values(existingState.transactions).find(
      (transaction) => transaction?.outcome === "rejected"
    );
    if (rejectedTransaction) {
      throw new Error(
        "Cannot resume after a rejected transaction; inspect the launch state before retrying"
      );
    }
    mintKeypair = loadMintSigner(
      mintSignerPath,
      new PublicKey(existingState.mintPublicKey)
    );
    currentPhase = existingState.phase;
  } else {
    mintKeypair = Keypair.generate();
    currentPhase = "prepared";
  }
  const baseUnits = supplyBaseUnits;

  if (!existingState) {
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
      expectedMembers: authorityConfig.members.map((member) =>
        member.toBase58()
      ),
      decimals,
      supplyWholeTokens: supplyWholeTokens.toString(),
      supplyBaseUnits: baseUnits.toString(),
      teamAllocationBps,
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
  }

  // Authority story (see mamba/ project memory): mint authority is revoked
  // after the initial mint (fixed supply forever), freeze authority is never
  // set, and the tax/burn authorities move to the explicitly configured
  // multisig instead of staying on this hot wallet.

  console.log(`Creating "${NAME}" (${SYMBOL}) on ${cluster} as Token-2022`);
  console.log(`Payer: ${payer.publicKey.toBase58()}`);
  console.log(`Mint:  ${mintKeypair.publicKey.toBase58()}`);
  console.log(`Transfer fee: ${transferFeeBps} bps`);
  console.log(`Fee/withdraw authority: ${authorityMultisig.toBase58()}`);
  console.log(
    `Supply split: ${
      teamAllocationBps / 100
    }% to the governance vault, the rest to the payer for the airdrop`
  );

  // Phase 1: create the mint account with the TransferFeeConfig extension.
  // Metaplex's create instruction (below) can't allocate extension space, so
  // the mint has to be created and initialized directly against Token-2022 first.
  if (currentPhase === "prepared") {
    const mintLen = getMintLen([ExtensionType.TransferFeeConfig]);
    const lamports = await connection.getMinimumBalanceForRentExemption(
      mintLen
    );

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
        transferFeeBps,
        transferFeeMaxBaseUnits,
        TOKEN_2022_PROGRAM_ID
      ),
      createInitializeMintInstruction(
        mintKeypair.publicKey,
        decimals,
        payer.publicKey, // mint authority — revoked below once the initial supply is minted
        null, // freeze authority: never set, so no account can ever be frozen
        TOKEN_2022_PROGRAM_ID
      )
    );
    const mintSubmittedAt = new Date().toISOString();
    const mintSig = await connection.sendTransaction(createMintTx, [
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
          outcome: "unknown",
        },
      },
    }));

    let mintConfirmation;
    try {
      mintConfirmation = await connection.confirmTransaction(
        mintSig,
        "finalized"
      );
    } catch (error) {
      throw new Error(
        `Mint initialization confirmation is unresolved for ${mintSig}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
    if (mintConfirmation.value.err) {
      updateLaunchState(launchStatePath, (state) => ({
        ...state,
        transactions: {
          ...state.transactions,
          mintInitialization: {
            signature: mintSig,
            submittedAt: mintSubmittedAt,
            outcome: "rejected",
          },
        },
      }));
      throw new Error(
        `Mint initialization transaction was rejected: ${mintSig}`
      );
    }
    updateLaunchState(launchStatePath, (state) => ({
      ...state,
      transactions: {
        ...state.transactions,
        mintInitialization: {
          signature: mintSig,
          submittedAt: mintSubmittedAt,
          outcome: "confirmed",
        },
      },
    }));
    currentPhase = "mint_initialized";
    console.log(`Mint initialized. Tx: ${mintSig}`);
  }

  // Phase 2: attach Metaplex name/symbol/logo metadata to the existing mint.
  if (currentPhase === "mint_initialized") {
    const umi = createUmi(endpoint).use(mplToolbox());
    const walletKeypair = umi.eddsa.createKeypairFromSecretKey(payer.secretKey);
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

    const metadataBuilder = createFungible(umi, {
      mint: mintSigner,
      name: NAME,
      symbol: SYMBOL,
      uri: URI,
      sellerFeeBasisPoints: percentAmount(0),
      decimals,
      splTokenProgram: umiPublicKey(TOKEN_2022_PROGRAM_ID.toBase58()),
      // Governance, not the payer, may rewrite name/symbol/URI (Metaplex
      // otherwise defaults the update authority to the payer).
      updateAuthority: umiPublicKey(authorityMultisig.toBase58()),
      // Metaplex otherwise lists the payer as a verified creator, which the
      // program rejects once the payer isn't the update authority; creators
      // carry no rights on a fungible token anyway.
      creators: none(),
    });
    const metadataSubmittedAt = new Date().toISOString();
    const metadataSignature = await metadataBuilder.send(umi);
    const metadataStateSignature = base58.deserialize(metadataSignature)[0];
    updateLaunchState(launchStatePath, (state) => ({
      ...state,
      phase: "metadata_attached",
      transactions: {
        ...state.transactions,
        metadataAttachment: {
          signature: metadataStateSignature,
          submittedAt: metadataSubmittedAt,
          outcome: "unknown",
        },
      },
    }));
    let metadataConfirmation;
    try {
      metadataConfirmation = await metadataBuilder.confirm(
        umi,
        metadataSignature,
        { commitment: "finalized" }
      );
    } catch (error) {
      throw new Error(
        `Metadata confirmation is unresolved for ${metadataStateSignature}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
    if (metadataConfirmation.value.err) {
      updateLaunchState(launchStatePath, (state) => ({
        ...state,
        transactions: {
          ...state.transactions,
          metadataAttachment: {
            signature: metadataStateSignature,
            submittedAt: metadataSubmittedAt,
            outcome: "rejected",
          },
        },
      }));
      throw new Error(
        `Metadata transaction was rejected: ${metadataStateSignature}`
      );
    }
    updateLaunchState(launchStatePath, (state) => ({
      ...state,
      transactions: {
        ...state.transactions,
        metadataAttachment: {
          signature: metadataStateSignature,
          submittedAt: metadataSubmittedAt,
          outcome: "confirmed",
        },
      },
    }));
    currentPhase = "metadata_attached";
    console.log("Metadata attached");
  }

  // Phase 3: mint the initial supply to the payer.
  if (currentPhase === "metadata_attached") {
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
        decimals,
      }
    );
    // One transaction creates both token accounts and mints both shares, so
    // the split lands together or not at all. The team share goes straight
    // to the governance vault (a PDA, hence allowOwnerOffCurve) instead of
    // sitting on this hot wallet.
    const payerTokenAccount = getAssociatedTokenAddressSync(
      mintKeypair.publicKey,
      payer.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    const vaultTokenAccount = getAssociatedTokenAddressSync(
      mintKeypair.publicKey,
      authorityMultisig,
      true,
      TOKEN_2022_PROGRAM_ID
    );
    const mintToTx = new Transaction();
    if (airdropBaseUnits > 0n) {
      mintToTx.add(
        createAssociatedTokenAccountIdempotentInstruction(
          payer.publicKey,
          payerTokenAccount,
          payer.publicKey,
          mintKeypair.publicKey,
          TOKEN_2022_PROGRAM_ID
        ),
        createMintToInstruction(
          mintKeypair.publicKey,
          payerTokenAccount,
          payer.publicKey,
          airdropBaseUnits,
          [],
          TOKEN_2022_PROGRAM_ID
        )
      );
    }
    if (teamBaseUnits > 0n) {
      mintToTx.add(
        createAssociatedTokenAccountIdempotentInstruction(
          payer.publicKey,
          vaultTokenAccount,
          authorityMultisig,
          mintKeypair.publicKey,
          TOKEN_2022_PROGRAM_ID
        ),
        createMintToInstruction(
          mintKeypair.publicKey,
          vaultTokenAccount,
          payer.publicKey,
          teamBaseUnits,
          [],
          TOKEN_2022_PROGRAM_ID
        )
      );
    }
    const mintToSubmittedAt = new Date().toISOString();
    const mintToSig = await connection.sendTransaction(mintToTx, [payer]);
    updateLaunchState(launchStatePath, (state) => ({
      ...state,
      phase: "supply_minted",
      transactions: {
        ...state.transactions,
        initialMint: {
          signature: mintToSig,
          submittedAt: mintToSubmittedAt,
          outcome: "unknown",
        },
      },
    }));

    let mintToConfirmation;
    try {
      mintToConfirmation = await connection.confirmTransaction(
        mintToSig,
        "finalized"
      );
    } catch (error) {
      throw new Error(
        `Initial mint confirmation is unresolved for ${mintToSig}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
    if (mintToConfirmation.value.err) {
      updateLaunchState(launchStatePath, (state) => ({
        ...state,
        transactions: {
          ...state.transactions,
          initialMint: {
            signature: mintToSig,
            submittedAt: mintToSubmittedAt,
            outcome: "rejected",
          },
        },
      }));
      throw new Error(`Initial mint transaction was rejected: ${mintToSig}`);
    }
    updateLaunchState(launchStatePath, (state) => ({
      ...state,
      transactions: {
        ...state.transactions,
        initialMint: {
          signature: mintToSig,
          submittedAt: mintToSubmittedAt,
          outcome: "confirmed",
        },
      },
    }));

    currentPhase = "supply_minted";
    console.log(
      `Minted ${supplyWholeTokens} ${SYMBOL}: ${
        teamAllocationBps / 100
      }% to vault ${authorityMultisig.toBase58()}, the rest to ${
        payer.publicKey
      }`
    );
  }

  // Phase 4: revoke mint authority now that the full supply exists — fixes
  // the supply forever, no re-mint possible from here on.
  if (
    currentPhase === "supply_minted" ||
    currentPhase === "authority_revoked"
  ) {
    let revokedSignature: string | undefined;
    if (currentPhase === "supply_minted") {
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
      const revokeSubmittedAt = new Date().toISOString();
      const revokeSig = await connection.sendTransaction(revokeMintAuthTx, [
        payer,
      ]);
      revokedSignature = revokeSig;
      updateLaunchState(launchStatePath, (state) => ({
        ...state,
        phase: "authority_revoked",
        transactions: {
          ...state.transactions,
          authorityRevocation: {
            signature: revokeSig,
            submittedAt: revokeSubmittedAt,
            outcome: "unknown",
          },
        },
      }));

      let revokeConfirmation;
      try {
        revokeConfirmation = await connection.confirmTransaction(
          revokeSig,
          "finalized"
        );
      } catch (error) {
        throw new Error(
          `Authority revocation confirmation is unresolved for ${revokeSig}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
      if (revokeConfirmation.value.err) {
        updateLaunchState(launchStatePath, (state) => ({
          ...state,
          transactions: {
            ...state.transactions,
            authorityRevocation: {
              signature: revokeSig,
              submittedAt: revokeSubmittedAt,
              outcome: "rejected",
            },
          },
        }));
        throw new Error(
          `Authority revocation transaction was rejected: ${revokeSig}`
        );
      }
      updateLaunchState(launchStatePath, (state) => ({
        ...state,
        transactions: {
          ...state.transactions,
          authorityRevocation: {
            signature: revokeSig,
            submittedAt: revokeSubmittedAt,
            outcome: "confirmed",
          },
        },
      }));
    }

    const finalMintAccount = await connection.getAccountInfo(
      mintKeypair.publicKey,
      "finalized"
    );
    if (!finalMintAccount) {
      throw new Error(
        `Mint account not found during final verification: ${mintKeypair.publicKey.toBase58()}`
      );
    }
    const finalMint = await getMint(
      connection,
      mintKeypair.publicKey,
      "finalized",
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
        decimals,
      }
    );
    if (teamBaseUnits > 0n) {
      const vaultAccount = await getAccount(
        connection,
        getAssociatedTokenAddressSync(
          mintKeypair.publicKey,
          authorityMultisig,
          true,
          TOKEN_2022_PROGRAM_ID
        ),
        "finalized",
        TOKEN_2022_PROGRAM_ID
      );
      if (
        !vaultAccount.owner.equals(authorityMultisig) ||
        vaultAccount.amount !== teamBaseUnits
      ) {
        throw new Error(
          `Governance vault must hold the team share of ${teamBaseUnits} base units, found ${vaultAccount.amount}`
        );
      }
    }
    const metadataAddress = findMetadataAddress(mintKeypair.publicKey);
    const metadataAccount = await connection.getAccountInfo(
      metadataAddress,
      "finalized"
    );
    if (!metadataAccount) {
      throw new Error(
        `Metadata account not found during final verification: ${metadataAddress.toBase58()}`
      );
    }
    assertMetadataAuthority(
      parseMetadataAuthority(metadataAccount.owner, metadataAccount.data),
      { mint: mintKeypair.publicKey, authority: authorityMultisig }
    );
    updateLaunchState(launchStatePath, (state) => ({
      ...state,
      phase: "verified",
    }));
    currentPhase = "authority_revoked";
    if (revokedSignature) {
      console.log(`Mint authority revoked. Tx: ${revokedSignature}`);
    } else {
      console.log("Mint authority revocation verified after resume.");
    }
  }

  console.log(`Mint address: ${mintKeypair.publicKey.toBase58()}`);
}

async function main() {
  const launchStatePath = process.env.LAUNCH_STATE;
  if (!launchStatePath) {
    await runLaunch();
    return;
  }
  await withLaunchStateLock(launchStatePath, runLaunch);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
