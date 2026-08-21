use anchor_lang::prelude::*;

use crate::constants::CONFIG_SEED;
use crate::error::ErrorCode;
use crate::events::{AuthorityTransferProposed, AuthorityTransferred};
use crate::state::Config;

/// Accounts for `propose_authority`.
#[derive(Accounts)]
pub struct ProposeAuthority<'info> {
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = authority @ ErrorCode::Unauthorized,
    )]
    pub config: Account<'info, Config>,

    pub authority: Signer<'info>,
}

/// Step 1 of the two-step authority transfer. Pass `Pubkey::default()` to cancel.
pub fn propose_authority(ctx: Context<ProposeAuthority>, new_authority: Pubkey) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.pending_authority = new_authority;

    emit!(AuthorityTransferProposed {
        current: config.authority,
        pending: new_authority,
    });

    Ok(())
}

/// Accounts for `accept_authority`.
#[derive(Accounts)]
pub struct AcceptAuthority<'info> {
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,

    pub new_authority: Signer<'info>,
}

/// Step 2 of the two-step authority transfer. Must be signed by the pending authority.
pub fn accept_authority(ctx: Context<AcceptAuthority>) -> Result<()> {
    let config = &mut ctx.accounts.config;

    require!(
        config.pending_authority != Pubkey::default(),
        ErrorCode::NoPendingAuthority
    );
    require_keys_eq!(
        config.pending_authority,
        ctx.accounts.new_authority.key(),
        ErrorCode::NotPendingAuthority
    );

    let previous = config.authority;
    config.authority = config.pending_authority;
    config.pending_authority = Pubkey::default();

    emit!(AuthorityTransferred {
        previous,
        current: config.authority,
    });

    Ok(())
}
