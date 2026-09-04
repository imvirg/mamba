# MAMBA audit readiness

MAMBA is not a security under current SEC staff guidance (Feb 2025), so no
certification is legally required to launch. This document exists for
_voluntary_ verification — the kind CertiK/SolidProof-style audits, and any
holder checking the project themselves, would look for. Every claim below is
independently checkable on-chain; none of it should be taken on trust.

**Status: template.** The invariants and mechanism below are final and
already implemented in `scripts/create-coin.ts`. The mint address, launch
transaction signatures, and multisig membership/threshold are placeholders
until MAMBA actually launches on mainnet-beta — fill those in at that point.

## Token

|                    |                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------- |
| Name / symbol      | MAMBA                                                                               |
| Standard           | Token-2022 (`TOKEN_2022_PROGRAM_ID`), with the `TransferFeeConfig` extension        |
| Supply             | Fixed at launch — TBD (set via `SUPPLY` at mint time, see `scripts/create-coin.ts`) |
| Decimals           | TBD                                                                                 |
| Mint address       | **TBD — fill in at mainnet launch**                                                 |
| Launch transaction | **TBD — fill in at mainnet launch**                                                 |

## Authority invariants

These are the claims a holder or auditor should verify, and how the code
guarantees each one:

1. **Mint authority is revoked.** No one — not the team, not the multisig —
   can ever mint additional supply. `scripts/create-coin.ts` mints the full
   supply once, then immediately calls `createSetAuthorityInstruction` with
   `AuthorityType.MintTokens` and a `null` new authority, in the same launch
   flow (not a separate manual step that could be forgotten or skipped).
2. **Freeze authority was never set.** No account holding MAMBA can ever be
   frozen. This is passed as `null` at mint creation — the authority is never
   granted in the first place, rather than granted and later revoked, so
   there's no window where it existed.
3. **Transfer-fee-config and withdraw-withheld authority are held by a
   Squads multisig, not a hot wallet.** These two are intentionally _not_
   revoked — they're what lets the team activate a transfer tax (and the
   accompanying burn, via the withheld-fee sweep) later, if MAMBA earns real
   cashflow. Both authorities are set to the same address at mint creation,
   via the `AUTHORITY_MULTISIG` env var in `scripts/create-coin.ts`.
   - Multisig address (mainnet-beta vault): `HbMnEvNGdWmUr7Zdqj6aKMkzXUtUVUXviPDd3qQVtDoW`
   - Squad name: "MAMBA Authority"
   - Members / threshold: verify live with `npm run verify-authorities`; the
     verifier rejects fewer than 2 voters or a threshold below 2.
4. **Transfer tax starts inactive (0 bps).** The config authority above can
   raise it later — up to a legal maximum of 100% (10,000 bps) — subject to
   Token-2022's ~1-epoch delay before a change takes effect. That delay is
   the only brake on how fast the rate can move; it is not a cap on the rate
   itself. This is disclosed here deliberately: a holder should know the
   ceiling is 100%, not assume a soft/lower cap exists.

## How to verify independently

`scripts/verify-authorities.ts` checks a live mint against invariants 1–3
above and reports PASS/FAIL for each, rather than asking anyone to trust this
document:

```bash
CLUSTER=mainnet-beta \
MINT=<the real mint address> \
EXPECTED_MULTISIG=<the Squads multisig account> \
EXPECTED_AUTHORITY=HbMnEvNGdWmUr7Zdqj6aKMkzXUtUVUXviPDd3qQVtDoW \
EXPECTED_THRESHOLD=<approved threshold> \\
EXPECTED_MEMBERS=<approved voter 1>,<approved voter 2> \\
npm run verify-authorities
```

`EXPECTED_MULTISIG`, `EXPECTED_AUTHORITY`, `EXPECTED_THRESHOLD`, and
`EXPECTED_MEMBERS` are required. The command verifies
that the multisig account exists on the selected cluster, is owned by the
Squads program, has the approved voter set and threshold, and that its vault 0
address matches the Token-2022 fee authorities. It prints the live member keys
and threshold; record those values after a successful mainnet verification.

Or independently, with any Solana RPC client: fetch the mint account with
`getMint` (Token-2022 program) and confirm `mintAuthority` and
`freezeAuthority` are both `null`; fetch its `TransferFeeConfig` extension
via `getTransferFeeConfig` and confirm `transferFeeConfigAuthority` and
`withdrawWithheldAuthority` both equal the multisig address above. The
multisig itself (members, threshold) can be inspected on
[Squads](https://app.squads.so) or via the `@sqds/multisig` SDK
(`Multisig.fromAccountAddress`).

## What this document does not cover

- `programs/token_program` — an unrelated, dormant Anchor scaffold in this
  repo (the default `anchor init` counter template), not part of MAMBA.
- Any future staking, vesting, or presale mechanics mentioned as possible
  later additions in the product direction — those are separate programs
  that don't exist yet, and would need their own review (and likely a
  different compliance posture) if and when they're built.
