use anchor_lang::prelude::*;
use anchor_spl::metadata::{
    self,
    mpl_token_metadata::types::{Collection, Creator, DataV2},
    Metadata, UpdateMetadataAccountsV2,
};
use anchor_spl::token::Mint;

use crate::constants::{CONFIG_SEED, SPACE_NAME_PREFIX, SPACE_SEED_ROOT, SPACE_SYMBOL};
use crate::error::ErrorCode;
use crate::events::SpaceMetadataRefreshed;
use crate::state::{Config, Space};

/// Accounts for `refresh_space_metadata`.
///
/// Authority-only repair path: rewrites a space's on-chain metadata
/// (URI, royalty, creators) from the current `Config`. Exists so a bad
/// `base_uri` or a treasury change never leaves sold NFTs broken.
#[derive(Accounts)]
pub struct RefreshSpaceMetadata<'info> {
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = authority @ ErrorCode::Unauthorized,
    )]
    pub config: Account<'info, Config>,

    pub authority: Signer<'info>,

    #[account(
        seeds = [SPACE_SEED_ROOT, config.key().as_ref(), &space.space_id.to_le_bytes()],
        bump = space.bump,
        has_one = mint @ ErrorCode::InvalidNftTokenAccount,
    )]
    pub space: Account<'info, Space>,

    pub mint: Account<'info, Mint>,

    /// CHECK: Metaplex metadata PDA for this mint, validated by seeds.
    #[account(
        mut,
        seeds = [b"metadata", token_metadata_program.key().as_ref(), mint.key().as_ref()],
        bump,
        seeds::program = token_metadata_program.key()
    )]
    pub metadata_account: UncheckedAccount<'info>,

    pub token_metadata_program: Program<'info, Metadata>,
}

pub fn refresh_space_metadata(ctx: Context<RefreshSpaceMetadata>) -> Result<()> {
    let config = &ctx.accounts.config;
    let space = &ctx.accounts.space;
    require!(config.has_collection(), ErrorCode::CollectionNotCreated);

    let uri = config.space_uri(space.space_id);
    let data = DataV2 {
        name: format!("{}{}", SPACE_NAME_PREFIX, space.space_id),
        symbol: SPACE_SYMBOL.to_string(),
        uri: uri.clone(),
        seller_fee_basis_points: config.royalty_bps,
        creators: Some(vec![
            Creator {
                address: config.key(),
                verified: true,
                share: 0,
            },
            Creator {
                address: config.treasury,
                verified: false,
                share: 100,
            },
        ]),
        // Must echo the existing verified collection; Metaplex rejects anything else.
        collection: Some(Collection {
            key: config.collection_mint,
            verified: true,
        }),
        uses: None,
    };

    let bump = config.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[CONFIG_SEED, &[bump]]];

    metadata::update_metadata_accounts_v2(
        CpiContext::new_with_signer(
            ctx.accounts.token_metadata_program.to_account_info(),
            UpdateMetadataAccountsV2 {
                metadata: ctx.accounts.metadata_account.to_account_info(),
                update_authority: config.to_account_info(),
            },
            signer_seeds,
        ),
        None,
        Some(data),
        None,
        None,
    )?;

    emit!(SpaceMetadataRefreshed {
        space_id: space.space_id,
        uri,
    });

    Ok(())
}
