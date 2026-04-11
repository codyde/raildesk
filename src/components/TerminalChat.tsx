import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Send,
  ChevronRight,
  ChevronDown,
  Wrench,
  AlertCircle,
  Loader2,
  Bot,
  CheckCircle2,
  XCircle,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useDesktopStore, type ChatMessage, type ToolCall } from '@/lib/store'
import { callTool } from '@/lib/mcp'
import { streamAgentMessage, getAccessToken, type StreamEvent } from '@/lib/agent'

export function TerminalChat() {
  const messages = useDesktopStore((s) => s.messages)
  const addMessage = useDesktopStore((s) => s.addMessage)
  const updateMessage = useDesktopStore((s) => s.updateMessage)
  const isProcessing = useDesktopStore((s) => s.isProcessing)
  const setIsProcessing = useDesktopStore((s) => s.setIsProcessing)
  const isConnected = useDesktopStore((s) => s.isConnected)
  const availableTools = useDesktopStore((s) => s.availableTools)
  const mcpServerUrl = useDesktopStore((s) => s.mcpServerUrl)
  const sessionId = useDesktopStore((s) => s.sessionId)
  const setSessionId = useDesktopStore((s) => s.setSessionId)

  const [input, setInput] = useState('')
  const [commandHistory, setCommandHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const parseCommand = useCallback(
    (text: string): { tool: string; args: Record<string, unknown> } | null => {
      const trimmed = text.trim()

      if (trimmed.startsWith('/')) {
        const spaceIndex = trimmed.indexOf(' ')
        const toolName =
          spaceIndex === -1
            ? trimmed.slice(1)
            : trimmed.slice(1, spaceIndex)
        const argsStr = spaceIndex === -1 ? '{}' : trimmed.slice(spaceIndex + 1)

        try {
          const args = JSON.parse(argsStr)
          return { tool: toolName, args }
        } catch {
          return { tool: toolName, args: {} }
        }
      }

      return null
    },
    [],
  )

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      const text = input.trim()
      if (!text || isProcessing) return

      setInput('')
      setCommandHistory((prev) => [...prev, text])
      setHistoryIndex(-1)

      // Add user message
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: text,
        timestamp: Date.now(),
      }
      addMessage(userMsg)

      // Handle built-in commands
      if (text === '/help') {
        addMessage({
          id: crypto.randomUUID(),
          role: 'system',
          content: [
            'Available commands:',
            '',
            '  /help              Show this help message',
            '  /tools             List available tools',
            '  /clear             Clear terminal',
            '  /<tool> {args}     Call a tool directly',
            '',
            'Natural language (powered by Claude Agent SDK):',
            '  Just type normally to ask questions or give instructions.',
            '  When connected, Claude can use Railway tools automatically.',
            '',
            'Examples:',
            '  Show me my recent deployments',
            '  /deploy {"serviceId": "abc123"}',
          ].join('\n'),
          timestamp: Date.now(),
        })
        return
      }

      if (text === '/tools') {
        if (!isConnected || availableTools.length === 0) {
          addMessage({
            id: crypto.randomUUID(),
            role: 'system',
            content: 'Not connected. Configure the connection in settings.',
            timestamp: Date.now(),
          })
          return
        }
        const toolList = availableTools
          .map((t) => `  ${t.name}${t.description ? ` - ${t.description}` : ''}`)
          .join('\n')
        addMessage({
          id: crypto.randomUUID(),
          role: 'system',
          content: `Available tools (${availableTools.length}):\n\n${toolList}`,
          timestamp: Date.now(),
        })
        return
      }

      if (text === '/clear') {
        useDesktopStore.getState().clearMessages()
        return
      }

      // Parse tool commands
      const parsed = parseCommand(text)
      if (parsed) {
        if (!isConnected) {
          addMessage({
            id: crypto.randomUUID(),
            role: 'system',
            content: 'Not connected. Open settings to configure.',
            timestamp: Date.now(),
          })
          return
        }

        const toolExists = availableTools.some((t) => t.name === parsed.tool)
        if (!toolExists) {
          addMessage({
            id: crypto.randomUUID(),
            role: 'system',
            content: `Unknown tool: ${parsed.tool}. Type /tools to see available tools.`,
            timestamp: Date.now(),
          })
          return
        }

        setIsProcessing(true)
        const toolCallId = crypto.randomUUID()
        const toolMsgId = crypto.randomUUID()

        addMessage({
          id: toolMsgId,
          role: 'system',
          content: `Calling ${parsed.tool}...`,
          timestamp: Date.now(),
          toolCalls: [
            {
              id: toolCallId,
              name: parsed.tool,
              arguments: JSON.stringify(parsed.args),
              status: 'running',
            },
          ],
        })

        try {
          const result = await callTool({
            data: {
              serverUrl: mcpServerUrl,
              toolName: parsed.tool,
              args: parsed.args,
            },
          })

          // Update the tool call with its result
          updateMessage(toolMsgId, {
            content: `Called ${parsed.tool}`,
            toolCalls: [
              {
                id: toolCallId,
                name: parsed.tool,
                arguments: JSON.stringify(parsed.args),
                status: result.isError ? 'error' as const : 'completed' as const,
                result: result.content,
                isError: !!result.isError,
              },
            ],
          })

          addMessage({
            id: crypto.randomUUID(),
            role: 'assistant',
            content: result.content,
            timestamp: Date.now(),
            toolResult: {
              toolCallId: parsed.tool,
              content: result.content,
              isError: !!result.isError,
            },
          })
        } catch (err) {
          updateMessage(toolMsgId, {
            content: `Failed: ${parsed.tool}`,
            toolCalls: [
              {
                id: toolCallId,
                name: parsed.tool,
                arguments: JSON.stringify(parsed.args),
                status: 'error',
                result: err instanceof Error ? err.message : 'Unknown error',
                isError: true,
              },
            ],
          })

          addMessage({
            id: crypto.randomUUID(),
            role: 'assistant',
            content: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
            timestamp: Date.now(),
            toolResult: {
              toolCallId: parsed.tool,
              content: 'Tool call failed',
              isError: true,
            },
          })
        } finally {
          setIsProcessing(false)
        }
        return
      }

      // Plain text - send to Claude Agent SDK with streaming
      setIsProcessing(true)

      const assistantMsgId = crypto.randomUUID()
      const toolCallMsgId = crypto.randomUUID()
      const toolCalls: ToolCall[] = []
      let hasAddedAssistant = false
      let hasAddedToolMsg = false

      try {
        // Get access token for MCP auth
        let mcpAccessToken: string | undefined
        if (isConnected) {
          const tokenResult = await getAccessToken({ data: {} as Record<string, never> })
          mcpAccessToken = tokenResult.token ?? undefined
        }

        // Call the streaming server function - returns a ReadableStream
        const stream = await streamAgentMessage({
          data: {
            prompt: text,
            mcpServerUrl: isConnected ? mcpServerUrl : undefined,
            mcpAccessToken,
            sessionId: sessionId ?? undefined,
          },
        })

        // Consume the async generator stream
        for await (const event of stream as AsyncIterable<StreamEvent>) {

          if (event.type === 'session') {
            setSessionId(event.sessionId)
          }

          if (event.type === 'text') {
            if (!hasAddedAssistant) {
              addMessage({
                id: assistantMsgId,
                role: 'assistant',
                content: event.text,
                timestamp: Date.now(),
              })
              hasAddedAssistant = true
            } else {
              const current = useDesktopStore.getState().messages.find((m) => m.id === assistantMsgId)
              updateMessage(assistantMsgId, {
                content: (current?.content ?? '') + event.text,
              })
            }
          }

          if (event.type === 'tool_use') {
            const tc: ToolCall = {
              id: event.id,
              name: event.name,
              arguments: event.input,
              status: 'running',
            }
            toolCalls.push(tc)

            if (!hasAddedToolMsg) {
              addMessage({
                id: toolCallMsgId,
                role: 'system',
                content: `${toolCalls.length} tool${toolCalls.length > 1 ? 's' : ''} called`,
                timestamp: Date.now(),
                toolCalls: [...toolCalls],
              })
              hasAddedToolMsg = true
            } else {
              updateMessage(toolCallMsgId, {
                content: `${toolCalls.length} tool${toolCalls.length > 1 ? 's' : ''} called`,
                toolCalls: [...toolCalls],
              })
            }
          }

          if (event.type === 'tool_result') {
            const tc = toolCalls.find((t) => t.id === event.toolUseId)
            if (tc) {
              tc.status = event.isError ? 'error' : 'completed'
              tc.result = event.content
              tc.isError = event.isError
              updateMessage(toolCallMsgId, {
                toolCalls: [...toolCalls],
              })
            }
          }

          if (event.type === 'done') {
            if (event.sessionId) setSessionId(event.sessionId)
          }

          if (event.type === 'error') {
            if (!hasAddedAssistant) {
              addMessage({
                id: assistantMsgId,
                role: 'assistant',
                content: `Error: ${event.error}`,
                timestamp: Date.now(),
                toolResult: {
                  toolCallId: 'agent',
                  content: event.error,
                  isError: true,
                },
              })
              hasAddedAssistant = true
            } else {
              const current = useDesktopStore.getState().messages.find((m) => m.id === assistantMsgId)
              updateMessage(assistantMsgId, {
                content: (current?.content ?? '') + `\n\nError: ${event.error}`,
              })
            }
          }
        }

        // If no assistant text came through, add a fallback
        if (!hasAddedAssistant) {
          addMessage({
            id: assistantMsgId,
            role: 'assistant',
            content: 'No response generated.',
            timestamp: Date.now(),
          })
        }
      } catch (err) {
        addMessage({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
          timestamp: Date.now(),
          toolResult: {
            toolCallId: 'agent',
            content: 'Agent query failed',
            isError: true,
          },
        })
      } finally {
        setIsProcessing(false)
      }
    },
    [input, isProcessing, isConnected, availableTools, mcpServerUrl, sessionId, addMessage, updateMessage, parseCommand, setIsProcessing, setSessionId],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (commandHistory.length === 0) return
        const newIndex = historyIndex === -1 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1)
        setHistoryIndex(newIndex)
        setInput(commandHistory[newIndex])
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (historyIndex === -1) return
        const newIndex = historyIndex + 1
        if (newIndex >= commandHistory.length) {
          setHistoryIndex(-1)
          setInput('')
        } else {
          setHistoryIndex(newIndex)
          setInput(commandHistory[newIndex])
        }
      }
    },
    [commandHistory, historyIndex],
  )

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto terminal-scroll p-4 space-y-2">
        {/* Welcome message */}
        {messages.length === 0 && (
          <div className="space-y-2">
            <pre className="text-rail-purple text-sm leading-tight ascii-3d">
{`██████   █████  ██ ██      ██     ██  █████  ██    ██
██   ██ ██   ██ ██ ██      ██     ██ ██   ██  ██  ██
██████  ███████ ██ ██      ██  █  ██ ███████   ████
██   ██ ██   ██ ██ ██      ██ ███ ██ ██   ██    ██
██   ██ ██   ██ ██ ███████  ███ ███  ██   ██    ██`}
            </pre>
            <p className="text-rail-text-dim text-xs">
              Railway Terminal v1.0.0
            </p>
            <p className="text-rail-text-dim text-xs">
              Ask anything in natural language, or type <span className="text-rail-purple">/help</span> for commands.
              {!isConnected && (
                <span>
                  {' '}Open <span className="text-rail-purple">settings</span> to connect for Railway tools.
                </span>
              )}
            </p>
            <div className="border-t border-rail-border mt-3 pt-1" />
          </div>
        )}

        {messages.map((msg) => (
          <MessageLine key={msg.id} message={msg} />
        ))}

        {isProcessing && (
          <div className="flex items-center gap-2 text-rail-text-dim text-xs">
            <Loader2 size={12} className="animate-spin text-rail-purple" />
            <span>Processing...</span>
          </div>
        )}
      </div>

      {/* Input area */}
      <form onSubmit={handleSubmit} className="shrink-0 border-t border-rail-border">
        <div className="flex items-center gap-2 px-4 py-2.5 bg-rail-elevated/50">
          <ChevronRight size={14} className="text-rail-purple shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isConnected ? 'Ask anything or enter a /command...' : 'Ask anything or connect for Railway tools...'}
            className="flex-1 bg-transparent text-sm text-rail-text placeholder:text-rail-text-muted outline-none font-mono"
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="submit"
            disabled={!input.trim() || isProcessing}
            className="p-1.5 rounded text-rail-text-dim hover:text-rail-purple disabled:opacity-30 transition-colors"
          >
            <Send size={14} />
          </button>
        </div>
      </form>
    </div>
  )
}

