/** Dispatches trusted SDK policy without language branches in callers. */
import { assertAgentsSdkVersionSelection, resolveAgentsSdkVersion } from './versions.js'
import type { AgentsSdkVersionSelection, Targets } from './types.js'

export function assertSdkSelection (configured: Targets, selection: AgentsSdkVersionSelection): void {
  assertAgentsSdkVersionSelection(selection, configured.packagePolicy.minimumAgentsSdkVersion)
}

export async function resolveSdkSelection (configured: Targets): Promise<AgentsSdkVersionSelection> {
  return resolveAgentsSdkVersion(configured.packagePolicy.minimumAgentsSdkVersion)
}
