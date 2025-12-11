use anchor_lang::prelude::*;

/// Emitted when new space is minted.
#[event]
pub struct SpaceMinted {
    pub space_id: u32,
    pub owner: Pubkey,
    pub mint: Pubkey,
}

/// Emitted when space settings are updated.
#[event]
pub struct SpaceSettingsUpdated {
    pub space_id: u32,
    pub owner: Pubkey,
}

/// Emitted when config is updated.
#[event]
pub struct ConfigUpdated {
    pub price_lamports: u64,
    pub treasury: Pubkey,
}


