import { createServerFn } from '@tanstack/react-start'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import crypto from 'node:crypto'

// ── Server-side state ──────────────────────────────────────────────
let mcpClient: Client | null = null
let currentServerUrl: string | null = null

// OAuth state (persisted across requests in the server process)
let oauthState: {
  codeVerifier: string
  authServerMetadata: {
    authorization_endpoint: string
    token_endpoint: string
    registration_endpoint?: string
  } | null
  clientId: string
  clientSecret?: string
  redirectUri: string
  serverUrl: string
} | null = null

let accessToken: string | null = null

// Export accessor for the agent module to use
export function getStoredAccessToken(): string | null {
  return accessToken
}

// ── PKCE helpers ───────────────────────────────────────────────────
function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url')
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url')
}

// ── OAuth discovery & registration ─────────────────────────────────
export const startOAuthFlow = createServerFn({ method: 'POST' })
  .inputValidator((data: { serverUrl: string; callbackUrl: string }) => data)
  .handler(async ({ data }) => {
    try {
      // Step 1: Discover resource metadata
      const resourceUrl = new URL(data.serverUrl)
      const resourceMetaUrl = `${resourceUrl.origin}/api/auth/.well-known/oauth-protected-resource`

      const resourceRes = await fetch(resourceMetaUrl)
      if (!resourceRes.ok) {
        return { success: false as const, error: `Failed to fetch resource metadata: ${resourceRes.status}` }
      }
      const resourceMeta = await resourceRes.json() as {
        authorization_servers?: string[]
        resource?: string
      }

      // Step 2: Discover authorization server metadata
      const authServerBase = resourceMeta.authorization_servers?.[0]
      if (!authServerBase) {
        return { success: false as const, error: 'No authorization server found in resource metadata' }
      }

      const authMetaUrl = `${authServerBase}/.well-known/oauth-authorization-server`
      const authRes = await fetch(authMetaUrl)
      if (!authRes.ok) {
        return { success: false as const, error: `Failed to fetch auth server metadata: ${authRes.status}` }
      }
      const authMeta = await authRes.json() as {
        authorization_endpoint: string
        token_endpoint: string
        registration_endpoint?: string
        response_types_supported?: string[]
        grant_types_supported?: string[]
        code_challenge_methods_supported?: string[]
      }

      // Step 3: Dynamic client registration
      let clientId = ''
      let clientSecret: string | undefined

      if (authMeta.registration_endpoint) {
        const regRes = await fetch(authMeta.registration_endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_name: 'Railway Desktop Terminal',
            redirect_uris: [data.callbackUrl],
            grant_types: ['authorization_code'],
            response_types: ['code'],
            token_endpoint_auth_method: 'none',
          }),
        })
        if (!regRes.ok) {
          const errBody = await regRes.text()
          return { success: false as const, error: `Client registration failed: ${errBody}` }
        }
        const regData = await regRes.json() as {
          client_id: string
          client_secret?: string
        }
        clientId = regData.client_id
        clientSecret = regData.client_secret
      } else {
        return { success: false as const, error: 'No registration endpoint available — manual client setup required' }
      }

      // Step 4: Generate PKCE values and auth URL
      const codeVerifier = generateCodeVerifier()
      const codeChallenge = generateCodeChallenge(codeVerifier)
      const state = crypto.randomBytes(16).toString('hex')

      // Store OAuth state for the callback
      oauthState = {
        codeVerifier,
        authServerMetadata: {
          authorization_endpoint: authMeta.authorization_endpoint,
          token_endpoint: authMeta.token_endpoint,
          registration_endpoint: authMeta.registration_endpoint,
        },
        clientId,
        clientSecret,
        redirectUri: data.callbackUrl,
        serverUrl: data.serverUrl,
      }

      const authUrl = new URL(authMeta.authorization_endpoint)
      authUrl.searchParams.set('response_type', 'code')
      authUrl.searchParams.set('client_id', clientId)
      authUrl.searchParams.set('redirect_uri', data.callbackUrl)
      authUrl.searchParams.set('code_challenge', codeChallenge)
      authUrl.searchParams.set('code_challenge_method', 'S256')
      authUrl.searchParams.set('state', state)

      return {
        success: true as const,
        authUrl: authUrl.toString(),
        state,
      }
    } catch (error) {
      return {
        success: false as const,
        error: error instanceof Error ? error.message : 'OAuth discovery failed',
      }
    }
  })

