import * as anchor from "@coral-xyz/anchor";
import { Program, web3, BN } from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { SolanaEkzaSpace } from "../target/types/solana_ekza_space";

export const CONFIG_SEED = "config";
export const SPACE_SEED = "space_v1";
export const COLLECTION_SEED = "collection_v1";
export const MINTER_SEED = "minter_v1";
export const METADATA_PROGRAM_ID = new web3.PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);
export const BPF_LOADER_UPGRADEABLE_ID = new web3.PublicKey(
  "BPFLoaderUpgradeab1e11111111111111111111111"
);

/** Compute units requested for `mint_space` (4 Metaplex CPIs + token inits). */
export const MINT_SPACE_COMPUTE_UNITS = 400_000;

type ProviderLike = {
  wallet: {
    publicKey: web3.PublicKey;
  };
};

export type InitConfigParams = {
  totalSpaces: number;
  priceLamports: BN;
  treasury?: web3.PublicKey;
  royaltyBps: number;
  maxPerWallet: number;
  baseUri: string;
};

export type UpdateConfigParams = {
  newPriceLamports?: BN | null;
  newTreasury?: web3.PublicKey | null;
  paused?: boolean | null;
  maxPerWallet?: number | null;
  baseUri?: string | null;
};

export type UpdateSpaceSettingsParams = {
  name?: string | null;
  spaceConfigUri?: string | null;
  isOpen?: boolean | null;
  addEditor?: web3.PublicKey | null;
  removeEditor?: web3.PublicKey | null;
};

export function findMetadataPda(mint: web3.PublicKey): web3.PublicKey {
  return web3.PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    METADATA_PROGRAM_ID
  )[0];
}

export function findMasterEditionPda(mint: web3.PublicKey): web3.PublicKey {
  return web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata"),
      METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
      Buffer.from("edition"),
    ],
    METADATA_PROGRAM_ID
  )[0];
}

export function findProgramDataPda(programId: web3.PublicKey): web3.PublicKey {
  return web3.PublicKey.findProgramAddressSync(
    [programId.toBuffer()],
    BPF_LOADER_UPGRADEABLE_ID
  )[0];
}

export class EkzaSpaceClient {
  readonly provider: ProviderLike;
  readonly program: Program<SolanaEkzaSpace>;
  readonly configPda: web3.PublicKey;
  readonly collectionMintPda: web3.PublicKey;

