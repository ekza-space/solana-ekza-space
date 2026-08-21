use anchor_lang::prelude::*;

use crate::constants::CONFIG_SEED;
use crate::instructions::init_config::validate_base_uri;
use crate::{error::ErrorCode, events::ConfigUpdated, state::Config};

/// Accounts for `update_config`.
#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = authority @ ErrorCode::Unauthorized,
    )]
    pub config: Account<'info, Config>,

    pub authority: Signer<'info>,
}

/// Arguments for `update_config`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct UpdateConfigArgs {
    pub new_price_lamports: Option<u64>,
    pub new_treasury: Option<Pubkey>,
    pub paused: Option<bool>,
    pub max_per_wallet: Option<u16>,
    /// Applies to future mints and `refresh_space_metadata` only.
    pub base_uri: Option<String>,
}

/// Update mutable parts of config.
pub fn update_config(ctx: Context<UpdateConfig>, args: UpdateConfigArgs) -> Result<()> {
    let config = &mut ctx.accounts.config;

    if let Some(price) = args.new_price_lamports {
        config.price_lamports = price;
    }

    if let Some(treasury) = args.new_treasury {
        config.treasury = treasury;
    }

    if let Some(paused) = args.paused {
        config.paused = paused;
    }

    if let Some(max_per_wallet) = args.max_per_wallet {
        config.max_per_wallet = max_per_wallet;
    }

    if let Some(base_uri) = args.base_uri {
        validate_base_uri(&base_uri)?;
        config.base_uri = base_uri;
    }

    emit!(ConfigUpdated {
        price_lamports: config.price_lamports,
        treasury: config.treasury,
        paused: config.paused,
        max_per_wallet: config.max_per_wallet,
    });

    Ok(())
}
