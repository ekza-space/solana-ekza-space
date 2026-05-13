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

    /// Initialize global config PDA.
    pub fn init_config(ctx: Context<InitConfig>, args: InitConfigArgs) -> Result<()> {
        instructions::init_config(ctx, args)
    }

    /// Update mutable parts of config.
    pub fn update_config(ctx: Context<UpdateConfig>, args: UpdateConfigArgs) -> Result<()> {
        instructions::update_config(ctx, args)
    }

    /// Mint next available space and create its PDA.
    pub fn mint_next_space(
        ctx: Context<MintNextSpace>,
        space_id: u32,
        uri: Option<String>,
    ) -> Result<()> {
        instructions::mint_next_space(ctx, space_id, uri)
    }

    /// Update editable settings for a space.
    pub fn update_space_settings(
        ctx: Context<UpdateSpaceSettings>,
        args: UpdateSpaceSettingsArgs,
    ) -> Result<()> {
        instructions::update_space_settings(ctx, args)
    }
}
