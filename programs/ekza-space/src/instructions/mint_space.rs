use anchor_lang::prelude::*;
use anchor_lang::Space as AnchorSpace;
use anchor_spl::metadata::{
    self,
    mpl_token_metadata::types::{Collection, Creator, DataV2},
    CreateMasterEditionV3, CreateMetadataAccountsV3, Metadata, VerifySizedCollectionItem,
};
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, MintTo, Token, TokenAccount},
};

use crate::constants::{
    CONFIG_SEED, MINTER_SEED, SPACE_NAME_PREFIX, SPACE_SEED_ROOT, SPACE_SYMBOL,
};
use crate::error::ErrorCode;
use crate::events::SpaceMinted;
use crate::state::{Config, MinterRecord, Space};

/// Accounts for `mint_space`.
#[derive(Accounts)]
#[instruction(space_id: u32)]
pub struct MintSpace<'info> {
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,

    #[account(
        init,
        payer = payer,
        space = 8 + Space::INIT_SPACE,
        seeds = [SPACE_SEED_ROOT, config.key().as_ref(), &space_id.to_le_bytes()],
        bump
    )]
    pub space_pda: Account<'info, Space>,

    #[account(
        init_if_needed,
        payer = payer,
        space = 8 + MinterRecord::INIT_SPACE,
        seeds = [MINTER_SEED, config.key().as_ref(), payer.key().as_ref()],
        bump
    )]
    pub minter_record: Account<'info, MinterRecord>,

    /// Mint and freeze authority start as the config PDA; the master edition
    /// CPI takes both over, so nobody can ever mint a second token.
    #[account(
        init,
        payer = payer,
        mint::decimals = 0,
        mint::authority = config,
        mint::freeze_authority = config,
    )]
    pub mint: Account<'info, Mint>,

    #[account(
        init,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = payer
    )]
    pub payer_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub payer: Signer<'info>,

    /// Treasury must match the one configured in `Config`.
    #[account(
        mut,
        address = config.treasury @ ErrorCode::TreasuryMismatch
    )]
    pub treasury: SystemAccount<'info>,

    /// CHECK: Metaplex metadata PDA for this mint, validated by seeds.
    #[account(
        mut,
        seeds = [b"metadata", token_metadata_program.key().as_ref(), mint.key().as_ref()],
        bump,
        seeds::program = token_metadata_program.key()
    )]
    pub metadata_account: UncheckedAccount<'info>,

    /// CHECK: Metaplex master edition PDA for this mint, validated by seeds.
    #[account(
        mut,
        seeds = [b"metadata", token_metadata_program.key().as_ref(), mint.key().as_ref(), b"edition"],
        bump,
        seeds::program = token_metadata_program.key()
    )]
    pub master_edition: UncheckedAccount<'info>,

    #[account(
        address = config.collection_mint @ ErrorCode::CollectionMismatch
    )]
    pub collection_mint: Account<'info, Mint>,

    /// CHECK: Collection metadata PDA, validated by seeds. Mutable: Metaplex bumps the size.
    #[account(
        mut,
        seeds = [b"metadata", token_metadata_program.key().as_ref(), collection_mint.key().as_ref()],
        bump,
        seeds::program = token_metadata_program.key()
    )]
    pub collection_metadata: UncheckedAccount<'info>,

    /// CHECK: Collection master edition PDA, validated by seeds.
    #[account(
        seeds = [b"metadata", token_metadata_program.key().as_ref(), collection_mint.key().as_ref(), b"edition"],
        bump,
        seeds::program = token_metadata_program.key()
    )]
    pub collection_master_edition: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_metadata_program: Program<'info, Metadata>,
    pub rent: Sysvar<'info, Rent>,
}

