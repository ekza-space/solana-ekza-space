use anchor_lang::prelude::*;

/// Program errors.
#[error_code]
pub enum ErrorCode {
    #[msg("All spaces are already minted")]
    AllSpacesMinted,
    #[msg("Not a space owner")]
    NotSpaceOwner,
    #[msg("Invalid space id")]
    InvalidSpaceId,
    #[msg("Treasury account does not match config")]
    TreasuryMismatch,
    #[msg("String value is too long")]
    StringTooLong,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("NFT ownership is required")]
    NftOwnershipRequired,
    #[msg("Total spaces must be greater than zero")]
    InvalidTotalSpaces,
}


