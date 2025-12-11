import { fromWorkspace, LiteSVMProvider } from "anchor-litesvm";
import * as anchor from "@coral-xyz/anchor";
import { Program, web3, AnchorError } from "@coral-xyz/anchor";
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { expect } from "chai";
import { SolanaEkzaSpace } from "../target/types/solana_ekza_space";

describe("ekza-space litesvm", () => {
  let client: any;
  let provider: LiteSVMProvider;
  let program: Program<SolanaEkzaSpace>;

  const CONFIG_SEED = "config";
  const SPACE_SEED = "space";
  const METADATA_PROGRAM_ID = new web3.PublicKey(
    "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
  );

  let configPda: web3.PublicKey;

  before(async () => {
    client = fromWorkspace("./");
    provider = new LiteSVMProvider(client);
    anchor.setProvider(provider);
    program = anchor.workspace.SolanaEkzaSpace as Program<SolanaEkzaSpace>;

    // fund wallet for tests
    client.airdrop(
      provider.wallet.publicKey,
      BigInt(100 * web3.LAMPORTS_PER_SOL)
    );

    [configPda] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from(CONFIG_SEED)],
      program.programId
    );

    const totalSpaces = 3;
    const priceLamports = new anchor.BN(web3.LAMPORTS_PER_SOL);

    await program.methods
      .initConfig({
        totalSpaces,
        priceLamports,
        treasury: provider.wallet.publicKey,
        collectionMint: null,
      })
      .accountsStrict({
        config: configPda,
        payer: provider.wallet.publicKey,
        systemProgram: web3.SystemProgram.programId,
      })
      .rpc();
  });

  it("init_config_works", async () => {
    const config = await program.account.config.fetch(configPda);

    expect(config.authority.toBase58()).to.equal(
      provider.wallet.publicKey.toBase58()
    );
    expect(config.treasury.toBase58()).to.equal(
      provider.wallet.publicKey.toBase58()
    );
    expect(config.totalSpaces).to.equal(3);
    expect(config.mintedSpaces).to.equal(0);
  });

  it("mint_next_space_works", async () => {
    const spaceId = 1;
    const spaceIdBuf = Buffer.alloc(4);
    spaceIdBuf.writeUInt32LE(spaceId);

    const [spacePda] = web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from(SPACE_SEED),
        configPda.toBuffer(),
        spaceIdBuf,
      ],
      program.programId
    );

    const mintKp = web3.Keypair.generate();
    const mint = mintKp.publicKey;

    const payerTokenAccount = getAssociatedTokenAddressSync(
      mint,
      provider.wallet.publicKey
    );

    const [metadataPda] = web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("metadata"),
        METADATA_PROGRAM_ID.toBuffer(),
        mint.toBuffer(),
      ],
      METADATA_PROGRAM_ID
    );

    await program.methods
      .mintNextSpace(spaceId, null)
      .accountsStrict({
        config: configPda,
        spacePda,
        mint,
        payerTokenAccount,
        payer: provider.wallet.publicKey,
        treasury: provider.wallet.publicKey,
        systemProgram: web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: web3.SYSVAR_RENT_PUBKEY,
        metadataAccount: metadataPda,
        tokenMetadataProgram: METADATA_PROGRAM_ID,
      })
      .signers([mintKp])
      .rpc();

    const config = await program.account.config.fetch(configPda);
    const space = await program.account.space.fetch(spacePda);

    expect(config.mintedSpaces).to.equal(1);
    expect(space.spaceId).to.equal(spaceId);
    expect(space.owner.toBase58()).to.equal(
      provider.wallet.publicKey.toBase58()
    );
    expect(space.mint.toBase58()).to.equal(mint.toBase58());
  });

  it("mint_all_spaces_then_fail", async () => {
    const configBefore = await program.account.config.fetch(configPda);

    for (
      let spaceId = configBefore.mintedSpaces + 1;
      spaceId <= configBefore.totalSpaces;
      spaceId++
    ) {
      const spaceIdBuf = Buffer.alloc(4);
      spaceIdBuf.writeUInt32LE(spaceId);

      const [spacePda] = web3.PublicKey.findProgramAddressSync(
        [
          Buffer.from(SPACE_SEED),
          configPda.toBuffer(),
          spaceIdBuf,
        ],
        program.programId
      );

      const mintKp = web3.Keypair.generate();
      const mint = mintKp.publicKey;

      const payerTokenAccount = getAssociatedTokenAddressSync(
        mint,
        provider.wallet.publicKey
      );

      const [metadataPda] = web3.PublicKey.findProgramAddressSync(
        [
          Buffer.from("metadata"),
          METADATA_PROGRAM_ID.toBuffer(),
          mint.toBuffer(),
        ],
        METADATA_PROGRAM_ID
      );

      await program.methods
        .mintNextSpace(spaceId, null)
        .accountsStrict({
          config: configPda,
          spacePda,
          mint,
          payerTokenAccount,
          payer: provider.wallet.publicKey,
          treasury: provider.wallet.publicKey,
          systemProgram: web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: web3.SYSVAR_RENT_PUBKEY,
          metadataAccount: metadataPda,
          tokenMetadataProgram: METADATA_PROGRAM_ID,
        })
        .signers([mintKp])
        .rpc();
    }

    const nextSpaceId = configBefore.totalSpaces + 1;
    const nextSpaceIdBuf = Buffer.alloc(4);
    nextSpaceIdBuf.writeUInt32LE(nextSpaceId);

    const [nextSpacePda] = web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from(SPACE_SEED),
        configPda.toBuffer(),
        nextSpaceIdBuf,
      ],
      program.programId
    );

    let caughtError: AnchorError | null = null;

    try {
      await program.methods
        .mintNextSpace(nextSpaceId, null)
        .accountsStrict({
          config: configPda,
          spacePda: nextSpacePda,
          mint: web3.Keypair.generate().publicKey,
          payerTokenAccount: getAssociatedTokenAddressSync(
            web3.Keypair.generate().publicKey,
            provider.wallet.publicKey
          ),
          payer: provider.wallet.publicKey,
          treasury: provider.wallet.publicKey,
          systemProgram: web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: web3.SYSVAR_RENT_PUBKEY,
          metadataAccount: web3.Keypair.generate().publicKey,
          tokenMetadataProgram: METADATA_PROGRAM_ID,
        })
        .rpc();
    } catch (err) {
      caughtError = err as AnchorError;
    }

    expect(caughtError).to.not.be.null;
  });

  it("update_space_settings_by_owner", async () => {
    const spaceId = 1;
    const spaceIdBuf = Buffer.alloc(4);
    spaceIdBuf.writeUInt32LE(spaceId);

    const [spacePda] = web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from(SPACE_SEED),
        configPda.toBuffer(),
        spaceIdBuf,
      ],
      program.programId
    );

    const spaceAccount = await program.account.space.fetch(spacePda);

    const nftTokenAccount = getAssociatedTokenAddressSync(
      spaceAccount.mint,
      provider.wallet.publicKey
    );

    const newName = "My first space";
    const newConfigUri = "ipfs://bafy...space-config";

    await program.methods
      .updateSpaceSettings({
        name: newName,
        spaceConfigUri: newConfigUri,
        isOpen: true,
        isEditableByOthers: false,
      })
      .accounts({
        space: spacePda,
        authority: provider.wallet.publicKey,
        nftTokenAccount,
      })
      .rpc();

    const updatedSpace = await program.account.space.fetch(spacePda);

    expect(updatedSpace.name).to.equal(newName);
    expect(updatedSpace.spaceConfigUri).to.equal(newConfigUri);
    expect(updatedSpace.isOpen).to.equal(true);
    expect(updatedSpace.isEditableByOthers).to.equal(false);
  });

  it("update_space_settings_by_non_owner_fails", async () => {
    const spaceId = 1;
    const spaceIdBuf = Buffer.alloc(4);
    spaceIdBuf.writeUInt32LE(spaceId);

    const [spacePda] = web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from(SPACE_SEED),
        configPda.toBuffer(),
        spaceIdBuf,
      ],
      program.programId
    );

    const spaceAccount = await program.account.space.fetch(spacePda);

    const ownerNftAta = getAssociatedTokenAddressSync(
      spaceAccount.mint,
      provider.wallet.publicKey
    );

    const other = web3.Keypair.generate();

    let caughtError: AnchorError | null = null;

    try {
      await program.methods
        .updateSpaceSettings({
          name: "Hacked name",
          spaceConfigUri: null,
          isOpen: null,
          isEditableByOthers: null,
        })
        .accounts({
          space: spacePda,
          authority: other.publicKey,
          nftTokenAccount: ownerNftAta,
        })
        .signers([other])
        .rpc();
    } catch (err) {
      caughtError = err as AnchorError;
    }

    expect(caughtError).to.not.be.null;
  });
});