  constructor(provider: ProviderLike, program: Program<SolanaEkzaSpace>) {
    this.provider = provider;
    this.program = program;

    [this.configPda] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from(CONFIG_SEED)],
      this.program.programId
    );
    [this.collectionMintPda] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from(COLLECTION_SEED), this.configPda.toBuffer()],
      this.program.programId
    );
  }

  // ---------------------------------------------------------------- PDAs

  getSpacePda(spaceId: number): web3.PublicKey {
    const spaceIdBuf = Buffer.alloc(4);
    spaceIdBuf.writeUInt32LE(spaceId);

    const [spacePda] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from(SPACE_SEED), this.configPda.toBuffer(), spaceIdBuf],
      this.program.programId
    );

    return spacePda;
  }

  getMinterRecordPda(wallet: web3.PublicKey): web3.PublicKey {
    const [pda] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from(MINTER_SEED), this.configPda.toBuffer(), wallet.toBuffer()],
      this.program.programId
    );
    return pda;
  }

  // ------------------------------------------------------------- readers

  async getConfig(): Promise<any> {
    return this.program.account.config.fetch(this.configPda);
  }

  async getSpaceById(spaceId: number): Promise<any> {
    return this.getSpace(this.getSpacePda(spaceId));
  }

  async getSpace(spacePda: web3.PublicKey): Promise<any> {
    return this.program.account.space.fetch(spacePda);
  }

  async getMinterRecord(wallet: web3.PublicKey): Promise<any | null> {
    return this.program.account.minterRecord.fetchNullable(
      this.getMinterRecordPda(wallet)
    );
  }

  // --------------------------------------------------------------- admin

  /**
   * Initialize config. Signer must be the program upgrade authority.
   * Pass `programData: null` only for non-upgradeable deployments (e.g. LiteSVM).
   */
  async initConfig(
    args: InitConfigParams,
    opts?: { programData?: web3.PublicKey | null }
  ): Promise<void> {
    const treasury = args.treasury ?? this.provider.wallet.publicKey;
    const programData =
      opts?.programData === undefined
        ? findProgramDataPda(this.program.programId)
        : opts.programData;

    await this.program.methods
      .initConfig({
        totalSpaces: args.totalSpaces,
        priceLamports: args.priceLamports,
        treasury,
        royaltyBps: args.royaltyBps,
        maxPerWallet: args.maxPerWallet,
        baseUri: args.baseUri,
      })
      .accountsStrict({
        config: this.configPda,
        payer: this.provider.wallet.publicKey,
        program: this.program.programId,
        programData,
        systemProgram: web3.SystemProgram.programId,
      })
      .rpc();
  }

  async updateConfig(
    args: UpdateConfigParams,
    authorityKp?: web3.Keypair
  ): Promise<void> {
    const authority = authorityKp?.publicKey ?? this.provider.wallet.publicKey;
    let ix = this.program.methods
      .updateConfig({
        newPriceLamports: args.newPriceLamports ?? null,
        newTreasury: args.newTreasury ?? null,
        paused: args.paused ?? null,
        maxPerWallet: args.maxPerWallet ?? null,
        baseUri: args.baseUri ?? null,
      })
      .accountsStrict({
        config: this.configPda,
        authority,
      });
    if (authorityKp) ix = ix.signers([authorityKp]);
    await ix.rpc();
  }

  async proposeAuthority(
    newAuthority: web3.PublicKey,
    authorityKp?: web3.Keypair
  ): Promise<void> {
    const authority = authorityKp?.publicKey ?? this.provider.wallet.publicKey;
    let ix = this.program.methods
      .proposeAuthority(newAuthority)
      .accountsStrict({ config: this.configPda, authority });
    if (authorityKp) ix = ix.signers([authorityKp]);
    await ix.rpc();
  }

  async acceptAuthority(newAuthorityKp?: web3.Keypair): Promise<void> {
    const newAuthority =
      newAuthorityKp?.publicKey ?? this.provider.wallet.publicKey;
    let ix = this.program.methods
      .acceptAuthority()
      .accountsStrict({ config: this.configPda, newAuthority });
    if (newAuthorityKp) ix = ix.signers([newAuthorityKp]);
    await ix.rpc();
  }

  /** Create the verified collection NFT. Authority only; run once before mints. */
  async createCollection(authorityKp?: web3.Keypair): Promise<web3.PublicKey> {
    const authority = authorityKp?.publicKey ?? this.provider.wallet.publicKey;
    const collectionMint = this.collectionMintPda;

    let ix = this.program.methods
      .createCollection()
      .accountsStrict({
        config: this.configPda,
        authority,
        collectionMint,
        collectionTokenAccount: getAssociatedTokenAddressSync(
          collectionMint,
          authority
        ),
        collectionMetadata: findMetadataPda(collectionMint),
        collectionMasterEdition: findMasterEditionPda(collectionMint),
        systemProgram: web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        tokenMetadataProgram: METADATA_PROGRAM_ID,
        rent: web3.SYSVAR_RENT_PUBKEY,
      })
      .preInstructions([
        web3.ComputeBudgetProgram.setComputeUnitLimit({
          units: MINT_SPACE_COMPUTE_UNITS,
        }),
      ]);
    if (authorityKp) ix = ix.signers([authorityKp]);
    await ix.rpc();
    return collectionMint;
  }

  async refreshSpaceMetadata(
    spaceId: number,
    authorityKp?: web3.Keypair
  ): Promise<void> {
    const authority = authorityKp?.publicKey ?? this.provider.wallet.publicKey;
    const spacePda = this.getSpacePda(spaceId);
    const space = await this.getSpace(spacePda);

    let ix = this.program.methods.refreshSpaceMetadata().accountsStrict({
      config: this.configPda,
      authority,
      space: spacePda,
      mint: space.mint,
      metadataAccount: findMetadataPda(space.mint),
      tokenMetadataProgram: METADATA_PROGRAM_ID,
    });
    if (authorityKp) ix = ix.signers([authorityKp]);
    await ix.rpc();
  }

  // ---------------------------------------------------------------- mint

  /** Build the unsigned mint transaction (for wallets that sign client-side). */
  async buildMintSpaceTx(
    spaceId: number,
    payer: web3.PublicKey
  ): Promise<{ tx: web3.Transaction; mintKp: web3.Keypair; spacePda: web3.PublicKey }> {
    const config = await this.getConfig();
    const spacePda = this.getSpacePda(spaceId);
    const mintKp = web3.Keypair.generate();
    const mint = mintKp.publicKey;
    const collectionMint: web3.PublicKey = config.collectionMint;

    const tx = await this.program.methods
      .mintSpace(spaceId)
      .accountsStrict({
        config: this.configPda,
        spacePda,
        minterRecord: this.getMinterRecordPda(payer),
        mint,
        payerTokenAccount: getAssociatedTokenAddressSync(mint, payer),
        payer,
        treasury: config.treasury,
        metadataAccount: findMetadataPda(mint),
        masterEdition: findMasterEditionPda(mint),
        collectionMint,
        collectionMetadata: findMetadataPda(collectionMint),
        collectionMasterEdition: findMasterEditionPda(collectionMint),
        systemProgram: web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        tokenMetadataProgram: METADATA_PROGRAM_ID,
        rent: web3.SYSVAR_RENT_PUBKEY,
      })
      .preInstructions([
        web3.ComputeBudgetProgram.setComputeUnitLimit({
          units: MINT_SPACE_COMPUTE_UNITS,
        }),
      ])
      .transaction();

    return { tx, mintKp, spacePda };
  }

  async mintSpace(
    spaceId: number,
    payerKp?: web3.Keypair
  ): Promise<{ spacePda: web3.PublicKey; mint: web3.PublicKey }> {
    const payer = payerKp?.publicKey ?? this.provider.wallet.publicKey;
    const config = await this.getConfig();
    const spacePda = this.getSpacePda(spaceId);
    const mintKp = web3.Keypair.generate();
    const mint = mintKp.publicKey;
    const collectionMint: web3.PublicKey = config.collectionMint;

    let ix = this.program.methods
      .mintSpace(spaceId)
      .accountsStrict({
        config: this.configPda,
        spacePda,
        minterRecord: this.getMinterRecordPda(payer),
        mint,
        payerTokenAccount: getAssociatedTokenAddressSync(mint, payer),
        payer,
        treasury: config.treasury,
        metadataAccount: findMetadataPda(mint),
        masterEdition: findMasterEditionPda(mint),
        collectionMint,
        collectionMetadata: findMetadataPda(collectionMint),
        collectionMasterEdition: findMasterEditionPda(collectionMint),
        systemProgram: web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        tokenMetadataProgram: METADATA_PROGRAM_ID,
        rent: web3.SYSVAR_RENT_PUBKEY,
      })
      .preInstructions([
        web3.ComputeBudgetProgram.setComputeUnitLimit({
          units: MINT_SPACE_COMPUTE_UNITS,
        }),
      ]);

    ix = ix.signers(payerKp ? [mintKp, payerKp] : [mintKp]);
    await ix.rpc();

    return { spacePda, mint };
  }

  // ------------------------------------------------------------ settings

  async updateSpaceSettings(
    spaceId: number,
    args: UpdateSpaceSettingsParams,
    authorityKp?: web3.Keypair,
    opts?: {
      nftTokenAccount?: web3.PublicKey;
    }
  ): Promise<void> {
    const spacePda = this.getSpacePda(spaceId);
    const authority = authorityKp?.publicKey ?? this.provider.wallet.publicKey;

    const spaceAccount = await this.program.account.space.fetch(spacePda);
    const tokenAccountOwner = authority.equals(spaceAccount.owner)
      ? authority
      : spaceAccount.owner;
    const nftTokenAccount =
      opts?.nftTokenAccount ??
      getAssociatedTokenAddressSync(spaceAccount.mint, tokenAccountOwner);

    let ix = this.program.methods
      .updateSpaceSettings({
        name: args.name ?? null,
        spaceConfigUri: args.spaceConfigUri ?? null,
        isOpen: args.isOpen ?? null,
        addEditor: args.addEditor ?? null,
        removeEditor: args.removeEditor ?? null,
      })
      .accountsStrict({
        config: this.configPda,
        space: spacePda,
        authority,
        nftTokenAccount,
      });

    if (authorityKp) {
      ix = ix.signers([authorityKp]);
    }

    await ix.rpc();
  }
}
