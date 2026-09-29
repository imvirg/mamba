import { Connection, PublicKey } from "@solana/web3.js";
import { accounts, getVaultPda, PROGRAM_ID, types } from "@sqds/multisig";
import { requireEnv } from "./solana";

export interface SquadsAuthorityConfig {
  authority: PublicKey;
  multisig: PublicKey;
  threshold: number;
  members: PublicKey[];
}

function parsePublicKey(value: string, label: string): PublicKey {
  try {
    return new PublicKey(value);
  } catch {
    throw new Error(`${label} is not a valid Solana public key: ${value}`);
  }
}

export function loadSquadsAuthorityConfig(
  authority: PublicKey
): SquadsAuthorityConfig {
  const threshold = Number(requireEnv("EXPECTED_THRESHOLD"));
  const members = requireEnv("EXPECTED_MEMBERS")
    .split(",")
    .map((member) => parsePublicKey(member.trim(), "EXPECTED_MEMBERS member"));

  if (
    !Number.isInteger(threshold) ||
    threshold < 2 ||
    threshold > members.length
  ) {
    throw new Error(
      "EXPECTED_THRESHOLD must be an integer between 2 and EXPECTED_MEMBERS count"
    );
  }

  if (
    new Set(members.map((member) => member.toBase58())).size !== members.length
  ) {
    throw new Error("EXPECTED_MEMBERS must not contain duplicate public keys");
  }

  return {
    authority,
    multisig: parsePublicKey(
      requireEnv("EXPECTED_MULTISIG"),
      "EXPECTED_MULTISIG"
    ),
    threshold,
    members,
  };
}

// A Squads "controlled" multisig has a config authority that can add or
// remove members and change the threshold without a vote, so its
// threshold is not a real guarantee. Only autonomous multisigs qualify.
export function assertAutonomousMultisig(configAuthority: PublicKey): void {
  if (!configAuthority.equals(PublicKey.default)) {
    throw new Error(
      `Multisig has a config authority (${configAuthority.toBase58()}) that can change members and threshold without a vote; use an autonomous multisig`
    );
  }
}

export async function validateSquadsAuthority(
  connection: Connection,
  config: SquadsAuthorityConfig
): Promise<void> {
  const multisigInfo = await connection.getAccountInfo(config.multisig);
  if (!multisigInfo) {
    throw new Error(
      `Expected multisig account not found: ${config.multisig.toBase58()}`
    );
  }
  if (!multisigInfo.owner.equals(PROGRAM_ID)) {
    throw new Error(
      `Expected multisig is not owned by the Squads program: ${multisigInfo.owner.toBase58()}`
    );
  }

  const multisig = await accounts.Multisig.fromAccountAddress(
    connection,
    config.multisig,
    "confirmed"
  );
  const actualVoters = multisig.members
    .filter(
      (member) =>
        (member.permissions.mask & types.Permission.Vote) ===
        types.Permission.Vote
    )
    .map((member) => member.key.toBase58())
    .sort();
  const expectedVoters = config.members
    .map((member) => member.toBase58())
    .sort();

  assertAutonomousMultisig(multisig.configAuthority);
  if (multisig.threshold !== config.threshold) {
    throw new Error(
      `Multisig threshold mismatch: expected ${config.threshold}, found ${multisig.threshold}`
    );
  }
  if (
    actualVoters.length !== expectedVoters.length ||
    actualVoters.some((member, index) => member !== expectedVoters[index])
  ) {
    throw new Error(
      `Multisig voter set mismatch: expected ${expectedVoters.join(
        ", "
      )}, found ${actualVoters.join(", ")}`
    );
  }

  const [vaultPda] = getVaultPda({
    multisigPda: config.multisig,
    index: 0,
  });
  if (!vaultPda.equals(config.authority)) {
    throw new Error(
      `Expected authority does not match Squads vault 0: ${vaultPda.toBase58()}`
    );
  }
}
