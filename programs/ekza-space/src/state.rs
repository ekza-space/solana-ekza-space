use anchor_lang::prelude::*;

/// Maximum lengths for string fields in `Space`.
pub const SPACE_NAME_MAX_LEN: usize = 64;
pub const SPACE_DESC_MAX_LEN: usize = 512;

/// Global configuration PDA.
#[account]
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

impl Config {
    /// Size of `Config` account data (without discriminator).
    pub const LEN: usize = 32 + 32 + 4 + 4 + 8 + 32 + 1;
}

/// Per-space PDA with settings and metadata.
#[account]
pub struct Space {
    /// Unique space id (1..=total_spaces).
    pub space_id: u32,
    /// NFT mint that represents this space.
    pub mint: Pubkey,
    /// On-chain owner of the space settings.
    pub owner: Pubkey,
    /// Human-readable name of the space.
    pub name: String,
    /// Longer description.
    pub description: String,
    /// Whether other users can enter this space.
    pub is_open: bool,
    /// Whether others are allowed to edit this space.
    pub is_editable_by_others: bool,
    /// Bump for space PDA.
    pub bump: u8,
    /// Reserved for future extensions.
    pub reserved: [u8; 32],
}

impl Space {
    pub const NAME_MAX_LEN: usize = SPACE_NAME_MAX_LEN;
    pub const DESC_MAX_LEN: usize = SPACE_DESC_MAX_LEN;

    /// Size of `Space` account data (without discriminator).
    pub const LEN: usize = 4  // space_id
        + 32                  // mint
        + 32                  // owner
        + 4 + Self::NAME_MAX_LEN // name string prefix + content
        + 4 + Self::DESC_MAX_LEN // description string prefix + content
        + 1                   // is_open
        + 1                   // is_editable_by_others
        + 1                   // bump
        + 32;                 // reserved
}


