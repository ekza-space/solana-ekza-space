## Solana Ekza Space

Minimal Anchor program that manages a finite collection of numbered "Spaces".  
Each Space is represented by a Metaplex NFT + a PDA with on-chain settings.

### Program

- **Program name**: `solana_ekza_space`
- **Main PDAs**:
  - **Config**: seeds = `["config"]`
  - **Space**: seeds = `["space", config_pubkey, space_id_le_bytes]`

### Instructions (API)

- **init_config**
  - **Accounts**:
    - `config` (`Config`, init, seeds = `["config"]`)
    - `payer` (`Signer`, pays rent, becomes `authority`)
    - `system_program`
  - **Args**:
    - `total_spaces: u32`
    - `price_lamports: u64`
    - `treasury: Pubkey`
    - `collection_mint: Option<Pubkey>`

- **update_config**
  - **Accounts**:
    - `config` (`Config`, mut, `has_one = authority`)
    - `authority` (`Signer`)
  - **Args**:
    - `new_price_lamports: Option<u64>`
    - `new_treasury: Option<Pubkey>`

- **mint_next_space**
  - Mints next available space (ID = `config.minted_spaces + 1`), creates `Space` PDA and a 1/1 NFT, and transfers SOL to `treasury`.
  - **Accounts**:
    - `config` (`Config`, mut)
    - `space_pda` (`Space`, init, seeds = `["space", config, space_id_le]`)
    - `mint` (`Mint`, init, decimals = 0, authority = `payer`)
    - `payer_token_account` (ATA for `mint` and `payer`)
    - `payer` (`Signer`)
    - `treasury` (`SystemAccount`, mut, must equal `config.treasury`)
    - `system_program`
    - `token_program`
    - `associated_token_program`
    - `rent`
    - `metadata_account` (Metaplex metadata PDA for `mint`)
    - `token_metadata_program` (Metaplex program, or unchecked in litesvm tests)
  - **Args**:
    - `space_id: u32` (must equal `config.minted_spaces + 1`)
    - `uri: Option<String>` (optional custom NFT metadata URI; defaults to `https://meta.ekza.space/spaces/{space_id}.json`)

- **update_space_settings**
  - Updates editable settings of a Space. Access is gated by NFT ownership.
  - **Accounts**:
    - `space` (`Space`, mut)
    - `authority` (`Signer`)
    - `nft_token_account` (`TokenAccount`, must be owned by `authority`, mint == `space.mint`, amount == 1)
  - **Args**:
    - `name: Option<String>`
    - `space_config_uri: Option<String>` (e.g. IPFS JSON describing the space)
    - `is_open: Option<bool>`
    - `is_editable_by_others: Option<bool>`

### Events

- `SpaceMinted { space_id, owner, mint }`
- `SpaceSettingsUpdated { space_id, owner }`
- `ConfigUpdated { price_lamports, treasury }`

### Running tests (LiteSVM)

- Prerequisites: Node, Yarn, Anchor CLI.
- From project root:

```bash
anchor build
anchor run litesvm
```

This builds the program with the `litesvm-test` feature and runs `tests/ekza-space.ts` against an in-process LiteSVM validator.