use anchor_lang::prelude::*;
use anchor_spl::metadata::{
    self,
    mpl_token_metadata::types::{CollectionDetails, Creator, DataV2},
    CreateMasterEditionV3, CreateMetadataAccountsV3, Metadata,
};
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, MintTo, Token, TokenAccount},
};

use crate::constants::{
    COLLECTION_NAME, COLLECTION_SEED, COLLECTION_URI_FILE, CONFIG_SEED, SPACE_SYMBOL,
};
use crate::error::ErrorCode;
use crate::events::CollectionCreated;
use crate::state::Config;

/// Accounts for `create_collection`.
///
/// Creates the sized collection NFT that every space is verified into.
/// Mint, metadata update authority and collection authority are all the
/// `Config` PDA, so the program itself can verify items and fix metadata.
#[derive(Accounts)]
pub struct CreateCollection<'info> {
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = authority @ ErrorCode::Unauthorized,
    )]
    pub config: Account<'info, Config>,

    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        seeds = [COLLECTION_SEED, config.key().as_ref()],
        bump,
        mint::decimals = 0,
        mint::authority = config,
        mint::freeze_authority = config,
    )]
    pub collection_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = authority,
        associated_token::mint = collection_mint,
        associated_token::authority = authority,
    )]
    pub collection_token_account: Account<'info, TokenAccount>,

    /// CHECK: Metaplex metadata PDA, validated by seeds.
    #[account(
        mut,
        seeds = [b"metadata", token_metadata_program.key().as_ref(), collection_mint.key().as_ref()],
        bump,
        seeds::program = token_metadata_program.key(),
    )]
    pub collection_metadata: UncheckedAccount<'info>,

    /// CHECK: Metaplex master edition PDA, validated by seeds.
    #[account(
        mut,
        seeds = [
            b"metadata",
            token_metadata_program.key().as_ref(),
            collection_mint.key().as_ref(),
            b"edition",
        ],
        bump,
        seeds::program = token_metadata_program.key(),
    )]
    pub collection_master_edition: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_metadata_program: Program<'info, Metadata>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn create_collection(ctx: Context<CreateCollection>) -> Result<()> {
    let config = &ctx.accounts.config;
    require!(
        !config.has_collection(),
        ErrorCode::CollectionAlreadyCreated
    );

    let bump = config.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[CONFIG_SEED, &[bump]]];

    // 1. Mint the single collection token to the authority.
    token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.collection_mint.to_account_info(),
                to: ctx.accounts.collection_token_account.to_account_info(),
                authority: config.to_account_info(),
            },
            signer_seeds,
        ),
        1,
    )?;

    // 2. Metadata (mutable, sized collection, update authority = config PDA).
    let data = DataV2 {
        name: COLLECTION_NAME.to_string(),
        symbol: SPACE_SYMBOL.to_string(),
        uri: format!("{}{}", config.base_uri, COLLECTION_URI_FILE),
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
        collection: None,
        uses: None,
    };

    metadata::create_metadata_accounts_v3(
        CpiContext::new_with_signer(
            ctx.accounts.token_metadata_program.to_account_info(),
            CreateMetadataAccountsV3 {
                metadata: ctx.accounts.collection_metadata.to_account_info(),
                mint: ctx.accounts.collection_mint.to_account_info(),
                mint_authority: config.to_account_info(),
                payer: ctx.accounts.authority.to_account_info(),
                update_authority: config.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
                rent: ctx.accounts.rent.to_account_info(),
            },
            signer_seeds,
        ),
        data,
        true,
        true,
        Some(CollectionDetails::V1 { size: 0 }),
    )?;

    // 3. Master edition (max_supply = 0 → true 1/1, takes over mint/freeze authority).
    metadata::create_master_edition_v3(
        CpiContext::new_with_signer(
            ctx.accounts.token_metadata_program.to_account_info(),
            CreateMasterEditionV3 {
                edition: ctx.accounts.collection_master_edition.to_account_info(),
                mint: ctx.accounts.collection_mint.to_account_info(),
                update_authority: config.to_account_info(),
                mint_authority: config.to_account_info(),
                payer: ctx.accounts.authority.to_account_info(),
                metadata: ctx.accounts.collection_metadata.to_account_info(),
                token_program: ctx.accounts.token_program.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
                rent: ctx.accounts.rent.to_account_info(),
            },
            signer_seeds,
        ),
        Some(0),
    )?;

    let config = &mut ctx.accounts.config;
    config.collection_mint = ctx.accounts.collection_mint.key();

    emit!(CollectionCreated {
        collection_mint: config.collection_mint,
    });

    Ok(())
}
