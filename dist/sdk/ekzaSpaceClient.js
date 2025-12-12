"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EkzaSpaceClient = exports.METADATA_PROGRAM_ID = exports.SPACE_SEED = exports.CONFIG_SEED = void 0;
const anchor_1 = require("@coral-xyz/anchor");
const spl_token_1 = require("@solana/spl-token");
exports.CONFIG_SEED = "config";
exports.SPACE_SEED = "space";
exports.METADATA_PROGRAM_ID = new anchor_1.web3.PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
class EkzaSpaceClient {
    constructor(provider, program) {
        this.provider = provider;
        this.program = program;
        [this.configPda] = anchor_1.web3.PublicKey.findProgramAddressSync([Buffer.from(exports.CONFIG_SEED)], this.program.programId);
    }
    getSpacePda(spaceId) {
        const spaceIdBuf = Buffer.alloc(4);
        spaceIdBuf.writeUInt32LE(spaceId);
        const [spacePda] = anchor_1.web3.PublicKey.findProgramAddressSync([Buffer.from(exports.SPACE_SEED), this.configPda.toBuffer(), spaceIdBuf], this.program.programId);
        return spacePda;
    }
    async getConfig() {
        return this.program.account.config.fetch(this.configPda);
    }
    async getSpaceById(spaceId) {
        const spacePda = this.getSpacePda(spaceId);
        return this.getSpace(spacePda);
    }
    async getSpace(spacePda) {
        return this.program.account.space.fetch(spacePda);
    }
    async initConfig(args) {
        var _a, _b;
        const { totalSpaces, priceLamports } = args;
        const treasury = (_a = args.treasury) !== null && _a !== void 0 ? _a : this.provider.wallet.publicKey;
        const collectionMint = (_b = args.collectionMint) !== null && _b !== void 0 ? _b : null;
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
            systemProgram: anchor_1.web3.SystemProgram.programId,
        })
            .rpc();
    }
    async updateConfig(args) {
        var _a, _b;
        await this.program.methods
            .updateConfig({
            newPriceLamports: (_a = args.newPriceLamports) !== null && _a !== void 0 ? _a : null,
            newTreasury: (_b = args.newTreasury) !== null && _b !== void 0 ? _b : null,
        })
            // @ts-ignore anchor typegen has a slightly narrower type here
            .accountsStrict({
            config: this.configPda,
            authority: this.provider.wallet.publicKey,
        })
            .rpc();
    }
    async mintNextSpace(spaceId, uri, opts) {
        var _a;
        const spacePda = this.getSpacePda(spaceId);
        const mintKp = anchor_1.web3.Keypair.generate();
        const mint = mintKp.publicKey;
        const payer = this.provider.wallet.publicKey;
        const payerTokenAccount = (0, spl_token_1.getAssociatedTokenAddressSync)(mint, payer);
        const [metadataPda] = anchor_1.web3.PublicKey.findProgramAddressSync([
            Buffer.from("metadata"),
            exports.METADATA_PROGRAM_ID.toBuffer(),
            mint.toBuffer(),
        ], exports.METADATA_PROGRAM_ID);
        const treasury = (_a = opts === null || opts === void 0 ? void 0 : opts.treasury) !== null && _a !== void 0 ? _a : payer;
        let ix = this.program.methods.mintNextSpace(spaceId, uri !== null && uri !== void 0 ? uri : null).accountsStrict({
            config: this.configPda,
            spacePda,
            mint,
            payerTokenAccount,
            payer,
            treasury,
            systemProgram: anchor_1.web3.SystemProgram.programId,
            tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
            associatedTokenProgram: spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID,
            rent: anchor_1.web3.SYSVAR_RENT_PUBKEY,
            metadataAccount: metadataPda,
            tokenMetadataProgram: exports.METADATA_PROGRAM_ID,
        });
        ix = ix.signers([mintKp]);
        await ix.rpc();
        return { spacePda, mint };
    }
    async updateSpaceSettings(spaceId, args, authorityKp) {
        var _a;
        const spacePda = this.getSpacePda(spaceId);
        const authority = (_a = authorityKp === null || authorityKp === void 0 ? void 0 : authorityKp.publicKey) !== null && _a !== void 0 ? _a : this.provider.wallet.publicKey;
        const spaceAccount = await this.program.account.space.fetch(spacePda);
        const nftTokenAccount = (0, spl_token_1.getAssociatedTokenAddressSync)(spaceAccount.mint, authority);
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
exports.EkzaSpaceClient = EkzaSpaceClient;
