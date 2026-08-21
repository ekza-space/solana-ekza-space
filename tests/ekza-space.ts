import { fromWorkspace, LiteSVMProvider } from "anchor-litesvm";
import * as anchor from "@coral-xyz/anchor";
import { Program, web3, BN } from "@coral-xyz/anchor";
import {
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAssociatedTokenAddressSync,
  MintLayout,
  AccountLayout,
} from "@solana/spl-token";
import { expect } from "chai";
import * as path from "path";
import { SolanaEkzaSpace } from "../target/types/solana_ekza_space";
import {
  EkzaSpaceClient,
  METADATA_PROGRAM_ID,
  findMetadataPda,
} from "../sdk/ekzaSpaceClient";

// ------------------------------------------------------------------ helpers

type ParsedMetadata = {
  updateAuthority: web3.PublicKey;
  mint: web3.PublicKey;
  name: string;
  symbol: string;
  uri: string;
  sellerFeeBasisPoints: number;
  creators: { address: web3.PublicKey; verified: boolean; share: number }[] | null;
  isMutable: boolean;
  collection: { verified: boolean; key: web3.PublicKey } | null;
  collectionDetailsSize: bigint | null;
};

/** Minimal Borsh reader for Metaplex `Metadata` (token-metadata v1 layout). */
function parseMetadata(data: Uint8Array): ParsedMetadata {
  const buf = Buffer.from(data);
  let o = 0;
  const u8 = () => buf[o++];
  const u16 = () => { const v = buf.readUInt16LE(o); o += 2; return v; };
  const u32 = () => { const v = buf.readUInt32LE(o); o += 4; return v; };
  const u64 = () => { const v = buf.readBigUInt64LE(o); o += 8; return v; };
  const pk = () => { const v = new web3.PublicKey(buf.subarray(o, o + 32)); o += 32; return v; };
  const str = () => {
    const len = u32();
    const v = buf.subarray(o, o + len).toString("utf8").replace(/\0+$/, "");
    o += len;
    return v;
  };

  u8(); // key
  const updateAuthority = pk();
  const mint = pk();
  const name = str();
  const symbol = str();
  const uri = str();
  const sellerFeeBasisPoints = u16();
  let creators: ParsedMetadata["creators"] = null;
  if (u8() === 1) {
    const n = u32();
    creators = [];
    for (let i = 0; i < n; i++) {
      creators.push({ address: pk(), verified: u8() === 1, share: u8() });
    }
  }
  u8(); // primary_sale_happened
  const isMutable = u8() === 1;
  if (u8() === 1) u8(); // edition_nonce
  if (u8() === 1) u8(); // token_standard
  let collection: ParsedMetadata["collection"] = null;
  if (u8() === 1) {
    const verified = u8() === 1;
    const key = pk();
    collection = { verified, key };
  }
  if (u8() === 1) { // uses
    u8(); u64(); u64();
  }
  let collectionDetailsSize: bigint | null = null;
  if (u8() === 1) {
    const variant = u8();
    if (variant === 0) collectionDetailsSize = u64();
    else o += 8;
  }

  return {
    updateAuthority, mint, name, symbol, uri, sellerFeeBasisPoints,
    creators, isMutable, collection, collectionDetailsSize,
  };
}

function errorCodeOf(err: any): string {
  const code =
    err?.error?.errorCode?.code ??
    err?.errorCode?.code ??
    null;
  if (code) return code;
  const text = `${err?.message ?? ""}\n${(err?.logs ?? err?.transactionLogs ?? []).join("\n")}`;
  const m = text.match(/Error Code: (\w+)/) || text.match(/custom program error: (0x[0-9a-f]+)/i);
  return m ? m[1] : text.slice(0, 200);
}

async function expectError(p: Promise<unknown>, ...codes: string[]): Promise<void> {
  let caught: any = null;
  try {
    await p;
  } catch (e) {
    caught = e;
  }
  expect(caught, `expected failure ${codes.join("|")}`).to.not.be.null;
  const actual = errorCodeOf(caught);
  expect(
    codes.some((c) => actual.includes(c)),
    `expected one of [${codes.join(", ")}], got: ${actual}`
  ).to.be.true;
}

// -------------------------------------------------------------------- suite

