use anchor_lang::prelude::*;

use crate::{error::ErrorCode, state::Config};

/// Accounts for `init_config`.
#[derive(Accounts)]
pub struct InitConfig<'info> {
    #[account(
        init,
        payer = payer,
        seeds = [b"config"],
        bump,
        space = 8 + Config::LEN
    )]
    pub config: Account<'info, Config>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

/// Arguments for `init_config`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitConfigArgs {
    pub total_spaces: u32,
    pub price_lamports: u64,
    pub treasury: Pubkey,
    pub collection_mint: Option<Pubkey>,
}

/// Initialize global config PDA.
pub fn init_config(ctx: Context<InitConfig>, args: InitConfigArgs) -> Result<()> {
    require!(args.total_spaces > 0, ErrorCode::InvalidTotalSpaces);

    let config = &mut ctx.accounts.config;

    config.authority = ctx.accounts.payer.key();
    config.treasury = args.treasury;
    config.total_spaces = args.total_spaces;
    config.minted_spaces = 0;
    config.price_lamports = args.price_lamports;
    config.collection_mint = args.collection_mint.unwrap_or(Pubkey::default());
    config.bump = ctx.bumps.config;

    Ok(())
}
