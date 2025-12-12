use anchor_lang::prelude::*;
#[cfg(not(feature = "litesvm-test"))]
use anchor_spl::metadata::{
    self,
    mpl_token_metadata::types::{Collection, DataV2},
    CreateMetadataAccountsV3, Metadata,
};
use anchor_spl::token::spl_token::instruction::AuthorityType;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, MintTo, SetAuthority, Token, TokenAccount},
};

use crate::error::ErrorCode;
use crate::events::SpaceMinted;
use crate::state::{Config, Space};
use anchor_lang::Space as AnchorSpace;

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
        space = 8 + Space::INIT_SPACE,
        seeds = [b"space", config.key().as_ref(), &space_id.to_le_bytes()],
        bump
    )]
    pub space_pda: Account<'info, Space>,

    #[account(
        init,
        payer = payer,
        mint::decimals = 0,
        mint::authority = payer,
        mint::freeze_authority = payer
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

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,

    /// CHECK: Metaplex metadata account PDA for this mint.
    #[account(
        mut,
        seeds = [b"metadata", token_metadata_program.key().as_ref(), mint.key().as_ref()],
        bump,
        seeds::program = token_metadata_program.key()
    )]
    pub metadata_account: UncheckedAccount<'info>,

    #[cfg(not(feature = "litesvm-test"))]
    pub token_metadata_program: Program<'info, Metadata>,

    #[cfg(feature = "litesvm-test")]
    /// CHECK: In litesvm tests this is not an executable program; we only pass its pubkey.
    pub token_metadata_program: UncheckedAccount<'info>,
}

/// Mint a space with a specific `space_id` and create its PDA.
///
/// `space_id` must be within 1..=total_spaces and each id can only be minted once.
pub fn mint_next_space(
    ctx: Context<MintNextSpace>,
    space_id: u32,
    uri: Option<String>,
) -> Result<()> {
    #[cfg(feature = "litesvm-test")]
    let _ = uri;

    let config = &mut ctx.accounts.config;
    let payer = &ctx.accounts.payer;
    let mint = &ctx.accounts.mint;

    // Still enforce global supply limit.
    require!(
        config.minted_spaces < config.total_spaces,
        ErrorCode::AllSpacesMinted
    );

    // Allow users to choose any id within range, in any order.
    // Each `space_id` maps to a unique PDA, so duplicates are prevented at the account level.
    require!(
        space_id >= 1 && space_id <= config.total_spaces,
        ErrorCode::InvalidSpaceId
    );

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

    // Mint 1 NFT to payer's associated token account.
    let payer_token_account = &ctx.accounts.payer_token_account;

    let cpi_accounts = MintTo {
        mint: mint.to_account_info(),
        to: payer_token_account.to_account_info(),
        authority: payer.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
    token::mint_to(cpi_ctx, 1)?;

    let cpi_accounts = SetAuthority {
        account_or_mint: mint.to_account_info(),
        current_authority: payer.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
    token::set_authority(cpi_ctx, AuthorityType::MintTokens, None)?;

    let cpi_accounts = SetAuthority {
        account_or_mint: mint.to_account_info(),
        current_authority: payer.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
    token::set_authority(cpi_ctx, AuthorityType::FreezeAccount, None)?;

    // Create Metaplex metadata for this mint via anchor_spl::metadata CPI.
    // Disabled in litesvm-test builds.
    #[cfg(not(feature = "litesvm-test"))]
    {
        let name = format!("Ekza Space #{}", space_id);
        let symbol = "SPACE".to_string();
        let uri =
            uri.unwrap_or_else(|| format!("https://meta.ekza.space/spaces/{}.json", space_id));

        let collection = if config.collection_mint != Pubkey::default() {
            Some(Collection {
                key: config.collection_mint,
                verified: false,
            })
        } else {
            None
        };

        let data = DataV2 {
            name,
            symbol,
            uri,
            seller_fee_basis_points: 0,
            creators: None,
            collection,
            uses: None,
        };

        let cpi_accounts = CreateMetadataAccountsV3 {
            metadata: ctx.accounts.metadata_account.to_account_info(),
            mint: mint.to_account_info(),
            mint_authority: payer.to_account_info(),
            payer: payer.to_account_info(),
            update_authority: payer.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
            rent: ctx.accounts.rent.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_metadata_program.to_account_info(),
            cpi_accounts,
        );
        // Make metadata immutable so URI/name cannot be changed later.
        metadata::create_metadata_accounts_v3(cpi_ctx, data, false, true, None)?;
    }

    let space = &mut ctx.accounts.space_pda;

    space.space_id = space_id;
    space.mint = mint.key();
    space.owner = payer.key();
    space.name = String::new();
    space.space_config_uri = String::new();
    space.is_open = true;
    space.is_editable_by_others = false;
    space.bump = ctx.bumps.space_pda;
    space.reserved = [0u8; 32];

    // Track total number of minted spaces (no longer tied to last minted id).
    config.minted_spaces = config
        .minted_spaces
        .checked_add(1)
        .ok_or(ErrorCode::AllSpacesMinted)?;

    emit!(SpaceMinted {
        space_id,
        owner: space.owner,
        mint: space.mint,
    });

    Ok(())
}
