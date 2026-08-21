use anchor_lang::prelude::*;

/// Emitted when new space is minted.
#[event]
pub struct SpaceMinted {
    pub space_id: u32,
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub price_lamports: u64,
}

/// Emitted when space settings are updated.
#[event]
pub struct SpaceSettingsUpdated {
    pub space_id: u32,
    pub owner: Pubkey,
    pub by: Pubkey,
}

/// Emitted when config is updated.
#[event]
pub struct ConfigUpdated {
    pub price_lamports: u64,
    pub treasury: Pubkey,
    pub paused: bool,
    pub max_per_wallet: u16,
}

/// Emitted when the collection NFT is created.
#[event]
pub struct CollectionCreated {
    pub collection_mint: Pubkey,
}

/// Emitted when an authority transfer is proposed.
#[event]
pub struct AuthorityTransferProposed {
    pub current: Pubkey,
    pub pending: Pubkey,
}

/// Emitted when an authority transfer is accepted.
#[event]
pub struct AuthorityTransferred {
    pub previous: Pubkey,
    pub current: Pubkey,
}

/// Emitted when a space's on-chain metadata URI is refreshed by the authority.
#[event]
pub struct SpaceMetadataRefreshed {
    pub space_id: u32,
    pub uri: String,
}
