use anchor_lang::prelude::*;
use anchor_lang::Space as AnchorSpace;

use crate::constants::{CONFIG_SEED, MAX_ROYALTY_BPS};
use crate::error::ErrorCode;
use crate::state::{Config, BASE_URI_MAX_LEN};

/// Accounts for `init_config`.
///
/// Only the program upgrade authority may initialize the config. This closes the
/// deploy → init race: nobody else can claim the singleton `Config` PDA.
/// For programs owned by a non-upgradeable loader (no ProgramData exists) the
/// check is skipped; `Config` can still only be created once.
#[derive(Accounts)]
pub struct InitConfig<'info> {
    #[account(
        init,
        payer = payer,
        seeds = [CONFIG_SEED],
        bump,
        space = 8 + Config::INIT_SPACE
    )]
    pub config: Account<'info, Config>,

    #[account(mut)]
    pub payer: Signer<'info>,

    /// This program's own account, used to locate ProgramData.
    pub program: Program<'info, crate::program::SolanaEkzaSpace>,

    /// ProgramData of this program. Required when the program is upgradeable.
    pub program_data: Option<Account<'info, ProgramData>>,

    pub system_program: Program<'info, System>,
}

/// Arguments for `init_config`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitConfigArgs {
    pub total_spaces: u32,
    pub price_lamports: u64,
    pub treasury: Pubkey,
    pub royalty_bps: u16,
    pub max_per_wallet: u16,
    pub base_uri: String,
}

pub fn validate_base_uri(base_uri: &str) -> Result<()> {
    require!(base_uri.len() <= BASE_URI_MAX_LEN, ErrorCode::StringTooLong);
    require!(
        base_uri.starts_with("https://") || base_uri.starts_with("ipfs://"),
        ErrorCode::InvalidBaseUri
    );
    Ok(())
}

/// Initialize global config PDA.
pub fn init_config(ctx: Context<InitConfig>, args: InitConfigArgs) -> Result<()> {
    let payer = &ctx.accounts.payer;

    if let Some(programdata_address) = ctx.accounts.program.programdata_address()? {
        let program_data = ctx
            .accounts
            .program_data
            .as_ref()
            .ok_or(ErrorCode::InvalidProgramData)?;
        require_keys_eq!(
            program_data.key(),
            programdata_address,
            ErrorCode::InvalidProgramData
        );
        require!(
            program_data.upgrade_authority_address == Some(payer.key()),
            ErrorCode::NotUpgradeAuthority
        );
    }

    require!(args.total_spaces > 0, ErrorCode::InvalidTotalSpaces);
    require!(
        args.royalty_bps <= MAX_ROYALTY_BPS,
        ErrorCode::InvalidRoyaltyBps
    );
    validate_base_uri(&args.base_uri)?;

    let config = &mut ctx.accounts.config;

    config.authority = payer.key();
    config.pending_authority = Pubkey::default();
    config.treasury = args.treasury;
    config.collection_mint = Pubkey::default();
    config.total_spaces = args.total_spaces;
    config.minted_spaces = 0;
    config.price_lamports = args.price_lamports;
    config.royalty_bps = args.royalty_bps;
    config.max_per_wallet = args.max_per_wallet;
    config.paused = false;
    config.base_uri = args.base_uri;
    config.bump = ctx.bumps.config;
    config.reserved = [0u8; 64];

    Ok(())
}
