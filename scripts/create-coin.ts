// Launches a new SPL token with on-chain (Metaplex) name/symbol/logo metadata.
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  createSignerFromKeypair,
  keypairIdentity,
  generateSigner,
  percentAmount,
} from "@metaplex-foundation/umi";
import {
  createFungible,
  mintV1,
  TokenStandard,
} from "@metaplex-foundation/mpl-token-metadata";
import { mplToolbox } from "@metaplex-foundation/mpl-toolbox";
import { loadWalletSecretBytes, resolveClusterEndpoint } from "./lib/solana";

const CLUSTER = process.env.CLUSTER ?? "devnet"; // localhost | devnet | testnet | mainnet-beta
const NAME = process.env.NAME ?? "MAMBA";
const SYMBOL = process.env.SYMBOL ?? "MAMBA";
// Hosted JSON metadata file (name/symbol/image) — see mamba/metadata.json
const URI =
  process.env.URI ??
  "https://raw.githubusercontent.com/imvirg/mamba/main/mamba/metadata.json";
const DECIMALS = Number(process.env.DECIMALS ?? 9);
const SUPPLY = BigInt(process.env.SUPPLY ?? "100000000"); // whole tokens, not base units

async function main() {
  const endpoint = resolveClusterEndpoint(CLUSTER);
  const umi = createUmi(endpoint).use(mplToolbox());

  const walletKeypair = umi.eddsa.createKeypairFromSecretKey(
    loadWalletSecretBytes()
  );
  const payer = createSignerFromKeypair(umi, walletKeypair);
  umi.use(keypairIdentity(payer));

  const mint = generateSigner(umi);
  const baseUnits = SUPPLY * 10n ** BigInt(DECIMALS);

  console.log(`Creating "${NAME}" (${SYMBOL}) on ${CLUSTER}`);
  console.log(`Payer: ${payer.publicKey}`);
  console.log(`Mint:  ${mint.publicKey}`);

  await createFungible(umi, {
    mint,
    name: NAME,
    symbol: SYMBOL,
    uri: URI,
    sellerFeeBasisPoints: percentAmount(0),
    decimals: DECIMALS,
  }).sendAndConfirm(umi);

  await mintV1(umi, {
    mint: mint.publicKey,
    authority: payer,
    amount: baseUnits,
    tokenOwner: payer.publicKey,
    tokenStandard: TokenStandard.Fungible,
  }).sendAndConfirm(umi);

  console.log(`Minted ${SUPPLY} ${SYMBOL} to ${payer.publicKey}`);
  console.log(`Mint address: ${mint.publicKey}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
