/** Retry only a rejected organization-billed planning request, before a plan exists. */
export interface MigrationAttempt {
  code: number
  error?: string
  planningCompleted: boolean
}

export async function withMigrationCredentialFallback (
  primary: string | undefined,
  fallback: string | undefined,
  run: (token: string | undefined) => Promise<MigrationAttempt>,
  report: (message: string) => void = (message) => process.stdout.write(message)
): Promise<number> {
  const result = await run(primary)
  const policyRejected = result.code !== 0 && !result.planningCompleted &&
    /get_model_list/.test(result.error ?? '') &&
    /"status"\s*:\s*403/.test(result.error ?? '') &&
    (result.error ?? '').includes('Allow use of Copilot CLI billed to the organization')

  if (!policyRejected || !fallback || fallback === primary) {
    return result.code
  }

  report('[Copilot] Organization billing policy rejected the automatic token; retrying planning once with the configured PAT.\n')

  return (await run(fallback)).code
}