function ToolCallBlock({ toolCall }: { toolCall: ToolCall }) {
  const [expanded, setExpanded] = useState(false)
  const isRunning = toolCall.status === 'running'
  const isError = toolCall.status === 'error'

  return (
    <div className="my-1">
      <button
        type="button"
        onClick={() => !isRunning && setExpanded(!expanded)}
        className={`flex items-center gap-1.5 text-xs font-mono w-full text-left py-1 px-2 rounded transition-colors ${
          isRunning
            ? 'text-rail-yellow bg-rail-yellow/5 cursor-default'
            : isError
              ? 'text-rail-red hover:bg-rail-red/10 cursor-pointer'
              : 'text-rail-green hover:bg-rail-green/10 cursor-pointer'
        }`}
      >
        {isRunning ? (
          <Loader2 size={11} className="animate-spin shrink-0" />
        ) : isError ? (
          <XCircle size={11} className="shrink-0" />
        ) : (
          <CheckCircle2 size={11} className="shrink-0" />
        )}
        <Wrench size={10} className="shrink-0 opacity-60" />
        <span className="truncate">{toolCall.name}</span>
        {!isRunning && (
          <ChevronDown
            size={11}
            className={`shrink-0 ml-auto transition-transform ${expanded ? 'rotate-180' : ''}`}
          />
        )}
        {isRunning && (
          <span className="ml-auto text-[10px] opacity-60">running</span>
        )}
      </button>

      {expanded && !isRunning && (
        <div className="ml-2 mt-1 border-l-2 border-rail-border pl-3 space-y-1.5">
          {toolCall.arguments && toolCall.arguments !== '{}' && (
            <div>
              <span className="text-[10px] text-rail-text-dim uppercase tracking-wider">Input</span>
              <pre className="text-[11px] text-rail-text-dim whitespace-pre-wrap break-all font-mono mt-0.5 bg-rail-deep/50 rounded p-2 max-h-40 overflow-y-auto terminal-scroll">
                {toolCall.arguments}
              </pre>
            </div>
          )}
          {toolCall.result && (
            <div>
              <span className={`text-[10px] uppercase tracking-wider ${isError ? 'text-rail-red' : 'text-rail-text-dim'}`}>
                Result
              </span>
              <pre className={`text-[11px] whitespace-pre-wrap break-all font-mono mt-0.5 rounded p-2 max-h-60 overflow-y-auto terminal-scroll ${
                isError ? 'text-rail-red/80 bg-rail-red/5' : 'text-rail-text-dim bg-rail-deep/50'
              }`}>
                {toolCall.result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MessageLine({ message }: { message: ChatMessage }) {
  const { role, content, toolCalls, toolResult } = message

  if (role === 'user') {
    return (
      <div className="flex items-start gap-2">
        <ChevronRight size={12} className="text-rail-pink mt-0.5 shrink-0" />
        <span className="text-xs text-rail-pink whitespace-pre-wrap break-all font-mono">{content}</span>
      </div>
    )
  }

  if (role === 'system') {
    // If this message has tool calls, render them as expandable blocks
    if (toolCalls && toolCalls.length > 0) {
      return (
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5 text-rail-text-dim text-[11px]">
            <Wrench size={10} className="text-rail-yellow shrink-0" />
            <span>{content}</span>
          </div>
          {toolCalls.map((tc) => (
            <ToolCallBlock key={tc.id} toolCall={tc} />
          ))}
        </div>
      )
    }

    return (
      <div className="flex items-start gap-2">
        <span className="text-rail-text-dim text-xs shrink-0">~</span>
        <pre className="text-xs text-rail-text-dim whitespace-pre-wrap break-all font-mono">{content}</pre>
      </div>
    )
  }

  if (role === 'assistant') {
    const isError = toolResult?.isError
    const isAgentResponse = !toolResult
    return (
      <div className="flex items-start gap-2">
        {isError ? (
          <AlertCircle size={12} className="text-rail-red mt-0.5 shrink-0" />
        ) : isAgentResponse ? (
          <Bot size={12} className="text-rail-purple mt-0.5 shrink-0" />
        ) : (
          <span className="text-rail-green text-xs shrink-0 mt-0.5">$</span>
        )}
        <div
          className={`text-xs font-mono min-w-0 ${
            isError ? 'text-rail-red' : isAgentResponse ? 'text-rail-text' : 'text-rail-green'
          } markdown-body`}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      </div>
    )
  }

  return null
}
