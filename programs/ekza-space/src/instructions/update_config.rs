use anchor_lang::prelude::*;

use crate::{error::ErrorCode, events::ConfigUpdated, state::Config};

/// Accounts for `update_config`.
#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(mut, has_one = authority)]
    pub config: Account<'info, Config>,

    pub authority: Signer<'info>,
}

/// Arguments for `update_config`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct UpdateConfigArgs {
    pub new_price_lamports: Option<u64>,
    pub new_treasury: Option<Pubkey>,
}

/// Update mutable parts of config.
pub fn update_config(ctx: Context<UpdateConfig>, args: UpdateConfigArgs) -> Result<()> {
    let config = &mut ctx.accounts.config;

    // Explicit check in addition to `has_one = authority` for clearer error code.
    require_keys_eq!(config.authority, ctx.accounts.authority.key(), ErrorCode::Unauthorized);

    if let Some(price) = args.new_price_lamports {
        config.price_lamports = price;
    }

    if let Some(treasury) = args.new_treasury {
        config.treasury = treasury;
    }

    emit!(ConfigUpdated {
        price_lamports: config.price_lamports,
        treasury: config.treasury,
    });

    Ok(())
}
