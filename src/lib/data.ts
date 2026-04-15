import { createServerFn } from '@tanstack/react-start'

// ── Load recent chat sessions ─────────────────────────────────────
export const loadRecentSessions = createServerFn({ method: 'POST' })
  .inputValidator((data: { limit?: number }) => data)
  .handler(async ({ data }) => {
    const { getRecentSessions } = await import('./db/queries')
    const sessions = await getRecentSessions(data.limit ?? 20)
    return { sessions }
  })

// ── Load messages for a session ───────────────────────────────────
export const loadSessionMessages = createServerFn({ method: 'POST' })
  .inputValidator((data: { sessionId: string }) => data)
  .handler(async ({ data }) => {
    const { getSessionMessages } = await import('./db/queries')
    const messages = await getSessionMessages(data.sessionId)
    return { messages }
  })

// ── Save a message (for direct tool calls, system messages, etc.) ─
export const persistMessage = createServerFn({ method: 'POST' })
  .inputValidator((data: {
    dbSessionId: string | null
    role: string
    content: string
    toolCalls?: string
    toolResult?: string
    mcpServerUrl?: string
  }) => data)
  .handler(async ({ data }) => {
    const { createChatSession, saveMessage } = await import('./db/queries')
    let sessionId = data.dbSessionId
    if (!sessionId) {
      const session = await createChatSession(undefined, data.mcpServerUrl)
      sessionId = session.id
    }
    const message = await saveMessage({
      sessionId,
      role: data.role,
      content: data.content,
      toolCalls: data.toolCalls ? JSON.parse(data.toolCalls) : undefined,
      toolResult: data.toolResult ? JSON.parse(data.toolResult) : undefined,
    })
    return { message, dbSessionId: sessionId }
  })

// ── Load saved MCP server configs ─────────────────────────────────
export const loadSavedMcpConfigs = createServerFn({ method: 'POST' })
  .inputValidator((data: Record<string, never>) => data)
  .handler(async () => {
    const { getSavedMcpConfigs } = await import('./db/queries')
    const configs = await getSavedMcpConfigs()
    return { configs }
  })
