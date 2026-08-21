use anchor_lang::prelude::*;

/// Seed for global config PDA.
#[constant]
pub const CONFIG_SEED: &[u8] = b"config";

/// Seed root for all space PDAs.
/// Versioned so we can change layout in the future if needed.
#[constant]
pub const SPACE_SEED_ROOT: &[u8] = b"space_v1";

/// Seed for the collection mint PDA (one per config).
#[constant]
pub const COLLECTION_SEED: &[u8] = b"collection_v1";

/// Seed for per-wallet mint counters.
#[constant]
pub const MINTER_SEED: &[u8] = b"minter_v1";

/// On-chain NFT name/symbol for spaces.
pub const SPACE_SYMBOL: &str = "SPACE";
pub const SPACE_NAME_PREFIX: &str = "Ekza Space #";
pub const COLLECTION_NAME: &str = "Ekza Spaces";
pub const COLLECTION_URI_FILE: &str = "collection.json";

/// Upper bound for secondary-sale royalty (basis points).
pub const MAX_ROYALTY_BPS: u16 = 2_000;
