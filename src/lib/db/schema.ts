import { pgTable, text, timestamp, boolean, integer, uuid } from 'drizzle-orm/pg-core'

// ── Chat sessions ─────────────────────────────────────────────────
export const chatSessions = pgTable('chat_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentSessionId: text('agent_session_id'),
  mcpServerUrl: text('mcp_server_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ── Chat messages ─────────────────────────────────────────────────
export const chatMessages = pgTable('chat_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().references(() => chatSessions.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // 'user' | 'assistant' | 'system' | 'tool'
  content: text('content').notNull(),
  toolCalls: text('tool_calls'), // JSON-serialized array of tool calls
  toolResult: text('tool_result'), // JSON-serialized tool result
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ── MCP server configs (saved connections) ────────────────────────
export const mcpServerConfigs = pgTable('mcp_server_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  url: text('url').notNull(),
  isDefault: boolean('is_default').default(false),
  lastConnectedAt: timestamp('last_connected_at'),
  toolCount: integer('tool_count').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
