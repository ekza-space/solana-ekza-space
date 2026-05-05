use anchor_lang::prelude::*;
use anchor_spl::token::TokenAccount;

use crate::{error::ErrorCode, events::SpaceSettingsUpdated, state::Space};

/// Accounts for `update_space_settings`.
#[derive(Accounts)]
pub struct UpdateSpaceSettings<'info> {
    #[account(mut)]
    pub space: Account<'info, Space>,

    pub authority: Signer<'info>,

    /// Token account that must hold the NFT representing this space.
    pub nft_token_account: Account<'info, TokenAccount>,
}

/// Arguments for `update_space_settings`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct UpdateSpaceSettingsArgs {
    pub name: Option<String>,
    pub space_config_uri: Option<String>,
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
    let nft_token_account = &ctx.accounts.nft_token_account;

    require!(
        nft_token_account.mint == space.mint && nft_token_account.amount == 1,
        ErrorCode::InvalidNftTokenAccount
    );

    let is_nft_owner = nft_token_account.owner == authority.key();
    let can_edit_shared_state = is_nft_owner || space.is_editable_by_others;

    require!(can_edit_shared_state, ErrorCode::NftOwnershipRequired);

    if is_nft_owner {
        // Sync on-chain owner with current NFT holder.
        space.owner = authority.key();
    }

    if let Some(name) = args.name {
        require!(is_nft_owner, ErrorCode::OwnerOnlyField);
        require!(name.len() <= Space::NAME_MAX_LEN, ErrorCode::StringTooLong);
        space.name = name;
    }

    if let Some(space_config_uri) = args.space_config_uri {
        require!(
            space_config_uri.len() <= Space::DESC_MAX_LEN,
            ErrorCode::StringTooLong
        );
        space.space_config_uri = space_config_uri;
    }

    if let Some(is_open) = args.is_open {
        require!(is_nft_owner, ErrorCode::OwnerOnlyField);
        space.is_open = is_open;
    }

    if let Some(is_editable_by_others) = args.is_editable_by_others {
        require!(is_nft_owner, ErrorCode::OwnerOnlyField);
        space.is_editable_by_others = is_editable_by_others;
    }

    emit!(SpaceSettingsUpdated {
        space_id: space.space_id,
        owner: space.owner,
    });

    Ok(())
}
