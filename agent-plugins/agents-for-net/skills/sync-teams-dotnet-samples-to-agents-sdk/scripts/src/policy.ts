import path from "node:path";
import { CONFIG_DIRECTORY, record, SyncError, text, yaml } from "./config.js";
import type { MigrationPolicy, Targets } from "./types.js";

export function policies(repo: string, configured: Targets): MigrationPolicy[] {
  const value = yaml(path.join(repo, CONFIG_DIRECTORY, "migration-policy.yml"));
  if (value.version !== 1 || !Array.isArray(value.policies)) {
    throw new SyncError("migration-policy.yml must use version 1 with policies list");
  }
  const keys = new Set<string>();
  return value.policies.map((raw, index) => {
    const item = record(raw, `policy ${index}`);
    const policy: MigrationPolicy = {
      key: text(item.key, `policy ${index}.key`),
      sample: text(item.sample, `policy ${index}.sample`),
      instruction: text(item.instruction, `policy ${index}.instruction`),
      rationale: text(item.rationale, `policy ${index}.rationale`),
      source: text(item.source, `policy ${index}.source`),
    };
    if (!/^[a-z0-9][a-z0-9.-]*$/.test(policy.key)) {
      throw new SyncError(`Policy key is not lowercase and stable: ${policy.key}`);
    }
    if (keys.has(policy.key)) throw new SyncError(`Duplicate policy key: ${policy.key}`);
    if (!(policy.sample in configured.samples)) throw new SyncError(`Policy has unknown sample: ${policy.sample}`);
    keys.add(policy.key);
    return policy;
  }).sort((left, right) => left.key.localeCompare(right.key));
}

export function applicablePolicies(repo: string, configured: Targets, sample: string): MigrationPolicy[] {
  return policies(repo, configured).filter((policy) => policy.sample === sample);
}
