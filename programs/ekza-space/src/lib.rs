use anchor_lang::prelude::*;

pub mod constants;
pub mod error;
pub mod events;
mod instructions;
pub mod state;

pub use error::ErrorCode;
pub use events::*;
pub use state::*;

use crate::instructions::*;

declare_id!("2WtuXG6AX3erRp6eK5WiSTEEBec5zprQ7qLyLENfMQEH");

#[program]
pub mod solana_ekza_space {
    use super::*;

    /// Initialize global config PDA. Upgrade authority only.
    pub fn init_config(ctx: Context<InitConfig>, args: InitConfigArgs) -> Result<()> {
        instructions::init_config(ctx, args)
    }

    /// Update mutable parts of config.
    pub fn update_config(ctx: Context<UpdateConfig>, args: UpdateConfigArgs) -> Result<()> {
        instructions::update_config(ctx, args)
    }

    /// Propose a new config authority (step 1 of 2). `Pubkey::default()` cancels.
    pub fn propose_authority(ctx: Context<ProposeAuthority>, new_authority: Pubkey) -> Result<()> {
        instructions::propose_authority(ctx, new_authority)
    }

    /// Accept a proposed authority transfer (step 2 of 2).
    pub fn accept_authority(ctx: Context<AcceptAuthority>) -> Result<()> {
        instructions::accept_authority(ctx)
    }

    /// Create the verified collection NFT. Must run once before any mint.
    pub fn create_collection(ctx: Context<CreateCollection>) -> Result<()> {
        instructions::create_collection(ctx)
    }

    /// Mint space `space_id` as a verified 1/1 NFT in the collection.
    pub fn mint_space(ctx: Context<MintSpace>, space_id: u32) -> Result<()> {
        instructions::mint_space(ctx, space_id)
    }

    /// Update editable settings for a space.
    pub fn update_space_settings(
        ctx: Context<UpdateSpaceSettings>,
        args: UpdateSpaceSettingsArgs,
    ) -> Result<()> {
        instructions::update_space_settings(ctx, args)
    }

    /// Authority-only: rewrite a space's Metaplex metadata from current config.
    pub fn refresh_space_metadata(ctx: Context<RefreshSpaceMetadata>) -> Result<()> {
        instructions::refresh_space_metadata(ctx)
    }
}
