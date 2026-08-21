## Solana Ekza Space

Anchor program that sells a finite collection of numbered "Spaces".
Each Space is a Metaplex 1/1 NFT (metadata + master edition) verified into a
sized collection, plus a PDA with on-chain settings gated by NFT ownership.

- **Program**: `solana_ekza_space` — `2WtuXG6AX3erRp6eK5WiSTEEBec5zprQ7qLyLENfMQEH`
- **PDAs**
  - `Config` — seeds `["config"]`. Singleton. Also the mint/update/collection authority for every NFT.
  - `Space` — seeds `["space_v1", config, space_id_le_u32]`
  - collection mint — seeds `["collection_v1", config]`
  - `MinterRecord` — seeds `["minter_v1", config, wallet]`

### Lifecycle

```
anchor deploy            (upgrade authority = deployer)
anchor run bootstrap     init_config  → create_collection   (deployer only)
                         ↓
users: mint_space(id)    1/1 NFT, verified collection, royalty, price → treasury
owner: update_space_settings(name, config_uri, is_open, editors)
admin: update_config / propose_authority + accept_authority / refresh_space_metadata
```

### Instructions

| Instruction | Signer | Notes |
|---|---|---|
| `init_config(args)` | **program upgrade authority** | One-shot. `total_spaces`, `price_lamports`, `treasury`, `royalty_bps` (≤ 2000), `max_per_wallet` (0 = unlimited), `base_uri` (`https://` or `ipfs://`). |
| `create_collection()` | config authority | One-shot. Sized collection NFT; update + collection authority = `Config` PDA. Required before any mint. |
| `mint_space(space_id)` | anyone | `1 ≤ id ≤ total_spaces`, each id once. Rejects when `paused`, over `max_per_wallet`, or sold out. URI = `{base_uri}{id}.json` — callers cannot supply their own. Mint → metadata → master edition → `verify_sized_collection_item`, all signed by the `Config` PDA. Price transferred to `treasury`. |
| `update_space_settings(args)` | NFT holder or editor | Holder: everything. Editor: `space_config_uri` only. When the NFT changes hands the editor list is wiped on the new holder's first action, and stale editors are rejected before that. |
| `update_config(args)` | config authority | `price`, `treasury`, `paused`, `max_per_wallet`, `base_uri` (future mints + refresh). |
| `propose_authority(new)` / `accept_authority()` | authority / pending | Two-step transfer. `Pubkey::default()` cancels. |
| `refresh_space_metadata()` | config authority | Rewrites one NFT's URI/royalty/creators from current config. Repair path; collection stays verified. |

NFT metadata: name `Ekza Space #N`, symbol `SPACE`, `seller_fee_basis_points = royalty_bps`,
creators `[Config PDA (verified, 0%), treasury (100%)]`, `is_mutable = true`, update authority = `Config` PDA.

### Events

`SpaceMinted`, `SpaceSettingsUpdated`, `ConfigUpdated`, `CollectionCreated`,
`AuthorityTransferProposed`, `AuthorityTransferred`, `SpaceMetadataRefreshed`.

### Tests

```bash
anchor run litesvm        # build + 16 tests in LiteSVM
```

Tests load the **real** Metaplex Token Metadata program from
`tests/fixtures/mpl_token_metadata.so` (dumped from mainnet with
`solana program dump metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s`), so the
full mint path — metadata, master edition, collection verification — runs in CI.
There is no test-only code path in the program.

LiteSVM loads programs under the non-upgradeable loader, so the
upgrade-authority gate on `init_config` is skipped there; verify it on a
local validator / devnet with `anchor run bootstrap` (see below).

### Deploy

```bash
# 1. build + deploy (deployer keypair becomes upgrade authority)
anchor build
anchor deploy --provider.cluster devnet

# 2. bootstrap config + collection (must be signed by the upgrade authority)
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
ANCHOR_WALLET=~/.config/solana/id.json \
SPACES_TOTAL=256 SPACES_PRICE_SOL=0.5 SPACES_ROYALTY_BPS=500 SPACES_MAX_PER_WALLET=2 \
SPACES_TREASURY=<treasury pubkey> \
SPACES_BASE_URI=https://space.ekza.io/api/meta/ \
anchor run bootstrap        # writes deployments/devnet.json

anchor run status           # config + minted ids
```

Mainnet checklist: treasury ≠ deployer, move config authority to a multisig via
`propose_authority`/`accept_authority`, then set the program upgrade authority to
the same multisig (`solana program set-upgrade-authority`).

### SDK

`sdk/ekzaSpaceClient.ts` — `EkzaSpaceClient` with PDA helpers, `initConfig`,
`createCollection`, `mintSpace` / `buildMintSpaceTx` (for browser wallets),
`updateSpaceSettings`, `updateConfig`, `proposeAuthority`, `acceptAuthority`,
`refreshSpaceMetadata`. Mint transactions request 400k CU.
