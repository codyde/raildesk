import { useState, useEffect, useCallback } from 'react'
import { Plug, PlugZap, Loader2, ArrowLeft, KeyRound, ShieldCheck } from 'lucide-react'
import { useDesktopStore } from '@/lib/store'
import { connectToMcp, disconnectMcp, startOAuthFlow, checkAuth } from '@/lib/mcp'

export function SettingsPanel() {
  const mcpServerUrl = useDesktopStore((s) => s.mcpServerUrl)
  const setMcpServerUrl = useDesktopStore((s) => s.setMcpServerUrl)
  const isConnected = useDesktopStore((s) => s.isConnected)
  const setIsConnected = useDesktopStore((s) => s.setIsConnected)
  const setAvailableTools = useDesktopStore((s) => s.setAvailableTools)
  const availableTools = useDesktopStore((s) => s.availableTools)
  const toggleSettings = useDesktopStore((s) => s.toggleSettings)
  const addMessage = useDesktopStore((s) => s.addMessage)

  const [urlInput, setUrlInput] = useState(mcpServerUrl || 'https://mcp.railway.com')
  const [isConnecting, setIsConnecting] = useState(false)
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [error, setError] = useState('')

  // Check initial auth state
  useEffect(() => {
    checkAuth({ data: {} as Record<string, never> }).then((res) => {
      setIsAuthenticated(res.authenticated)
    })
  }, [])

  // Listen for OAuth callback messages from popup
  const handleOAuthMessage = useCallback(
    async (event: MessageEvent) => {
      if (event.data?.type === 'oauth-callback' && event.data.success) {
        setIsAuthenticated(true)
        setIsAuthenticating(false)
        setError('')

        // Auto-connect after successful authentication
        const url = urlInput.trim()
        if (url) {
          setIsConnecting(true)
          try {
            const result = await connectToMcp({ data: { serverUrl: url } })
            if (result.success) {
              setMcpServerUrl(url)
              setIsConnected(true)
              setAvailableTools(result.tools)
              addMessage({
                id: crypto.randomUUID(),
                role: 'system',
                content: `Authenticated and connected. ${result.tools.length} tools available.`,
                timestamp: Date.now(),
              })
              toggleSettings()
            } else {
              setError(result.error ?? 'Connection failed')
            }
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Connection failed')
          } finally {
            setIsConnecting(false)
          }
        }
      }
    },
    [addMessage, urlInput, setMcpServerUrl, setIsConnected, setAvailableTools, toggleSettings],
  )

  useEffect(() => {
    window.addEventListener('message', handleOAuthMessage)
    return () => window.removeEventListener('message', handleOAuthMessage)
  }, [handleOAuthMessage])

  async function handleAuthenticate() {
    const url = urlInput.trim()
    if (!url) return

    setIsAuthenticating(true)
    setError('')

    try {
      const callbackUrl = `${window.location.origin}/oauth/callback`
      const result = await startOAuthFlow({
        data: { serverUrl: url, callbackUrl },
      })

      if (result.success) {
        // Open OAuth authorization in a popup
        const width = 600
        const height = 700
        const left = window.screenX + (window.innerWidth - width) / 2
        const top = window.screenY + (window.innerHeight - height) / 2
        window.open(
          result.authUrl,
          'railway-oauth',
          `width=${width},height=${height},left=${left},top=${top},popup=true`,
        )
      } else {
        setError(result.error ?? 'Authentication failed')
        setIsAuthenticating(false)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed')
      setIsAuthenticating(false)
    }
  }

  async function handleConnect() {
    const url = urlInput.trim()
    if (!url) return

    setIsConnecting(true)
    setError('')

    try {
      const result = await connectToMcp({ data: { serverUrl: url } })
      if (result.success) {
        setMcpServerUrl(url)
        setIsConnected(true)
        setAvailableTools(result.tools)
        addMessage({
          id: crypto.randomUUID(),
          role: 'system',
          content: `Connected to MCP server. ${result.tools.length} tools available.`,
          timestamp: Date.now(),
        })
        toggleSettings()
      } else {
        setError(result.error ?? 'Connection failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed')
    } finally {
      setIsConnecting(false)
    }
  }

  async function handleDisconnect() {
    await disconnectMcp({ data: {} as Record<string, never> })
    setIsConnected(false)
    setIsAuthenticated(false)
    setAvailableTools([])
    addMessage({
      id: crypto.randomUUID(),
      role: 'system',
      content: 'Disconnected from MCP server.',
      timestamp: Date.now(),
    })
  }

  return (
    <div className="flex-1 flex flex-col p-4 overflow-y-auto terminal-scroll">
      <button
        onClick={toggleSettings}
        className="flex items-center gap-1.5 text-xs text-rail-text-dim hover:text-rail-text transition-colors mb-4 self-start"
      >
        <ArrowLeft size={12} />
        Back to terminal
      </button>

      <h2 className="text-sm font-bold text-rail-text mb-4">MCP Server Connection</h2>

      <div className="space-y-4">
        {/* Connection status */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {isConnected ? (
              <PlugZap size={14} className="text-rail-green" />
            ) : (
              <Plug size={14} className="text-rail-text-dim" />
            )}
            <span className={`text-xs ${isConnected ? 'text-rail-green' : 'text-rail-text-dim'}`}>
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {isAuthenticated ? (
              <ShieldCheck size={14} className="text-rail-green" />
            ) : (
              <KeyRound size={14} className="text-rail-text-dim" />
            )}
            <span className={`text-xs ${isAuthenticated ? 'text-rail-green' : 'text-rail-text-dim'}`}>
              {isAuthenticated ? 'Authenticated' : 'Not authenticated'}
            </span>
          </div>
        </div>

        {/* URL input */}
        <div className="space-y-1.5">
          <label className="text-xs text-rail-text-dim">Server URL (Streamable HTTP)</label>
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://your-mcp-server.railway.app/mcp"
            className="w-full bg-rail-deep border border-rail-border rounded px-3 py-2 text-xs text-rail-text placeholder:text-rail-text-muted outline-none focus:border-rail-purple transition-colors font-mono"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (isAuthenticated) {
                  handleConnect()
                } else {
                  handleAuthenticate()
                }
              }
            }}
          />
        </div>

        {error && <p className="text-xs text-rail-red">{error}</p>}

        {/* Action buttons */}
        <div className="flex gap-2">
          {!isConnected ? (
            <>
              {!isAuthenticated && (
                <button
                  onClick={handleAuthenticate}
                  disabled={isAuthenticating || !urlInput.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-rail-purple/20 border border-rail-purple/40 text-rail-purple text-xs rounded hover:bg-rail-purple/30 disabled:opacity-40 transition-colors"
                >
                  {isAuthenticating ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <KeyRound size={12} />
                  )}
                  {isAuthenticating ? 'Waiting for auth...' : 'Authenticate'}
                </button>
              )}
              {isAuthenticated && (
                <button
                  onClick={handleConnect}
                  disabled={isConnecting || !urlInput.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-rail-green/20 border border-rail-green/40 text-rail-green text-xs rounded hover:bg-rail-green/30 disabled:opacity-40 transition-colors"
                >
                  {isConnecting ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Plug size={12} />
                  )}
                  {isConnecting ? 'Connecting...' : 'Connect'}
                </button>
              )}
            </>
          ) : (
            <button
              onClick={handleDisconnect}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rail-red/20 border border-rail-red/40 text-rail-red text-xs rounded hover:bg-rail-red/30 transition-colors"
            >
              <PlugZap size={12} />
              Disconnect
            </button>
          )}
        </div>

        {/* Auth help text */}
        {!isAuthenticated && !isConnected && (
          <p className="text-[10px] text-rail-text-muted leading-relaxed">
            This MCP server requires OAuth authentication. Click Authenticate to sign in via Railway, then Connect to establish the MCP session.
          </p>
        )}

        {/* Connected tools list */}
        {isConnected && availableTools.length > 0 && (
          <div className="space-y-2 mt-4">
            <h3 className="text-xs font-bold text-rail-text-dim">
              Available Tools ({availableTools.length})
            </h3>
            <div className="space-y-1 max-h-48 overflow-y-auto terminal-scroll">
              {availableTools.map((tool) => (
                <div
                  key={tool.name}
                  className="flex flex-col gap-0.5 px-2 py-1.5 rounded bg-rail-deep/50 border border-rail-border/50"
                >
                  <span className="text-xs text-rail-purple font-mono">/{tool.name}</span>
                  {tool.description && (
                    <span className="text-[10px] text-rail-text-dim">{tool.description}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
