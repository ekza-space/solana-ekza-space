import * as anchor from "@coral-xyz/anchor";
import { Program, web3, AnchorError } from "@coral-xyz/anchor";
import { expect } from "chai";
import { SolanaEkzaSpace } from "../target/types/solana_ekza_space";

describe("ekza-space", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SolanaEkzaSpace as Program<SolanaEkzaSpace>;

  const CONFIG_SEED = "config";
  const SPACE_SEED = "space";

  let configPda: web3.PublicKey;

  before(async () => {
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
      .accounts({
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

    const dummyMint = web3.Keypair.generate().publicKey;

    await program.methods
      .mintNextSpace(spaceId, dummyMint)
      .accounts({
        config: configPda,
        space: spacePda,
        payer: provider.wallet.publicKey,
        treasury: provider.wallet.publicKey,
        systemProgram: web3.SystemProgram.programId,
      })
      .rpc();

    const config = await program.account.config.fetch(configPda);
    const space = await program.account.space.fetch(spacePda);

    expect(config.mintedSpaces).to.equal(1);
    expect(space.spaceId).to.equal(spaceId);
    expect(space.owner.toBase58()).to.equal(
      provider.wallet.publicKey.toBase58()
    );
    expect(space.mint.toBase58()).to.equal(dummyMint.toBase58());
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

      const dummyMint = web3.Keypair.generate().publicKey;

      await program.methods
        .mintNextSpace(spaceId, dummyMint)
        .accounts({
          config: configPda,
          spacePda: spacePda,
          spacePda: spacePda,
          payer: provider.wallet.publicKey,
          treasury: provider.wallet.publicKey,
          systemProgram: web3.SystemProgram.programId,
        })
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

    const dummyMint = web3.Keypair.generate().publicKey;

    let caughtError: AnchorError | null = null;

    try {
      await program.methods
        .mintNextSpace(nextSpaceId, dummyMint)
        .accounts({
          config: configPda,
          spacePda: nextSpacePda,
          payer: provider.wallet.publicKey,
          treasury: provider.wallet.publicKey,
          systemProgram: web3.SystemProgram.programId,
        })
        .rpc();
    } catch (err) {
      caughtError = err as AnchorError;
    }

    expect(caughtError).to.not.be.null;
    expect(caughtError?.error.errorCode.number).to.equal(6000); // AllSpacesMinted
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

    const newName = "My first space";
    const newDescription = "This is a test description";

    await program.methods
      .updateSpaceSettings({
        name: newName,
        description: newDescription,
        isOpen: true,
        isEditableByOthers: false,
      })
      .accounts({
        space: spacePda,
        authority: provider.wallet.publicKey,
      })
      .rpc();

    const space = await program.account.space.fetch(spacePda);

    expect(space.name).to.equal(newName);
    expect(space.description).to.equal(newDescription);
    expect(space.isOpen).to.equal(true);
    expect(space.isEditableByOthers).to.equal(false);
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

    const other = web3.Keypair.generate();

    let caughtError: AnchorError | null = null;

    try {
      await program.methods
        .updateSpaceSettings({
          name: "Hacked name",
          description: null,
          isOpen: null,
          isEditableByOthers: null,
        })
        .accounts({
          space: spacePda,
          authority: other.publicKey,
        })
        .signers([other])
        .rpc();
    } catch (err) {
      caughtError = err as AnchorError;
    }

    expect(caughtError).to.not.be.null;
    expect(caughtError?.error.errorCode.number).to.equal(6001); // NotSpaceOwner
  });
});

