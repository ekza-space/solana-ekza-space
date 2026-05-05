use anchor_lang::prelude::*;

/// Maximum lengths for string fields in `Space`.
pub const SPACE_NAME_MAX_LEN: usize = 64;
pub const SPACE_DESC_MAX_LEN: usize = 512;
pub const SPACE_MAX_EDITORS: usize = 10;

/// Global configuration PDA.
#[account]
#[derive(InitSpace)]
pub struct Config {
    /// Authority allowed to update config.
    pub authority: Pubkey,
    /// Treasury that receives SOL from mints.
    pub treasury: Pubkey,
    /// Total number of available spaces.
    pub total_spaces: u32,
    /// Number of already minted spaces.
    pub minted_spaces: u32,
    /// Price per space in lamports.
    pub price_lamports: u64,
    /// Optional collection mint (Pubkey::default() if unused).
    pub collection_mint: Pubkey,
    /// Bump for config PDA.
    pub bump: u8,
}

/// Per-space PDA with settings and metadata.
#[account]
#[derive(InitSpace)]
pub struct Space {
    /// Unique space id (1..=total_spaces).
    pub space_id: u32,
    /// NFT mint that represents this space.
    pub mint: Pubkey,
    /// On-chain owner of the space settings.
    pub owner: Pubkey,
    /// Human-readable name of the space.
    #[max_len(64)]
    pub name: String,
    /// Off-chain config URI for this space (e.g. IPFS).
    #[max_len(512)]
    pub space_config_uri: String,
    /// Whether other users can enter this space.
    pub is_open: bool,
    /// Whether others are allowed to edit this space.
    pub is_editable_by_others: bool,
    /// Explicit editor allowlist for shared room state updates.
    #[max_len(10)]
    pub editors: Vec<Pubkey>,
    /// Bump for space PDA.
    pub bump: u8,
    /// Reserved for future extensions.
    pub reserved: [u8; 32],
}

impl Space {
    pub const NAME_MAX_LEN: usize = SPACE_NAME_MAX_LEN;
    pub const DESC_MAX_LEN: usize = SPACE_DESC_MAX_LEN;
    pub const MAX_EDITORS: usize = SPACE_MAX_EDITORS;
}
