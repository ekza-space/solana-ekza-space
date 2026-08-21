use anchor_lang::prelude::*;
use anchor_spl::token::TokenAccount;

use crate::constants::{CONFIG_SEED, SPACE_SEED_ROOT};
use crate::{error::ErrorCode, events::SpaceSettingsUpdated, state::Config, state::Space};

/// Accounts for `update_space_settings`.
#[derive(Accounts)]
pub struct UpdateSpaceSettings<'info> {
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [SPACE_SEED_ROOT, config.key().as_ref(), &space.space_id.to_le_bytes()],
        bump = space.bump,
    )]
    pub space: Account<'info, Space>,

    pub authority: Signer<'info>,

    /// Token account that must hold the NFT representing this space.
    #[account(
        constraint = nft_token_account.mint == space.mint @ ErrorCode::InvalidNftTokenAccount,
        constraint = nft_token_account.amount == 1 @ ErrorCode::InvalidNftTokenAccount,
    )]
    pub nft_token_account: Account<'info, TokenAccount>,
}

/// Arguments for `update_space_settings`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct UpdateSpaceSettingsArgs {
    pub name: Option<String>,
    pub space_config_uri: Option<String>,
    pub is_open: Option<bool>,
    pub add_editor: Option<Pubkey>,
    pub remove_editor: Option<Pubkey>,
}

/// Update editable settings for a space.
///
/// The current NFT holder may change everything. Addresses in `editors` may
/// only change `space_config_uri`. When the NFT changes hands the editor list
/// is wiped the first time the new holder acts, so a seller cannot keep a
/// backdoor into a space they no longer own.
pub fn update_space_settings(
    ctx: Context<UpdateSpaceSettings>,
    args: UpdateSpaceSettingsArgs,
) -> Result<()> {
    let space = &mut ctx.accounts.space;
    let authority = &ctx.accounts.authority;
    let nft_token_account = &ctx.accounts.nft_token_account;

    let is_nft_owner = nft_token_account.owner == authority.key();

    if is_nft_owner && space.owner != authority.key() {
        // NFT was transferred: sync owner and drop every editor granted by the previous holder.
        space.owner = authority.key();
        space.editors.clear();
    }

    // Editors granted by the *current* on-chain owner only. If the NFT moved and
    // the new holder has not acted yet, the stale list must not authorize anyone.
    let is_editor =
        space.owner == nft_token_account.owner && space.editors.contains(&authority.key());

    require!(is_nft_owner || is_editor, ErrorCode::NftOwnershipRequired);

    if let Some(name) = args.name {
        require!(is_nft_owner, ErrorCode::OwnerOnlyField);
        require!(name.len() <= Space::NAME_MAX_LEN, ErrorCode::StringTooLong);
        space.name = name;
    }

    if let Some(space_config_uri) = args.space_config_uri {
        require!(
            space_config_uri.len() <= Space::URI_MAX_LEN,
            ErrorCode::StringTooLong
        );
        space.space_config_uri = space_config_uri;
    }

    if let Some(is_open) = args.is_open {
        require!(is_nft_owner, ErrorCode::OwnerOnlyField);
        space.is_open = is_open;
    }

    if let Some(editor) = args.add_editor {
        require!(is_nft_owner, ErrorCode::OwnerOnlyField);
        require!(
            space.editors.len() < Space::MAX_EDITORS,
            ErrorCode::TooManyEditors
        );
        require!(
            !space.editors.contains(&editor),
            ErrorCode::EditorAlreadyExists
        );
        space.editors.push(editor);
    }

    if let Some(editor) = args.remove_editor {
        require!(is_nft_owner, ErrorCode::OwnerOnlyField);
        let index = space
            .editors
            .iter()
            .position(|existing_editor| *existing_editor == editor)
            .ok_or(ErrorCode::EditorNotFound)?;
        space.editors.remove(index);
    }

    emit!(SpaceSettingsUpdated {
        space_id: space.space_id,
        owner: space.owner,
        by: authority.key(),
    });

    Ok(())
}