describe("ekza-space (litesvm + real Metaplex)", () => {
  let svm: any;
  let provider: LiteSVMProvider;
  let program: Program<SolanaEkzaSpace>;
  let sdk: EkzaSpaceClient;

  const treasury = web3.Keypair.generate();
  const walletB = web3.Keypair.generate();
  const walletC = web3.Keypair.generate();
  const walletD = web3.Keypair.generate();
  const buyer = web3.Keypair.generate(); // receives a transferred NFT
  const editor = web3.Keypair.generate();

  const TOTAL = 5;
  const PRICE = new BN(web3.LAMPORTS_PER_SOL);
  const ROYALTY = 500;
  const MAX_PER_WALLET = 2;
  const BASE_URI = "https://meta.example.test/spaces/";

  const getAccount = (pk: web3.PublicKey) => svm.getAccount(pk);
  /** Advance the blockhash so an identical retry is a new transaction, not a dedup hit. */
  const tick = () => svm.expireBlockhash();
  const balance = (pk: web3.PublicKey): bigint => BigInt(svm.getBalance(pk) ?? 0n);
  const metadataOf = (mint: web3.PublicKey) => parseMetadata(getAccount(findMetadataPda(mint))!.data);
  const tokenAmount = (mint: web3.PublicKey, owner: web3.PublicKey): bigint => {
    const acc = getAccount(getAssociatedTokenAddressSync(mint, owner));
    if (!acc) return 0n;
    return AccountLayout.decode(acc.data).amount;
  };

  const transferNft = async (mint: web3.PublicKey, from: web3.Keypair, to: web3.PublicKey) => {
    const fromAta = getAssociatedTokenAddressSync(mint, from.publicKey);
    const toAta = getAssociatedTokenAddressSync(mint, to);
    const tx = new web3.Transaction().add(
      createAssociatedTokenAccountInstruction(provider.wallet.publicKey, toAta, to, mint),
      createTransferInstruction(fromAta, toAta, from.publicKey, 1)
    );
    await provider.sendAndConfirm!(tx, [from]);
  };

  before(async () => {
    svm = fromWorkspace("./");
    svm.addProgramFromFile(
      METADATA_PROGRAM_ID,
      path.join(__dirname, "fixtures", "mpl_token_metadata.so")
    );
    provider = new LiteSVMProvider(svm);
    anchor.setProvider(provider);
    program = anchor.workspace.SolanaEkzaSpace as Program<SolanaEkzaSpace>;
    sdk = new EkzaSpaceClient(provider, program);

    for (const kp of [provider.wallet, walletB, walletC, walletD, buyer, editor]) {
      svm.airdrop(kp.publicKey, BigInt(100 * web3.LAMPORTS_PER_SOL));
    }
  });

  // ------------------------------------------------------------ init_config

  it("init_config rejects bad params", async () => {
    const base = {
      totalSpaces: TOTAL,
      priceLamports: PRICE,
      treasury: treasury.publicKey,
      royaltyBps: ROYALTY,
      maxPerWallet: MAX_PER_WALLET,
      baseUri: BASE_URI,
    };
    await expectError(sdk.initConfig({ ...base, totalSpaces: 0 }, { programData: null }), "InvalidTotalSpaces");
    await expectError(sdk.initConfig({ ...base, royaltyBps: 2001 }, { programData: null }), "InvalidRoyaltyBps");
    await expectError(sdk.initConfig({ ...base, baseUri: "http://insecure/" }, { programData: null }), "InvalidBaseUri");
    await expectError(sdk.initConfig({ ...base, baseUri: "https://" + "x".repeat(130) }, { programData: null }), "StringTooLong");
  });

  it("init_config works and is one-shot", async () => {
    await sdk.initConfig(
      {
        totalSpaces: TOTAL,
        priceLamports: PRICE,
        treasury: treasury.publicKey,
        royaltyBps: ROYALTY,
        maxPerWallet: MAX_PER_WALLET,
        baseUri: BASE_URI,
      },
      { programData: null }
    );

    const config = await sdk.getConfig();
    expect(config.authority.toBase58()).to.equal(provider.wallet.publicKey.toBase58());
    expect(config.treasury.toBase58()).to.equal(treasury.publicKey.toBase58());
    expect(config.totalSpaces).to.equal(TOTAL);
    expect(config.mintedSpaces).to.equal(0);
    expect(config.royaltyBps).to.equal(ROYALTY);
    expect(config.maxPerWallet).to.equal(MAX_PER_WALLET);
    expect(config.paused).to.equal(false);
    expect(config.baseUri).to.equal(BASE_URI);
    expect(config.collectionMint.toBase58()).to.equal(web3.PublicKey.default.toBase58());

    // Singleton: a second init must fail (PDA already exists).
    await expectError(
      sdk.initConfig(
        { totalSpaces: 1, priceLamports: new BN(0), royaltyBps: 0, maxPerWallet: 0, baseUri: BASE_URI },
        { programData: null }
      ),
      "already in use", "0x0"
    );
  });

  // ------------------------------------------------------------- collection

  it("mint before collection fails", async () => {
    // collection_mint is Pubkey::default — account constraint fires first.
    await expectError(sdk.mintSpace(1), "CollectionMismatch", "CollectionNotCreated", "AccountOwnedByWrongProgram");
  });

  it("create_collection: non-authority rejected, authority succeeds, one-shot", async () => {
    await expectError(sdk.createCollection(walletB), "Unauthorized", "ConstraintHasOne");

    const collectionMint = await sdk.createCollection();
    const config = await sdk.getConfig();
    expect(config.collectionMint.toBase58()).to.equal(collectionMint.toBase58());
    expect(tokenAmount(collectionMint, provider.wallet.publicKey)).to.equal(1n);

    const md = metadataOf(collectionMint);
    expect(md.name).to.equal("Ekza Spaces");
    expect(md.symbol).to.equal("SPACE");
    expect(md.uri).to.equal(BASE_URI + "collection.json");
    expect(md.updateAuthority.toBase58()).to.equal(sdk.configPda.toBase58());
    expect(md.isMutable).to.equal(true);
    expect(md.collectionDetailsSize).to.equal(0n);

    const mintInfo = MintLayout.decode(getAccount(collectionMint)!.data);
    expect(mintInfo.supply).to.equal(1n);
    // Master edition owns mint authority now.
    expect(mintInfo.mintAuthorityOption).to.equal(1);
    expect(mintInfo.mintAuthority.toBase58()).to.not.equal(sdk.configPda.toBase58());

    tick();
    await expectError(sdk.createCollection(), "CollectionAlreadyCreated", "already in use", "0x0");
  });

  // ------------------------------------------------------------------- mint

  it("mint_space #1: NFT, verified collection, royalty, creators, price → treasury", async () => {
    const treasuryBefore = balance(treasury.publicKey);
    const { spacePda, mint } = await sdk.mintSpace(1);

    const config = await sdk.getConfig();
    const space = await sdk.getSpace(spacePda);
    expect(config.mintedSpaces).to.equal(1);
    expect(space.spaceId).to.equal(1);
    expect(space.mint.toBase58()).to.equal(mint.toBase58());
    expect(space.owner.toBase58()).to.equal(provider.wallet.publicKey.toBase58());
    expect(space.isOpen).to.equal(true);
    expect(space.editors).to.have.length(0);

    expect(balance(treasury.publicKey) - treasuryBefore).to.equal(BigInt(PRICE.toString()));
    expect(tokenAmount(mint, provider.wallet.publicKey)).to.equal(1n);

    const mintInfo = MintLayout.decode(getAccount(mint)!.data);
    expect(mintInfo.supply).to.equal(1n);
    expect(mintInfo.decimals).to.equal(0);
    expect(mintInfo.mintAuthority.toBase58()).to.not.equal(sdk.configPda.toBase58()); // edition PDA

    const md = metadataOf(mint);
    expect(md.name).to.equal("Ekza Space #1");
    expect(md.symbol).to.equal("SPACE");
    expect(md.uri).to.equal(BASE_URI + "1.json");
    expect(md.sellerFeeBasisPoints).to.equal(ROYALTY);
    expect(md.isMutable).to.equal(true);
    expect(md.updateAuthority.toBase58()).to.equal(sdk.configPda.toBase58());
    expect(md.collection).to.not.be.null;
    expect(md.collection!.verified).to.equal(true);
    expect(md.collection!.key.toBase58()).to.equal(config.collectionMint.toBase58());
    expect(md.creators).to.not.be.null;
    expect(md.creators![0].address.toBase58()).to.equal(sdk.configPda.toBase58());
    expect(md.creators![0].verified).to.equal(true);
    expect(md.creators![0].share).to.equal(0);
    expect(md.creators![1].address.toBase58()).to.equal(treasury.publicKey.toBase58());
    expect(md.creators![1].share).to.equal(100);

    // Sized collection counter bumped.
    expect(metadataOf(config.collectionMint).collectionDetailsSize).to.equal(1n);

    const minter = await sdk.getMinterRecord(provider.wallet.publicKey);
    expect(minter.minted).to.equal(1);
  });

  it("mint rejects out-of-range and duplicate ids", async () => {
    await expectError(sdk.mintSpace(0), "InvalidSpaceId");
    await expectError(sdk.mintSpace(TOTAL + 1), "InvalidSpaceId");
    await expectError(sdk.mintSpace(1, walletB), "already in use", "0x0");
  });

  it("paused blocks minting", async () => {
    await sdk.updateConfig({ paused: true });
    await expectError(sdk.mintSpace(2, walletB), "MintingPaused");
    await sdk.updateConfig({ paused: false });
  });

  it("per-wallet limit is enforced", async () => {
    await sdk.mintSpace(2, walletB);
    await sdk.mintSpace(3, walletB);
    await expectError(sdk.mintSpace(4, walletB), "MintLimitReached");
    const rec = await sdk.getMinterRecord(walletB.publicKey);
    expect(rec.minted).to.equal(2);

    // Wallet A still has one slot.
    await sdk.mintSpace(4);
    await expectError(sdk.mintSpace(5), "MintLimitReached");
  });

  it("update_config: only authority; price and treasury apply to next mint", async () => {
    await expectError(sdk.updateConfig({ newPriceLamports: new BN(1) }, walletC), "Unauthorized", "ConstraintHasOne");

    const newTreasury = web3.Keypair.generate();
    const newPrice = new BN(web3.LAMPORTS_PER_SOL / 2);
    await sdk.updateConfig({ newPriceLamports: newPrice, newTreasury: newTreasury.publicKey });

    const before = balance(newTreasury.publicKey);
    await sdk.mintSpace(5, walletC);
    expect(balance(newTreasury.publicKey) - before).to.equal(BigInt(newPrice.toString()));

    // Creators reflect treasury at mint time.
    const space = await sdk.getSpaceById(5);
    expect(metadataOf(space.mint).creators![1].address.toBase58()).to.equal(newTreasury.publicKey.toBase58());

    const config = await sdk.getConfig();
    expect(config.mintedSpaces).to.equal(TOTAL);
  });

  it("sold out: no further mints", async () => {
    await expectError(sdk.mintSpace(3, walletD), "AllSpacesMinted", "already in use", "0x0");
  });

  // --------------------------------------------------------------- settings

  it("owner updates name, uri, is_open; length limits enforced", async () => {
    await sdk.updateSpaceSettings(1, {
      name: "Wotori Studio",
      spaceConfigUri: "ipfs://bafy-config-1",
      isOpen: false,
    });
    const space = await sdk.getSpaceById(1);
    expect(space.name).to.equal("Wotori Studio");
    expect(space.spaceConfigUri).to.equal("ipfs://bafy-config-1");
    expect(space.isOpen).to.equal(false);

    await expectError(sdk.updateSpaceSettings(1, { name: "x".repeat(65) }), "StringTooLong");
    await expectError(sdk.updateSpaceSettings(1, { spaceConfigUri: "x".repeat(513) }), "StringTooLong");
  });

  it("non-owner cannot update", async () => {
    await expectError(
      sdk.updateSpaceSettings(1, { name: "Hacked" }, walletD),
      "NftOwnershipRequired"
    );
    // Token account of a different mint is rejected.
    const other = await sdk.getSpaceById(2);
    await expectError(
      sdk.updateSpaceSettings(1, { spaceConfigUri: "x" }, walletB, {
        nftTokenAccount: getAssociatedTokenAddressSync(other.mint, walletB.publicKey),
      }),
      "InvalidNftTokenAccount"
    );
  });

  it("editors: uri only, owner-only fields rejected, revocation works, cap = 10", async () => {
    await sdk.updateSpaceSettings(1, { addEditor: editor.publicKey });
    tick();
    await expectError(sdk.updateSpaceSettings(1, { addEditor: editor.publicKey }), "EditorAlreadyExists");

    await sdk.updateSpaceSettings(1, { spaceConfigUri: "ipfs://by-editor" }, editor);
    expect((await sdk.getSpaceById(1)).spaceConfigUri).to.equal("ipfs://by-editor");

    await expectError(sdk.updateSpaceSettings(1, { name: "nope" }, editor), "OwnerOnlyField");
    await expectError(sdk.updateSpaceSettings(1, { isOpen: true }, editor), "OwnerOnlyField");
    await expectError(sdk.updateSpaceSettings(1, { addEditor: walletD.publicKey }, editor), "OwnerOnlyField");

    await sdk.updateSpaceSettings(1, { removeEditor: editor.publicKey });
    tick();
    await expectError(sdk.updateSpaceSettings(1, { spaceConfigUri: "x" }, editor), "NftOwnershipRequired");
    await expectError(sdk.updateSpaceSettings(1, { removeEditor: editor.publicKey }), "EditorNotFound");

    for (let i = 0; i < 10; i++) {
      await sdk.updateSpaceSettings(1, { addEditor: web3.Keypair.generate().publicKey });
    }
    await expectError(sdk.updateSpaceSettings(1, { addEditor: web3.Keypair.generate().publicKey }), "TooManyEditors");
    expect((await sdk.getSpaceById(1)).editors).to.have.length(10);
  });

  it("NFT transfer: stale editors lose access, new holder syncs owner and wipes editors", async () => {
    // Space #2 owned by walletB; grant editor, then sell to buyer.
    await sdk.updateSpaceSettings(2, { addEditor: editor.publicKey }, walletB);
    await sdk.updateSpaceSettings(2, { spaceConfigUri: "ipfs://pre-sale" }, editor);

    const space2 = await sdk.getSpaceById(2);
    await transferNft(space2.mint, walletB, buyer.publicKey);
    expect(tokenAmount(space2.mint, buyer.publicKey)).to.equal(1n);

    // Seller is locked out.
    await expectError(sdk.updateSpaceSettings(2, { name: "still mine" }, walletB), "NftOwnershipRequired", "InvalidNftTokenAccount");
    // Seller's editor is locked out even before buyer acts (space.owner != token owner).
    await expectError(
      sdk.updateSpaceSettings(2, { spaceConfigUri: "ipfs://backdoor" }, editor, {
        nftTokenAccount: getAssociatedTokenAddressSync(space2.mint, buyer.publicKey),
      }),
      "NftOwnershipRequired"
    );

    // Buyer acts: owner synced, editors wiped.
    await sdk.updateSpaceSettings(2, { name: "Buyer's place" }, buyer, {
      nftTokenAccount: getAssociatedTokenAddressSync(space2.mint, buyer.publicKey),
    });
    const after = await sdk.getSpaceById(2);
    expect(after.owner.toBase58()).to.equal(buyer.publicKey.toBase58());
    expect(after.editors).to.have.length(0);
    expect(after.name).to.equal("Buyer's place");
    expect(after.spaceConfigUri).to.equal("ipfs://pre-sale"); // content preserved
  });

  // ---------------------------------------------------------------- refresh

  it("refresh_space_metadata: authority repairs URI, collection stays verified", async () => {
    const NEW_BASE = "ipfs://bafy-new-base/";
    await sdk.updateConfig({ baseUri: NEW_BASE });
    await expectError(sdk.refreshSpaceMetadata(1, walletD), "Unauthorized", "ConstraintHasOne");

    await sdk.refreshSpaceMetadata(1);
    const space = await sdk.getSpaceById(1);
    const md = metadataOf(space.mint);
    expect(md.uri).to.equal(NEW_BASE + "1.json");
    expect(md.name).to.equal("Ekza Space #1");
    expect(md.collection!.verified).to.equal(true);
    expect(md.sellerFeeBasisPoints).to.equal(ROYALTY);
  });

  // -------------------------------------------------------------- authority

  it("two-step authority transfer", async () => {
    await expectError(sdk.acceptAuthority(walletC), "NoPendingAuthority");
    await expectError(sdk.proposeAuthority(walletC.publicKey, walletC), "Unauthorized", "ConstraintHasOne");

    await sdk.proposeAuthority(walletC.publicKey);
    expect((await sdk.getConfig()).pendingAuthority.toBase58()).to.equal(walletC.publicKey.toBase58());
    await expectError(sdk.acceptAuthority(walletD), "NotPendingAuthority");

    // Old authority still in control until accepted; can cancel.
    await sdk.proposeAuthority(web3.PublicKey.default);
    tick();
    await expectError(sdk.acceptAuthority(walletC), "NoPendingAuthority");

    tick();
    await sdk.proposeAuthority(walletC.publicKey);
    await sdk.acceptAuthority(walletC);
    const config = await sdk.getConfig();
    expect(config.authority.toBase58()).to.equal(walletC.publicKey.toBase58());
    expect(config.pendingAuthority.toBase58()).to.equal(web3.PublicKey.default.toBase58());

    await expectError(sdk.updateConfig({ paused: true }), "Unauthorized", "ConstraintHasOne");
    await sdk.updateConfig({ paused: true }, walletC);
    expect((await sdk.getConfig()).paused).to.equal(true);
  });
});
