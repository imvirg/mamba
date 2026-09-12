# MAMBA Agent Rules

This repository is a Solana token-launch codebase with real authority and security implications. Agents working here must behave conservatively and fail-closed.

## Mandatory behavior

- Treat wallet, mint, freeze, and transfer-fee authority changes as security-sensitive.
- Never silently fall back to a hot wallet for a real launch.
- Require `AUTHORITY_MULTISIG` or an explicit approved governance address before launch flows continue on `mainnet-beta` or any production-like network.
- Reject unsafe migrations and silent config drift that weaken the authority model.
- Default to explicit validation and early errors instead of convenience behavior.
- Never allow a missing env var, omitted config value, or default path to quietly reduce security.
- Prefer clear warnings and hard failures over auto-continue logic.

## Hard reject conditions

An agent must reject or block any change that:

- silently replaces a multisig authority with the payer key or any hot wallet
- permits mint or freeze authority to remain with a developer wallet in a launch path
- introduces a production path that works without explicit governance approval
- hides a launch-mode assumption behind a default or fallback
- removes protections without an explicit justification and review
- bypasses auth validation or cluster checks in scripts that submit transactions

## Required review flow

Use the repo instruction files when applicable:

- `.github/instructions/security-review.instructions.md`
- `.github/instructions/validation-gate.instructions.md`

For any change affecting:

- token mint setup
- authority configuration
- transfer fee behavior
- security policy
- wallet loading or env validation
- deployment scripts
- authority migrations or account upgrades

an agent must:

1. inspect the authority model
2. check for silent fallback or unsafe default behavior
3. verify cluster/environment safety
4. validate the relevant script/test command
5. report evidence before declaring success

## Production safety rules

- Do not approve silent fallbacks to the payer key.
- Do not accept insecure wallet path assumptions without explicit user intent.
- Do not treat devnet-only logic as safe for production flows.
- Do not approve migrations that reduce multisig coverage or weaken governance.
- Do not claim a fix is complete without a fresh verification result.

## Required validation gate

Before a change is considered acceptable, the agent must confirm:

- the relevant script or check was run
- the output and exit status were reviewed
- no unsafe authority fallback remains
- the environment and cluster are explicit
- the fix is maintainable and reviewable

## Minimum pass bar

A change is only acceptable if it is:

- secure by default
- explicit about authority ownership
- clear about cluster and environment
- verified with real commands or checks
- safe for both dev/test and launch flows
- maintainable and reviewable

If a change weakens the authority model, removes protection, or introduces a silent migration risk without an explicit and justified reason, reject it.

## Required agent team

Before substantive project work, deploy the eight-role review team in parallel and use the reports to route the work:

1. `mamba-security-reviewer` - authority, wallet, cluster, and production-safety review
2. `solana-rust-expert` - Solana, Anchor, account, CPI, and on-chain behavior review
3. `typescript-web-expert` - TypeScript, Node, Next.js, tests, and build review
4. `Explore` - independent repository and dependency-free context exploration
5. `mamba-project-chronicle` - evidence-based project timeline and validation history
6. `mamba-project-improvement` - lessons learned, risks, and prioritized future improvements
7. `legal-researcher` - securities, regulatory, contract, and general legal risk review
8. `legal-ip-researcher` - copyright, trademark, licensing, branding, and asset review

The team must be read-only unless the user explicitly assigns implementation work. Agents must not fetch, install, copy, or introduce untrusted third-party code. Each report must identify evidence, uncertainty, and recommended next checks. The primary agent remains responsible for reconciling conflicting reports and running fresh validation.

Legal agents are mandatory for work involving token classification, securities or regulatory claims, token economics, public marketing claims, names, logos, images, AI-generated assets, metadata, licenses, attribution, contracts, or external content. Their reports are risk analysis only and do not replace qualified legal counsel.

This eight-agent pass is required for implementation, review, launch, deployment, security, architecture, and release-planning requests. It may be skipped for trivial conversation, direct file lookup, or emergency safety blocking, with the omission stated explicitly.
