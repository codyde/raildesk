import { eq, desc } from 'drizzle-orm'
import { db } from './index'
import { chatSessions, chatMessages, mcpServerConfigs } from './schema'

// ── Chat sessions ─────────────────────────────────────────────────

export async function createChatSession(agentSessionId?: string, mcpServerUrl?: string) {
  const [session] = await db.insert(chatSessions).values({
    agentSessionId: agentSessionId ?? null,
    mcpServerUrl: mcpServerUrl ?? null,
  }).returning()
  return session
}

export async function updateChatSessionAgentId(sessionId: string, agentSessionId: string) {
  await db.update(chatSessions)
    .set({ agentSessionId, updatedAt: new Date() })
    .where(eq(chatSessions.id, sessionId))
}

export async function getRecentSessions(limit = 20) {
  return db.select().from(chatSessions)
    .orderBy(desc(chatSessions.updatedAt))
    .limit(limit)
}

// ── Chat messages ─────────────────────────────────────────────────

export async function saveMessage(params: {
  sessionId: string
  role: string
  content: string
  toolCalls?: unknown
  toolResult?: unknown
}) {
  const [message] = await db.insert(chatMessages).values({
    sessionId: params.sessionId,
    role: params.role,
    content: params.content,
    toolCalls: params.toolCalls ? JSON.stringify(params.toolCalls) : null,
    toolResult: params.toolResult ? JSON.stringify(params.toolResult) : null,
  }).returning()

  // Touch the session's updatedAt
  await db.update(chatSessions)
    .set({ updatedAt: new Date() })
    .where(eq(chatSessions.id, params.sessionId))

  return message
}

export async function getSessionMessages(sessionId: string) {
  return db.select().from(chatMessages)
    .where(eq(chatMessages.sessionId, sessionId))
    .orderBy(chatMessages.createdAt)
}

// ── MCP server configs ────────────────────────────────────────────

export async function saveMcpConfig(name: string, url: string) {
  const [config] = await db.insert(mcpServerConfigs).values({
    name,
    url,
  }).onConflictDoNothing().returning()
  return config
}

export async function updateMcpLastConnected(url: string, toolCount: number) {
  await db.update(mcpServerConfigs)
    .set({ lastConnectedAt: new Date(), toolCount })
    .where(eq(mcpServerConfigs.url, url))
}

export async function getSavedMcpConfigs() {
  return db.select().from(mcpServerConfigs)
    .orderBy(desc(mcpServerConfigs.lastConnectedAt))
}
