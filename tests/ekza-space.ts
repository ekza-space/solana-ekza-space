import { fromWorkspace, LiteSVMProvider } from "anchor-litesvm";
import * as anchor from "@coral-xyz/anchor";
import { Program, web3, AnchorError } from "@coral-xyz/anchor";
import { expect } from "chai";
import { SolanaEkzaSpace } from "../target/types/solana_ekza_space";
import { EkzaSpaceClient } from "../sdk/ekzaSpaceClient";

describe("ekza-space litesvm", () => {
  let client: any;
  let provider: LiteSVMProvider;
  let program: Program<SolanaEkzaSpace>;
  let sdk: EkzaSpaceClient;

  before(async () => {
    client = fromWorkspace("./");
    provider = new LiteSVMProvider(client);
    anchor.setProvider(provider);
    program = anchor.workspace.SolanaEkzaSpace as Program<SolanaEkzaSpace>;
    sdk = new EkzaSpaceClient(provider, program);

    // fund wallet for tests
    client.airdrop(
      provider.wallet.publicKey,
      BigInt(100 * web3.LAMPORTS_PER_SOL)
    );

    const totalSpaces = 3;
    const priceLamports = new anchor.BN(web3.LAMPORTS_PER_SOL);

    await sdk.initConfig({
      totalSpaces,
      priceLamports,
      treasury: provider.wallet.publicKey,
      collectionMint: null,
    });
  });

  it("init_config_works", async () => {
    const config = await sdk.getConfig();

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

    const { spacePda, mint } = await sdk.mintNextSpace(spaceId, null);

    const config = await sdk.getConfig();
    const space = await sdk.getSpace(spacePda);

    expect(config.mintedSpaces).to.equal(1);
    expect(space.spaceId).to.equal(spaceId);
    expect(space.owner.toBase58()).to.equal(
      provider.wallet.publicKey.toBase58()
    );
    expect(space.mint.toBase58()).to.equal(mint.toBase58());
  });

  it("mint_all_spaces_then_fail", async () => {
    const configBefore = await sdk.getConfig();

    for (
      let spaceId = configBefore.mintedSpaces + 1;
      spaceId <= configBefore.totalSpaces;
      spaceId++
    ) {
      await sdk.mintNextSpace(spaceId, null);
    }

    const nextSpaceId = configBefore.totalSpaces + 1;

    let caughtError: AnchorError | null = null;

    try {
      await sdk.mintNextSpace(nextSpaceId, null);
    } catch (err) {
      caughtError = err as AnchorError;
    }

    expect(caughtError).to.not.be.null;
  });

  it("update_space_settings_by_owner", async () => {
    const spaceId = 1;

    const newName = "My first space";
    const newConfigUri = "ipfs://bafy...space-config";

    await sdk.updateSpaceSettings(spaceId, {
      name: newName,
      spaceConfigUri: newConfigUri,
      isOpen: true,
      isEditableByOthers: false,
    });

    const updatedSpace = await sdk.getSpaceById(spaceId);

    expect(updatedSpace.name).to.equal(newName);
    expect(updatedSpace.spaceConfigUri).to.equal(newConfigUri);
    expect(updatedSpace.isOpen).to.equal(true);
    expect(updatedSpace.isEditableByOthers).to.equal(false);
  });

  it("update_space_settings_by_non_owner_fails", async () => {
    const spaceId = 1;

    const other = web3.Keypair.generate();

    let caughtError: AnchorError | null = null;

    try {
      await sdk.updateSpaceSettings(
        spaceId,
        {
          name: "Hacked name",
          spaceConfigUri: null,
          isOpen: null,
          isEditableByOthers: null,
        },
        other
      );
    } catch (err) {
      caughtError = err as AnchorError;
    }

    expect(caughtError).to.not.be.null;
  });
});

