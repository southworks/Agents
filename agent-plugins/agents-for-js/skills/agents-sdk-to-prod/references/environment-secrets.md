## Configure secrets and environment

When to use it: Use environment configuration for every deployed sample. Put values in your host's secret/config system, not in committed `.env` files.

Why it matters: The current SDK auth loader supports multiple named connections and service URL mapping. Keeping this format consistent makes samples portable across Bot Framework, Teams, and additional authenticated callers.

Minimal production auth settings:

```env
NODE_ENV=production

connections__serviceConnection__settings__clientId=<app-id>
connections__serviceConnection__settings__clientSecret=<secret-from-secret-store>
connections__serviceConnection__settings__tenantId=<tenant-id>
connections__serviceConnection__settings__authorityEndpoint=https://login.microsoftonline.com

connectionsMap__0__connection=serviceConnection
connectionsMap__0__serviceUrl=*
```

For production, prefer service URL and audience-specific mappings when the target channels are known. The `serviceUrl` value is interpreted as a regular expression by the connection manager.

```env
connectionsMap__0__connection=teamsConnection
connectionsMap__0__serviceUrl=^https://smba\.trafficmanager\.net/teams/
connectionsMap__0__audience=<expected-token-audience>
```

Keep `connectionsMap__0__serviceUrl=*` for local development, broad multi-channel samples, or when your deployment intentionally accepts multiple channel service URLs. Use `CloudAdapterOptions__validateServiceUrl=true` either way so inbound activity service URLs are checked against the authenticated token claim.

Storage settings for the snippets above:

```env
BLOB_CONTAINER_ID=<container-name>
BLOB_STORAGE_CONNECTION_STRING=<secret-from-secret-store>

COSMOS_DATABASE_ID=<database-id>
COSMOS_CONTAINER_ID=<container-id>
COSMOS_ENDPOINT=<cosmos-endpoint>
COSMOS_KEY=<secret-from-secret-store>
```

Avoid logging raw environment values. The SDK redacts sensitive auth settings in its own logs, but application logs should follow the same rule.

Prefer secretless or rotatable credentials in production when your host supports them:

```env
# User-assigned managed identity
connections__serviceConnection__settings__authType=UserManagedIdentity
connections__serviceConnection__settings__clientId=<managed-identity-client-id>
connections__serviceConnection__settings__tenantId=<tenant-id>

# Workload identity
connections__serviceConnection__settings__authType=WorkloadIdentity
connections__serviceConnection__settings__clientId=<app-id>
connections__serviceConnection__settings__tenantId=<tenant-id>
connections__serviceConnection__settings__federatedTokenFile=<token-file-path>

# Certificate credential
connections__serviceConnection__settings__authType=Certificate
connections__serviceConnection__settings__clientId=<app-id>
connections__serviceConnection__settings__tenantId=<tenant-id>
connections__serviceConnection__settings__certPemFile=<certificate-pem-path>
connections__serviceConnection__settings__certKeyFile=<certificate-key-path>
```

Use `clientSecret` only when the host cannot use managed identity, workload identity, federated credentials, or certificates, and rotate it through your secret store.
