use anchor_lang::prelude::*;

use crate::{
    error::ErrorCode,
    events::SpaceMinted,
    state::{Config, Space},
};

/// Accounts for `mint_next_space`.
#[derive(Accounts)]
#[instruction(space_id: u32)]
pub struct MintNextSpace<'info> {
    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,

    #[account(
        init,
        payer = payer,
        space = 8 + Space::LEN,
        seeds = [b"space", config.key().as_ref(), &space_id.to_le_bytes()],
        bump
    )]
    pub space_pda: Account<'info, Space>,

    #[account(mut)]
    pub payer: Signer<'info>,

    /// Treasury must match the one configured in `Config`.
    #[account(
        mut,
        address = config.treasury @ ErrorCode::TreasuryMismatch
    )]
    pub treasury: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

/// Mint next available space and create its PDA.
///
/// `space_id` must equal `config.minted_spaces + 1` and be within 1..=total_spaces.
pub fn mint_next_space(ctx: Context<MintNextSpace>, space_id: u32, mint: Pubkey) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let payer = &ctx.accounts.payer;

    require!(config.minted_spaces < config.total_spaces, ErrorCode::AllSpacesMinted);

    let expected_id = config
        .minted_spaces
        .checked_add(1)
        .ok_or(ErrorCode::AllSpacesMinted)?;

    require!(space_id == expected_id, ErrorCode::InvalidSpaceId);

    // Transfer price from payer to treasury.
    let price = config.price_lamports;
    if price > 0 {
        let cpi_accounts = anchor_lang::system_program::Transfer {
            from: payer.to_account_info(),
            to: ctx.accounts.treasury.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(ctx.accounts.system_program.to_account_info(), cpi_accounts);
        anchor_lang::system_program::transfer(cpi_ctx, price)?;
    }

    let space = &mut ctx.accounts.space_pda;

    space.space_id = space_id;
    space.mint = mint;
    space.owner = payer.key();
    space.name = String::new();
    space.description = String::new();
    space.is_open = true;
    space.is_editable_by_others = false;
    space.bump = ctx.bumps.space_pda;
    space.reserved = [0u8; 32];

    config.minted_spaces = expected_id;

    emit!(SpaceMinted {
        space_id,
        owner: space.owner,
        mint: space.mint,
    });

    Ok(())
}
