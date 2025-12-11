use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount};

use crate::{error::ErrorCode, events::SpaceSettingsUpdated, state::Space};

/// Accounts for `update_space_settings`.
#[derive(Accounts)]
pub struct UpdateSpaceSettings<'info> {
    #[account(mut)]
    pub space: Account<'info, Space>,

    pub authority: Signer<'info>,

    /// Token account that must hold the NFT representing this space.
    #[account(
        constraint = nft_token_account.owner == authority.key() @ ErrorCode::NftOwnershipRequired,
        constraint = nft_token_account.mint == space.mint @ ErrorCode::NftOwnershipRequired,
        constraint = nft_token_account.amount == 1 @ ErrorCode::NftOwnershipRequired,
    )]
    pub nft_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

/// Arguments for `update_space_settings`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct UpdateSpaceSettingsArgs {
    pub name: Option<String>,
    pub description: Option<String>,
    pub is_open: Option<bool>,
    pub is_editable_by_others: Option<bool>,
}

/// Update editable settings for a space.
pub fn update_space_settings(
    ctx: Context<UpdateSpaceSettings>,
    args: UpdateSpaceSettingsArgs,
) -> Result<()> {
    let space = &mut ctx.accounts.space;
    let authority = &ctx.accounts.authority;

    // Sync on-chain owner with current NFT holder.
    space.owner = authority.key();

    if let Some(name) = args.name {
        require!(
            name.as_bytes().len() <= Space::NAME_MAX_LEN,
            ErrorCode::StringTooLong
        );
        space.name = name;
    }

    if let Some(description) = args.description {
        require!(
            description.as_bytes().len() <= Space::DESC_MAX_LEN,
            ErrorCode::StringTooLong
        );
        space.description = description;
    }

    if let Some(is_open) = args.is_open {
        space.is_open = is_open;
    }

    if let Some(is_editable_by_others) = args.is_editable_by_others {
        space.is_editable_by_others = is_editable_by_others;
    }

    emit!(SpaceSettingsUpdated {
        space_id: space.space_id,
        owner: space.owner,
    });

    Ok(())
}
