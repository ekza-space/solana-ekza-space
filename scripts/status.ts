/** Print on-chain config + minted ids for the cluster in ANCHOR_PROVIDER_URL. */
import * as anchor from "@coral-xyz/anchor";
import { Program, web3 } from "@coral-xyz/anchor";
import { SolanaEkzaSpace } from "../target/types/solana_ekza_space";
import idl from "../target/idl/solana_ekza_space.json";
import { EkzaSpaceClient } from "../sdk/ekzaSpaceClient";

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

  const config = await program.account.config.fetchNullable(sdk.configPda);
  if (!config) {
    console.log("config not initialized");
    return;
  }
  console.log({
    authority: config.authority.toBase58(),
    pendingAuthority: config.pendingAuthority.toBase58(),
    treasury: config.treasury.toBase58(),
    collectionMint: config.collectionMint.toBase58(),
    totalSpaces: config.totalSpaces,
    mintedSpaces: config.mintedSpaces,
    priceSol: Number(config.priceLamports.toString()) / web3.LAMPORTS_PER_SOL,
    royaltyBps: config.royaltyBps,
    maxPerWallet: config.maxPerWallet,
    paused: config.paused,
    baseUri: config.baseUri,
  });

  const spaces = await program.account.space.all();
  spaces.sort((a, b) => a.account.spaceId - b.account.spaceId);
  for (const s of spaces) {
    console.log(
      `#${s.account.spaceId}\t${s.account.owner.toBase58()}\t${s.account.mint.toBase58()}\t${s.account.name || "-"}`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
