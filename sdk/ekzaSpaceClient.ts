import * as anchor from "@coral-xyz/anchor";
import { Program, web3, BN } from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { SolanaEkzaSpace } from "../target/types/solana_ekza_space";

export const CONFIG_SEED = "config";
export const SPACE_SEED = "space";
export const METADATA_PROGRAM_ID = new web3.PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);

type ProviderLike = {
  wallet: {
    publicKey: web3.PublicKey;
  };
};

export class EkzaSpaceClient {
  readonly provider: ProviderLike;
  readonly program: Program<SolanaEkzaSpace>;
  readonly configPda: web3.PublicKey;

  constructor(provider: ProviderLike, program: Program<SolanaEkzaSpace>) {
    this.provider = provider;
    this.program = program;

    [this.configPda] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from(CONFIG_SEED)],
      this.program.programId
    );
  }

  getSpacePda(spaceId: number): web3.PublicKey {
    const spaceIdBuf = Buffer.alloc(4);
    spaceIdBuf.writeUInt32LE(spaceId);

    const [spacePda] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from(SPACE_SEED), this.configPda.toBuffer(), spaceIdBuf],
      this.program.programId
    );

    return spacePda;
  }

  async getConfig(): Promise<any> {
    return this.program.account.config.fetch(this.configPda);
  }

  async getSpaceById(spaceId: number): Promise<any> {
    const spacePda = this.getSpacePda(spaceId);
    return this.getSpace(spacePda);
  }

  async getSpace(spacePda: web3.PublicKey): Promise<any> {
    return this.program.account.space.fetch(spacePda);
  }

  async initConfig(args: {
    totalSpaces: number;
    priceLamports: BN;
    treasury?: web3.PublicKey;
    collectionMint?: web3.PublicKey | null;
  }): Promise<void> {
    const { totalSpaces, priceLamports } = args;
    const treasury = args.treasury ?? this.provider.wallet.publicKey;
    const collectionMint = args.collectionMint ?? null;

    await this.program.methods
      .initConfig({
        totalSpaces,
        priceLamports,
        treasury,
        collectionMint,
      })
      .accountsStrict({
        config: this.configPda,
        payer: this.provider.wallet.publicKey,
        systemProgram: web3.SystemProgram.programId,
      })
      .rpc();
  }

  async updateConfig(args: {
    newPriceLamports?: BN | null;
    newTreasury?: web3.PublicKey | null;
  }): Promise<void> {
    await this.program.methods
      .updateConfig({
        newPriceLamports: args.newPriceLamports ?? null,
        newTreasury: args.newTreasury ?? null,
      })
      // @ts-ignore anchor typegen has a slightly narrower type here
      .accountsStrict({
        config: this.configPda,
        authority: this.provider.wallet.publicKey,
      })
      .rpc();
  }

  async mintNextSpace(
    spaceId: number,
    uri?: string | null,
    opts?: {
      treasury?: web3.PublicKey;
    }
  ): Promise<{ spacePda: web3.PublicKey; mint: web3.PublicKey }> {
    const spacePda = this.getSpacePda(spaceId);

    const mintKp = web3.Keypair.generate();
    const mint = mintKp.publicKey;

    const payer = this.provider.wallet.publicKey;
    const payerTokenAccount = getAssociatedTokenAddressSync(mint, payer);

    const [metadataPda] = web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("metadata"),
        METADATA_PROGRAM_ID.toBuffer(),
        mint.toBuffer(),
      ],
      METADATA_PROGRAM_ID
    );

    const treasury = opts?.treasury ?? payer;

    let ix = this.program.methods.mintNextSpace(spaceId, uri ?? null).accountsStrict({
      config: this.configPda,
      spacePda,
      mint,
      payerTokenAccount,
      payer,
      treasury,
      systemProgram: web3.SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      rent: web3.SYSVAR_RENT_PUBKEY,
      metadataAccount: metadataPda,
      tokenMetadataProgram: METADATA_PROGRAM_ID,
    });

    ix = ix.signers([mintKp]);

    await ix.rpc();

    return { spacePda, mint };
  }

  async updateSpaceSettings(
    spaceId: number,
    args: {
      name: string | null;
      spaceConfigUri: string | null;
      isOpen: boolean | null;
      isEditableByOthers: boolean | null;
    },
    authorityKp?: web3.Keypair
  ): Promise<void> {
    const spacePda = this.getSpacePda(spaceId);
    const authority = authorityKp?.publicKey ?? this.provider.wallet.publicKey;

    const spaceAccount = await this.program.account.space.fetch(spacePda);
    const nftTokenAccount = getAssociatedTokenAddressSync(
      spaceAccount.mint,
      authority
    );

    let ix = this.program.methods
      .updateSpaceSettings({
        name: args.name,
        spaceConfigUri: args.spaceConfigUri,
        isOpen: args.isOpen,
        isEditableByOthers: args.isEditableByOthers,
      })
      .accounts({
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

