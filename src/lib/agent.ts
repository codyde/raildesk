import { createServerFn } from '@tanstack/react-start'
import { query as claudeQuery } from '@anthropic-ai/claude-agent-sdk'

// ── Stream event types ───────────────────────────────────────────────
export type StreamEvent =
  | { type: 'session'; sessionId: string }
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: string }
  | { type: 'tool_result'; toolUseId: string; content: string; isError: boolean }
  | { type: 'done'; isError: boolean; costUsd: number; sessionId: string | null }
  | { type: 'error'; error: string }

// ── Streaming agent via async generator ──────────────────────────────
export const streamAgentMessage = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: {
      prompt: string
      mcpServerUrl?: string
      mcpAccessToken?: string
      systemPrompt?: string
      sessionId?: string | null
    }) => data,
  )
  .handler(async function* ({ data }): AsyncGenerator<StreamEvent> {
    try {
      const mcpServers: Record<string, { type: 'http'; url: string; headers?: Record<string, string> }> = {}

      if (data.mcpServerUrl) {
        const headers: Record<string, string> = {}
        if (data.mcpAccessToken) {
          headers['Authorization'] = `Bearer ${data.mcpAccessToken}`
        }
        mcpServers['railway'] = {
          type: 'http' as const,
          url: data.mcpServerUrl,
          ...(Object.keys(headers).length > 0 ? { headers } : {}),
        }
      }

      const conversation = claudeQuery({
        prompt: data.prompt,
        options: {
          systemPrompt: data.systemPrompt || `You are a Railway infrastructure assistant integrated into a desktop terminal. You help users manage their Railway projects, services, deployments, and infrastructure using the available MCP tools. Be concise and terminal-friendly in your responses. Format output for readability in a terminal context.`,
          maxTurns: 25,
          permissionMode: 'bypassPermissions',
          allowDangerouslySkipPermissions: true,
          ...(Object.keys(mcpServers).length > 0 ? { mcpServers } : {}),
          ...(data.sessionId ? { resume: data.sessionId } : {}),
        },
      })

      let currentSessionId: string | null = data.sessionId ?? null
      // Track pending tool_use IDs so we can mark them complete
      const pendingToolUseIds: string[] = []

      for await (const message of conversation) {
        if (message.session_id && !currentSessionId) {
          currentSessionId = message.session_id
          yield { type: 'session', sessionId: currentSessionId }
        }

        if (message.type === 'assistant') {
          const betaMessage = message.message
          if (betaMessage?.content) {
            // If we see a new assistant message and have pending tools, they completed
            // (the agent loop only continues after tool results are processed)
            const hasTextBlock = betaMessage.content.some(
              (b) => 'text' in b && typeof b.text === 'string' && b.text.length > 0
            )
            if (hasTextBlock && pendingToolUseIds.length > 0) {
              for (const toolId of pendingToolUseIds) {
                yield {
                  type: 'tool_result',
                  toolUseId: toolId,
                  content: 'Completed',
                  isError: false,
                }
              }
              pendingToolUseIds.length = 0
            }

            for (const block of betaMessage.content) {
              if ('text' in block && typeof block.text === 'string') {
                yield { type: 'text', text: block.text }
              }
              if ('type' in block && block.type === 'tool_use' && 'name' in block) {
                const toolId = 'id' in block ? (block.id as string) : crypto.randomUUID()
                pendingToolUseIds.push(toolId)
                yield {
                  type: 'tool_use',
                  id: toolId,
                  name: block.name as string,
                  input: JSON.stringify('input' in block ? block.input : {}),
                }
              }
            }
          }
        }

        // user messages with tool_use_result contain the tool's output
        if (message.type === 'user') {
          const raw = message as Record<string, unknown>
          const userMessage = raw.message as { content?: unknown[] } | undefined
          if (userMessage?.content && Array.isArray(userMessage.content)) {
            for (const block of userMessage.content) {
              const b = block as Record<string, unknown>
              if (b.type === 'tool_result' && typeof b.tool_use_id === 'string') {
                // Remove from pending
                const idx = pendingToolUseIds.indexOf(b.tool_use_id)
                if (idx !== -1) pendingToolUseIds.splice(idx, 1)

                const content = typeof b.content === 'string'
                  ? b.content
                  : Array.isArray(b.content)
                    ? (b.content as { text?: string }[]).map((c) => c.text ?? JSON.stringify(c)).join('\n')
                    : JSON.stringify(b.content ?? '', null, 2)

                yield {
                  type: 'tool_result',
                  toolUseId: b.tool_use_id,
                  content,
                  isError: b.is_error === true,
                }
              }
            }
          }
        }

        if (message.type === 'result') {
          // Mark any remaining pending tools as complete
          for (const toolId of pendingToolUseIds) {
            yield {
              type: 'tool_result',
              toolUseId: toolId,
              content: 'Completed',
              isError: false,
            }
          }
          pendingToolUseIds.length = 0

          const resultMsg = message as Record<string, unknown>
          yield {
            type: 'done',
            isError: (resultMsg.is_error as boolean) ?? false,
            costUsd: (resultMsg.total_cost_usd as number) ?? 0,
            sessionId: currentSessionId,
          }
        }
      }
    } catch (error) {
      yield {
        type: 'error',
        error: error instanceof Error ? error.message : 'Agent query failed',
      }
    }
  })

// ── Get the current access token from the MCP module ──────────────
export const getAccessToken = createServerFn({ method: 'POST' })
  .inputValidator((data: Record<string, never>) => data)
  .handler(async () => {
    const { getStoredAccessToken } = await import('./mcp')
    return { token: getStoredAccessToken() }
  })