// ── OAuth token exchange ───────────────────────────────────────────
export const exchangeOAuthCode = createServerFn({ method: 'POST' })
  .inputValidator((data: { code: string }) => data)
  .handler(async ({ data }) => {
    try {
      if (!oauthState || !oauthState.authServerMetadata) {
        return { success: false as const, error: 'No pending OAuth flow — start authentication first' }
      }

      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code: data.code,
        redirect_uri: oauthState.redirectUri,
        client_id: oauthState.clientId,
        code_verifier: oauthState.codeVerifier,
      })

      if (oauthState.clientSecret) {
        body.set('client_secret', oauthState.clientSecret)
      }

      const tokenRes = await fetch(oauthState.authServerMetadata.token_endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      })

      if (!tokenRes.ok) {
        const errBody = await tokenRes.text()
        return { success: false as const, error: `Token exchange failed: ${errBody}` }
      }

      const tokenData = await tokenRes.json() as {
        access_token: string
        token_type: string
        expires_in?: number
        refresh_token?: string
      }

      accessToken = tokenData.access_token

      return { success: true as const }
    } catch (error) {
      return {
        success: false as const,
        error: error instanceof Error ? error.message : 'Token exchange failed',
      }
    }
  })

// ── Check if authenticated ─────────────────────────────────────────
export const checkAuth = createServerFn({ method: 'POST' })
  .inputValidator((data: Record<string, never>) => data)
  .handler(async () => {
    return { authenticated: accessToken !== null }
  })

// ── MCP client management ──────────────────────────────────────────
async function getClient(serverUrl: string): Promise<Client> {
  if (mcpClient && currentServerUrl === serverUrl) {
    return mcpClient
  }

  if (mcpClient) {
    try {
      await mcpClient.close()
    } catch {
      // ignore close errors
    }
  }

  const client = new Client({
    name: 'railway-desktop-terminal',
    version: '1.0.0',
  })

  const transportOptions: { requestInit?: RequestInit } = {}
  if (accessToken) {
    transportOptions.requestInit = {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  }

  const transport = new StreamableHTTPClientTransport(
    new URL(serverUrl),
    transportOptions,
  )
  await client.connect(transport)

  mcpClient = client
  currentServerUrl = serverUrl
  return client
}

export const connectToMcp = createServerFn({ method: 'POST' })
  .inputValidator((data: { serverUrl: string }) => data)
  .handler(async ({ data }) => {
    try {
      const client = await getClient(data.serverUrl)
      const { tools } = await client.listTools()
      return {
        success: true as const,
        tools: tools.map((t) => ({
          name: t.name,
          description: t.description ?? '',
          inputSchema: t.inputSchema as Record<string, unknown>,
        })),
      }
    } catch (error) {
      mcpClient = null
      currentServerUrl = null
      return {
        success: false as const,
        error: error instanceof Error ? error.message : 'Connection failed',
        tools: [] as { name: string; description: string; inputSchema: Record<string, unknown> }[],
      }
    }
  })

export const callTool = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: { serverUrl: string; toolName: string; args: Record<string, unknown> }) => data,
  )
  .handler(async ({ data }) => {
    try {
      const client = await getClient(data.serverUrl)
      const result = await client.callTool({
        name: data.toolName,
        arguments: data.args,
      })

      const contentParts = result.content as Array<{ type: string; text?: string }>
      const textContent = contentParts
        .filter((c) => c.type === 'text')
        .map((c) => c.text ?? '')
        .join('\n')

      return {
        success: true as const,
        content: textContent,
        isError: result.isError ?? false,
      }
    } catch (error) {
      return {
        success: false as const,
        content: error instanceof Error ? error.message : 'Tool call failed',
        isError: true,
      }
    }
  })

export const disconnectMcp = createServerFn({ method: 'POST' })
  .inputValidator((data: Record<string, never>) => data)
  .handler(async () => {
    if (mcpClient) {
      try {
        await mcpClient.close()
      } catch {
        // ignore
      }
      mcpClient = null
      currentServerUrl = null
    }
    accessToken = null
    oauthState = null
    return { success: true }
  })
