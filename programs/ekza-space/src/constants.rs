use anchor_lang::prelude::*;

/// Seed for global config PDA.
#[constant]
pub const CONFIG_SEED: &[u8] = b"config";

/// Seed root for all space PDAs.
/// Versioned so we can change layout in the future if needed.
#[constant]
pub const SPACE_SEED_ROOT: &[u8] = b"space_v1";
