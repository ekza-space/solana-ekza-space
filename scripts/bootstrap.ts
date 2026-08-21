/**
 * Post-deploy bootstrap for solana-ekza-space.
 *
 * Runs `init_config` (upgrade-authority gated) and `create_collection` against
 * the cluster in ANCHOR_PROVIDER_URL using ANCHOR_WALLET. Idempotent: skips
 * steps that are already done. Writes deployments/<cluster>.json.
 *
 * Required env:
 *   ANCHOR_PROVIDER_URL   RPC url
 *   ANCHOR_WALLET         path to the upgrade-authority keypair
 *   SPACES_TOTAL          e.g. 256
 *   SPACES_PRICE_SOL      e.g. 0.5
 *   SPACES_TREASURY       pubkey receiving mint proceeds + royalties
 *   SPACES_BASE_URI       https://... or ipfs://... (must end with "/")
 * Optional:
 *   SPACES_ROYALTY_BPS    default 500
 *   SPACES_MAX_PER_WALLET default 2 (0 = unlimited)
 *   SPACES_CLUSTER_LABEL  name for deployments/<label>.json (default from url)
 */
import * as anchor from "@coral-xyz/anchor";
import { Program, web3, BN } from "@coral-xyz/anchor";
import * as fs from "fs";
import * as path from "path";
import { SolanaEkzaSpace } from "../target/types/solana_ekza_space";
import idl from "../target/idl/solana_ekza_space.json";
import { EkzaSpaceClient, findProgramDataPda } from "../sdk/ekzaSpaceClient";

const need = (k: string): string => {
  const v = process.env[k]?.trim();
  if (!v) throw new Error(`Missing env ${k}`);
  return v;
};

const labelFromUrl = (url: string) => {
  if (url.includes("devnet")) return "devnet";
  if (url.includes("testnet")) return "testnet";
  if (url.includes("mainnet")) return "mainnet";
  if (url.includes("127.0.0.1") || url.includes("localhost")) return "localnet";
  return "custom";
};

/** AnchorProvider.env() with a consistent `confirmed` commitment for reads and writes. */
function envProvider(): anchor.AnchorProvider {
  const url = process.env.ANCHOR_PROVIDER_URL?.trim();
  if (!url) throw new Error("Missing env ANCHOR_PROVIDER_URL");
  const conn = new web3.Connection(url, "confirmed");
  const wallet = anchor.Wallet.local();
  return new anchor.AnchorProvider(conn, wallet, { commitment: "confirmed", preflightCommitment: "confirmed" });
}

async function main() {
  const provider = envProvider();
  anchor.setProvider(provider);
  const program = new Program(idl as any, provider) as Program<SolanaEkzaSpace>;
  const sdk = new EkzaSpaceClient(provider, program);

  const url = need("ANCHOR_PROVIDER_URL");
  const label = process.env.SPACES_CLUSTER_LABEL?.trim() || labelFromUrl(url);
  const total = Number(need("SPACES_TOTAL"));
  const priceSol = Number(need("SPACES_PRICE_SOL"));
  const treasury = new web3.PublicKey(need("SPACES_TREASURY"));
  const baseUri = need("SPACES_BASE_URI");
  const royaltyBps = Number(process.env.SPACES_ROYALTY_BPS ?? "500");
  const maxPerWallet = Number(process.env.SPACES_MAX_PER_WALLET ?? "2");

  if (!baseUri.endsWith("/")) throw new Error("SPACES_BASE_URI must end with '/'");
  if (!(total > 0)) throw new Error("SPACES_TOTAL must be > 0");

  console.log(`cluster   ${label} (${url})`);
  console.log(`program   ${program.programId.toBase58()}`);
  console.log(`authority ${provider.wallet.publicKey.toBase58()}`);
  console.log(`config    ${sdk.configPda.toBase58()}`);

  // Does the program live under the upgradeable loader here?
  const programAcc = await provider.connection.getAccountInfo(program.programId);
  if (!programAcc) throw new Error("Program not deployed on this cluster");
  const upgradeable = programAcc.owner.equals(
    new web3.PublicKey("BPFLoaderUpgradeab1e11111111111111111111111")
  );
  const programData = upgradeable ? findProgramDataPda(program.programId) : null;

  let config = await program.account.config.fetchNullable(sdk.configPda);
  if (config) {
    console.log("config    already initialized — skipping init_config");
  } else {
    console.log(
      `init      total=${total} price=${priceSol} SOL royalty=${royaltyBps}bps maxPerWallet=${maxPerWallet}`
    );
    await sdk.initConfig(
      {
        totalSpaces: total,
        priceLamports: new BN(Math.round(priceSol * web3.LAMPORTS_PER_SOL)),
        treasury,
        royaltyBps,
        maxPerWallet,
        baseUri,
      },
      { programData }
    );
    config = await sdk.getConfig();
    console.log("init      ok");
  }

  if (!config.collectionMint.equals(web3.PublicKey.default)) {
    console.log(`collection already created: ${config.collectionMint.toBase58()}`);
  } else {
    const mint = await sdk.createCollection();
    console.log(`collection created: ${mint.toBase58()}`);
    config = await sdk.getConfig();
  }

  const out = {
    cluster: label,
    rpcUrl: url,
    programId: program.programId.toBase58(),
    configPda: sdk.configPda.toBase58(),
    collectionMint: config.collectionMint.toBase58(),
    authority: config.authority.toBase58(),
    treasury: config.treasury.toBase58(),
    totalSpaces: config.totalSpaces,
    priceLamports: config.priceLamports.toString(),
    royaltyBps: config.royaltyBps,
    maxPerWallet: config.maxPerWallet,
    baseUri: config.baseUri,
    bootstrappedAt: new Date().toISOString(),
  };
  const file = path.join(__dirname, "..", "deployments", `${label}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
  console.log(`wrote     ${path.relative(process.cwd(), file)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
