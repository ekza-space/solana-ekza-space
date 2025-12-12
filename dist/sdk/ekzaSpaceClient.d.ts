import * as anchor from "@coral-xyz/anchor";
import { Program, web3, BN } from "@coral-xyz/anchor";
import { SolanaEkzaSpace } from "../target/types/solana_ekza_space";
export declare const CONFIG_SEED = "config";
export declare const SPACE_SEED = "space_v1";
export declare const METADATA_PROGRAM_ID: anchor.web3.PublicKey;
type ProviderLike = {
    wallet: {
        publicKey: web3.PublicKey;
    };
};
export declare class EkzaSpaceClient {
    readonly provider: ProviderLike;
    readonly program: Program<SolanaEkzaSpace>;
    readonly configPda: web3.PublicKey;
    constructor(provider: ProviderLike, program: Program<SolanaEkzaSpace>);
    getSpacePda(spaceId: number): web3.PublicKey;
    getConfig(): Promise<any>;
    getSpaceById(spaceId: number): Promise<any>;
    getSpace(spacePda: web3.PublicKey): Promise<any>;
    initConfig(args: {
        totalSpaces: number;
        priceLamports: BN;
        treasury?: web3.PublicKey;
        collectionMint?: web3.PublicKey | null;
    }): Promise<void>;
    updateConfig(args: {
        newPriceLamports?: BN | null;
        newTreasury?: web3.PublicKey | null;
    }): Promise<void>;
    mintNextSpace(spaceId: number, uri?: string | null, opts?: {
        treasury?: web3.PublicKey;
    }): Promise<{
        spacePda: web3.PublicKey;
        mint: web3.PublicKey;
    }>;
    updateSpaceSettings(spaceId: number, args: {
        name: string | null;
        spaceConfigUri: string | null;
        isOpen: boolean | null;
        isEditableByOthers: boolean | null;
    }, authorityKp?: web3.Keypair): Promise<void>;
}
export {};
