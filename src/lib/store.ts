import { create } from 'zustand'

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool'

export type ToolCallStatus = 'running' | 'completed' | 'error'

export interface ToolCall {
  id: string
  name: string
  arguments: string
  status: ToolCallStatus
  result?: string
  isError?: boolean
}

export interface ToolResult {
  toolCallId: string
  content: string
  isError?: boolean
}

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  timestamp: number
  toolCalls?: ToolCall[]
  toolResult?: ToolResult
}

export interface McpTool {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
}

interface DesktopState {
  // Canvas pan
  canvasOffset: { x: number; y: number }
  setCanvasOffset: (offset: { x: number; y: number }) => void

  // Terminal window position
  windowPosition: { x: number; y: number }
  setWindowPosition: (pos: { x: number; y: number }) => void
  windowSize: { width: number; height: number }
  setWindowSize: (size: { width: number; height: number }) => void
  isWindowMaximized: boolean
  toggleMaximize: () => void

  // MCP connection
  mcpServerUrl: string
  setMcpServerUrl: (url: string) => void
  isConnected: boolean
  setIsConnected: (connected: boolean) => void
  availableTools: McpTool[]
  setAvailableTools: (tools: McpTool[]) => void

  // Chat
  messages: ChatMessage[]
  addMessage: (message: ChatMessage) => void
  updateMessage: (id: string, updates: Partial<ChatMessage>) => void
  clearMessages: () => void
  isProcessing: boolean
  setIsProcessing: (processing: boolean) => void

  // Session continuity
  sessionId: string | null
  setSessionId: (id: string | null) => void
  dbSessionId: string | null
  setDbSessionId: (id: string | null) => void

  // Settings panel
  showSettings: boolean
  toggleSettings: () => void

  // Terminal window visibility
  isTerminalOpen: boolean
  toggleTerminal: () => void
}

export const useDesktopStore = create<DesktopState>((set) => ({
  canvasOffset: { x: 0, y: 0 },
  setCanvasOffset: (offset) => set({ canvasOffset: offset }),

  windowPosition: { x: 80, y: 40 },
  setWindowPosition: (pos) => set({ windowPosition: pos }),
  windowSize: { width: 800, height: 560 },
  setWindowSize: (size) => set({ windowSize: size }),
  isWindowMaximized: false,
  toggleMaximize: () =>
    set((state) => ({ isWindowMaximized: !state.isWindowMaximized })),

  mcpServerUrl: '',
  setMcpServerUrl: (url) => set({ mcpServerUrl: url }),
  isConnected: false,
  setIsConnected: (connected) => set({ isConnected: connected }),
  availableTools: [],
  setAvailableTools: (tools) => set({ availableTools: tools }),

  messages: [],
  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),
  updateMessage: (id, updates) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === id ? { ...m, ...updates } : m,
      ),
    })),
  clearMessages: () => set({ messages: [], sessionId: null, dbSessionId: null }),
  isProcessing: false,
  setIsProcessing: (processing) => set({ isProcessing: processing }),

  sessionId: null,
  setSessionId: (id) => set({ sessionId: id }),
  dbSessionId: null,
  setDbSessionId: (id) => set({ dbSessionId: id }),

  showSettings: false,
  toggleSettings: () => set((state) => ({ showSettings: !state.showSettings })),

  isTerminalOpen: true,
  toggleTerminal: () => set((state) => ({ isTerminalOpen: !state.isTerminalOpen })),
}))
