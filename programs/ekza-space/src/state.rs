use anchor_lang::prelude::*;

/// Maximum lengths for string fields.
pub const SPACE_NAME_MAX_LEN: usize = 64;
pub const SPACE_URI_MAX_LEN: usize = 512;
pub const SPACE_MAX_EDITORS: usize = 10;
pub const BASE_URI_MAX_LEN: usize = 128;

/// Global configuration PDA.
#[account]
#[derive(InitSpace)]
pub struct Config {
    /// Authority allowed to update config and manage the collection.
    pub authority: Pubkey,
    /// Proposed new authority (two-step transfer). `Pubkey::default()` when none.
    pub pending_authority: Pubkey,
    /// Treasury that receives SOL from mints and secondary royalties.
    pub treasury: Pubkey,
    /// Verified collection mint. `Pubkey::default()` until `create_collection`.
    pub collection_mint: Pubkey,
    /// Total number of available spaces.
    pub total_spaces: u32,
    /// Number of already minted spaces.
    pub minted_spaces: u32,
    /// Price per space in lamports.
    pub price_lamports: u64,
    /// Secondary-sale royalty in basis points.
    pub royalty_bps: u16,
    /// Max mints per wallet. 0 = unlimited.
    pub max_per_wallet: u16,
    /// Emergency stop for minting.
    pub paused: bool,
    /// Metadata base URI. Space #N resolves to `{base_uri}{N}.json`.
    #[max_len(128)]
    pub base_uri: String,
    /// Bump for config PDA.
    pub bump: u8,
    /// Reserved for future extensions.
    pub reserved: [u8; 64],
}

impl Config {
    pub fn has_collection(&self) -> bool {
        self.collection_mint != Pubkey::default()
    }

    pub fn space_uri(&self, space_id: u32) -> String {
        format!("{}{}.json", self.base_uri, space_id)
    }
}

/// Per-space PDA with settings and metadata.
#[account]
#[derive(InitSpace)]
pub struct Space {
    /// Unique space id (1..=total_spaces).
    pub space_id: u32,
    /// NFT mint that represents this space.
    pub mint: Pubkey,
    /// Last known holder of the NFT. Synced on every owner action.
    pub owner: Pubkey,
    /// Human-readable name of the space.
    #[max_len(64)]
    pub name: String,
    /// Off-chain config URI for this space (e.g. IPFS).
    #[max_len(512)]
    pub space_config_uri: String,
    /// Whether other users can enter this space.
    pub is_open: bool,
    /// Explicit editor allowlist for shared room state updates.
    /// Cleared automatically when the NFT changes hands.
    #[max_len(10)]
    pub editors: Vec<Pubkey>,
    /// Bump for space PDA.
    pub bump: u8,
    /// Reserved for future extensions.
    pub reserved: [u8; 32],
}

impl Space {
    pub const NAME_MAX_LEN: usize = SPACE_NAME_MAX_LEN;
    pub const URI_MAX_LEN: usize = SPACE_URI_MAX_LEN;
    pub const MAX_EDITORS: usize = SPACE_MAX_EDITORS;
}

/// Per-wallet mint counter, used to enforce `Config::max_per_wallet`.
#[account]
#[derive(InitSpace)]
pub struct MinterRecord {
    pub wallet: Pubkey,
    pub minted: u16,
    pub bump: u8,
}
