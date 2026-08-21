use anchor_lang::prelude::*;

/// Program errors.
#[error_code]
pub enum ErrorCode {
    #[msg("All spaces are already minted")]
    AllSpacesMinted,
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
    #[msg("Only the NFT owner can update this field")]
    OwnerOnlyField,
    #[msg("Provided NFT token account does not match this space")]
    InvalidNftTokenAccount,
    #[msg("Editor list is full")]
    TooManyEditors,
    #[msg("Editor is already allowed")]
    EditorAlreadyExists,
    #[msg("Editor is not allowed")]
    EditorNotFound,
    #[msg("Minting is paused")]
    MintingPaused,
    #[msg("Per-wallet mint limit reached")]
    MintLimitReached,
    #[msg("Royalty exceeds the allowed maximum")]
    InvalidRoyaltyBps,
    #[msg("Base URI must start with https:// or ipfs://")]
    InvalidBaseUri,
    #[msg("Collection has already been created")]
    CollectionAlreadyCreated,
    #[msg("Collection has not been created yet")]
    CollectionNotCreated,
    #[msg("Collection accounts do not match config")]
    CollectionMismatch,
    #[msg("Signer is not the program upgrade authority")]
    NotUpgradeAuthority,
    #[msg("Program data account is missing or invalid")]
    InvalidProgramData,
    #[msg("No pending authority transfer")]
    NoPendingAuthority,
    #[msg("Signer is not the pending authority")]
    NotPendingAuthority,
}