/// Mint a space with a specific `space_id`.
///
/// `space_id` must be within 1..=total_spaces; each id maps to a unique PDA,
/// so it can only be minted once. The metadata URI is derived from
/// `Config::base_uri` — minters cannot inject their own.
pub fn mint_space(ctx: Context<MintSpace>, space_id: u32) -> Result<()> {
    let config = &ctx.accounts.config;
    let payer = &ctx.accounts.payer;

    require!(!config.paused, ErrorCode::MintingPaused);
    require!(config.has_collection(), ErrorCode::CollectionNotCreated);
    require!(
        config.minted_spaces < config.total_spaces,
        ErrorCode::AllSpacesMinted
    );
    require!(
        space_id >= 1 && space_id <= config.total_spaces,
        ErrorCode::InvalidSpaceId
    );

    // Per-wallet limit.
    let minter = &mut ctx.accounts.minter_record;
    if minter.wallet == Pubkey::default() {
        minter.wallet = payer.key();
        minter.bump = ctx.bumps.minter_record;
    }
    if config.max_per_wallet > 0 {
        require!(
            minter.minted < config.max_per_wallet,
            ErrorCode::MintLimitReached
        );
    }
    minter.minted = minter
        .minted
        .checked_add(1)
        .ok_or(ErrorCode::MintLimitReached)?;

    // Transfer price from payer to treasury.
    let price = config.price_lamports;
    if price > 0 {
        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: payer.to_account_info(),
                    to: ctx.accounts.treasury.to_account_info(),
                },
            ),
            price,
        )?;
    }

    let bump = config.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[CONFIG_SEED, &[bump]]];

    // 1. Mint exactly one token to the payer.
    token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.payer_token_account.to_account_info(),
                authority: config.to_account_info(),
            },
            signer_seeds,
        ),
        1,
    )?;

    // 2. Metadata. Mutable so the authority can repair URIs; update authority = config PDA.
    let data = DataV2 {
        name: format!("{}{}", SPACE_NAME_PREFIX, space_id),
        symbol: SPACE_SYMBOL.to_string(),
        uri: config.space_uri(space_id),
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
        collection: Some(Collection {
            key: config.collection_mint,
            verified: false,
        }),
        uses: None,
    };

    metadata::create_metadata_accounts_v3(
        CpiContext::new_with_signer(
            ctx.accounts.token_metadata_program.to_account_info(),
            CreateMetadataAccountsV3 {
                metadata: ctx.accounts.metadata_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                mint_authority: config.to_account_info(),
                payer: payer.to_account_info(),
                update_authority: config.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
                rent: ctx.accounts.rent.to_account_info(),
            },
            signer_seeds,
        ),
        data,
        true,
        true,
        None,
    )?;

    // 3. Master edition: true 1/1, revokes mint + freeze authority.
    metadata::create_master_edition_v3(
        CpiContext::new_with_signer(
            ctx.accounts.token_metadata_program.to_account_info(),
            CreateMasterEditionV3 {
                edition: ctx.accounts.master_edition.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                update_authority: config.to_account_info(),
                mint_authority: config.to_account_info(),
                payer: payer.to_account_info(),
                metadata: ctx.accounts.metadata_account.to_account_info(),
                token_program: ctx.accounts.token_program.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
                rent: ctx.accounts.rent.to_account_info(),
            },
            signer_seeds,
        ),
        Some(0),
    )?;

    // 4. Verify into the sized collection (config PDA is the collection authority).
    metadata::verify_sized_collection_item(
        CpiContext::new_with_signer(
            ctx.accounts.token_metadata_program.to_account_info(),
            VerifySizedCollectionItem {
                payer: payer.to_account_info(),
                metadata: ctx.accounts.metadata_account.to_account_info(),
                collection_authority: config.to_account_info(),
                collection_mint: ctx.accounts.collection_mint.to_account_info(),
                collection_metadata: ctx.accounts.collection_metadata.to_account_info(),
                collection_master_edition: ctx.accounts.collection_master_edition.to_account_info(),
            },
            signer_seeds,
        ),
        None,
    )?;

    let space = &mut ctx.accounts.space_pda;
    space.space_id = space_id;
    space.mint = ctx.accounts.mint.key();
    space.owner = payer.key();
    space.name = String::new();
    space.space_config_uri = String::new();
    space.is_open = true;
    space.editors = Vec::new();
    space.bump = ctx.bumps.space_pda;
    space.reserved = [0u8; 32];

    let config = &mut ctx.accounts.config;
    config.minted_spaces = config
        .minted_spaces
        .checked_add(1)
        .ok_or(ErrorCode::AllSpacesMinted)?;

    emit!(SpaceMinted {
        space_id,
        owner: space.owner,
        mint: space.mint,
        price_lamports: price,
    });

    Ok(())
}
