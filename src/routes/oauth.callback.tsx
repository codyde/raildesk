import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { exchangeOAuthCode } from '@/lib/mcp'
import { Loader2, CheckCircle, XCircle } from 'lucide-react'

export const Route = createFileRoute('/oauth/callback')({
  component: OAuthCallback,
})

function OAuthCallback() {
  const [status, setStatus] = useState<'exchanging' | 'success' | 'error'>('exchanging')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    async function handleCallback() {
      const params = new URLSearchParams(window.location.search)
      const code = params.get('code')
      const error = params.get('error')

      if (error) {
        setStatus('error')
        setErrorMsg(params.get('error_description') || error)
        return
      }

      if (!code) {
        setStatus('error')
        setErrorMsg('No authorization code received')
        return
      }

      try {
        const result = await exchangeOAuthCode({ data: { code } })
        if (result.success) {
          setStatus('success')
          // Notify the opener window
          if (window.opener) {
            window.opener.postMessage({ type: 'oauth-callback', success: true }, '*')
          }
          // Auto-close after a brief moment
          setTimeout(() => window.close(), 1500)
        } else {
          setStatus('error')
          setErrorMsg(result.error ?? 'Token exchange failed')
        }
      } catch (err) {
        setStatus('error')
        setErrorMsg(err instanceof Error ? err.message : 'Token exchange failed')
      }
    }

    handleCallback()
  }, [])

  return (
    <div className="min-h-screen bg-rail-deep flex items-center justify-center">
      <div className="bg-rail-surface border border-rail-border rounded-lg p-8 max-w-md w-full mx-4 text-center">
        {status === 'exchanging' && (
          <>
            <Loader2 size={32} className="animate-spin text-rail-purple mx-auto mb-4" />
            <h1 className="text-lg font-bold text-rail-text mb-2">Authenticating</h1>
            <p className="text-sm text-rail-text-dim">Exchanging authorization code...</p>
          </>
        )}
        {status === 'success' && (
          <>
            <CheckCircle size={32} className="text-rail-green mx-auto mb-4" />
            <h1 className="text-lg font-bold text-rail-text mb-2">Authenticated</h1>
            <p className="text-sm text-rail-text-dim">This window will close automatically.</p>
          </>
        )}
        {status === 'error' && (
          <>
            <XCircle size={32} className="text-rail-red mx-auto mb-4" />
            <h1 className="text-lg font-bold text-rail-text mb-2">Authentication Failed</h1>
            <p className="text-sm text-rail-red">{errorMsg}</p>
            <button
              onClick={() => window.close()}
              className="mt-4 px-4 py-2 bg-rail-elevated border border-rail-border rounded text-xs text-rail-text hover:bg-rail-card transition-colors"
            >
              Close
            </button>
          </>
        )}
      </div>
    </div>
  )
}
