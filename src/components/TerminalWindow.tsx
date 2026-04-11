import { useCallback, useEffect, useRef, useState } from 'react'
import { Minus, Square, X, Maximize2 } from 'lucide-react'
import { useDesktopStore } from '@/lib/store'
import { TerminalChat } from './TerminalChat'
import { SettingsPanel } from './SettingsPanel'

const SNAP_THRESHOLD = 12
const MENU_BAR_HEIGHT = 32

type SnapZone = 'left' | 'right' | null

export function TerminalWindow() {
  const windowPosition = useDesktopStore((s) => s.windowPosition)
  const setWindowPosition = useDesktopStore((s) => s.setWindowPosition)
  const windowSize = useDesktopStore((s) => s.windowSize)
  const setWindowSize = useDesktopStore((s) => s.setWindowSize)
  const isWindowMaximized = useDesktopStore((s) => s.isWindowMaximized)
  const toggleMaximize = useDesktopStore((s) => s.toggleMaximize)
  const showSettings = useDesktopStore((s) => s.showSettings)
  const isConnected = useDesktopStore((s) => s.isConnected)
  const isTerminalOpen = useDesktopStore((s) => s.isTerminalOpen)
  const toggleTerminal = useDesktopStore((s) => s.toggleTerminal)

  const [isAnimating, setIsAnimating] = useState(false)
  const [snapPreview, setSnapPreview] = useState<SnapZone>(null)
  const [isSnapped, setIsSnapped] = useState<SnapZone>(null)

  const isDragging = useRef(false)
  const dragOffset = useRef({ x: 0, y: 0 })
  const preSnapState = useRef<{ x: number; y: number; w: number; h: number } | null>(null)

  // Resize state
  const isResizing = useRef(false)
  const resizeDir = useRef<string>('')
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0, px: 0, py: 0 })

  // Clamp position so window stays within viewport
  const clampPosition = useCallback(
    (x: number, y: number, w: number, h: number) => {
      const maxX = window.innerWidth - w
      const maxY = window.innerHeight - h
      return {
        x: Math.max(0, Math.min(x, maxX)),
        y: Math.max(MENU_BAR_HEIGHT, Math.min(y, maxY)),
      }
    },
    [],
  )

  // Clamp size so window doesn't extend past viewport
  const clampSize = useCallback(
    (x: number, y: number, w: number, h: number) => {
      const maxW = window.innerWidth - x
      const maxH = window.innerHeight - y
      return {
        width: Math.max(480, Math.min(w, maxW)),
        height: Math.max(320, Math.min(h, maxH)),
      }
    },
    [],
  )

  // Animate to a target state
  const animateTo = useCallback(
    (pos: { x: number; y: number }, size: { width: number; height: number }) => {
      setIsAnimating(true)
      setWindowPosition(pos)
      setWindowSize(size)
      setTimeout(() => setIsAnimating(false), 250)
    },
    [setWindowPosition, setWindowSize],
  )

  // Snap to half screen
  const snapToSide = useCallback(
    (side: 'left' | 'right') => {
      if (!preSnapState.current) {
        preSnapState.current = {
          x: windowPosition.x,
          y: windowPosition.y,
          w: windowSize.width,
          h: windowSize.height,
        }
      }
      const halfW = Math.floor(window.innerWidth / 2)
      const fullH = window.innerHeight - MENU_BAR_HEIGHT
      const x = side === 'left' ? 0 : halfW
      animateTo(
        { x, y: MENU_BAR_HEIGHT },
        { width: halfW, height: fullH },
      )
      setIsSnapped(side)
    },
    [windowPosition, windowSize, animateTo],
  )

  // Restore from snap
  const unsnap = useCallback(() => {
    if (preSnapState.current) {
      const s = preSnapState.current
      preSnapState.current = null
      setIsSnapped(null)
      return s
    }
    setIsSnapped(null)
    return null
  }, [])

  const handleTitleBarMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isWindowMaximized) {
        // Un-maximize on drag
        e.preventDefault()
        e.stopPropagation()
        const newW = preSnapState.current?.w ?? 800
        const newH = preSnapState.current?.h ?? 560

        const ratio = e.clientX / window.innerWidth
        const newX = e.clientX - newW * ratio

        setIsAnimating(true)
        toggleMaximize()
        preSnapState.current = null
        setWindowSize({ width: newW, height: newH })
        setWindowPosition(clampPosition(newX, MENU_BAR_HEIGHT, newW, newH))
        setTimeout(() => setIsAnimating(false), 250)

        isDragging.current = true
        dragOffset.current = {
          x: e.clientX - newX,
          y: e.clientY - MENU_BAR_HEIGHT,
        }
        setupDragListeners()
        return
      }

      e.preventDefault()
      e.stopPropagation()
      isDragging.current = true

      // If snapped, un-snap but keep cursor relative position
      if (isSnapped) {
        const prev = unsnap()
        if (prev) {
          const ratio = e.clientX / window.innerWidth
          const newX = e.clientX - prev.w * ratio
          setWindowSize({ width: prev.w, height: prev.h })
          setWindowPosition(clampPosition(newX, e.clientY - dragOffset.current.y, prev.w, prev.h))
          dragOffset.current = {
            x: e.clientX - newX,
            y: e.clientY - windowPosition.y,
          }
        }
      } else {
        dragOffset.current = {
          x: e.clientX - windowPosition.x,
          y: e.clientY - windowPosition.y,
        }
      }

      setupDragListeners()
    },
    [windowPosition, windowSize, isWindowMaximized, isSnapped, clampPosition, toggleMaximize, unsnap, setWindowPosition, setWindowSize],
  )

  // Separated so we can call it from both maximize-drag and normal drag
  const setupDragListeners = useCallback(() => {
    const handleMouseMove = (me: MouseEvent) => {
      if (!isDragging.current) return

      const currentW = useDesktopStore.getState().windowSize.width
      const currentH = useDesktopStore.getState().windowSize.height

      const newPos = clampPosition(
        me.clientX - dragOffset.current.x,
        me.clientY - dragOffset.current.y,
        currentW,
        currentH,
      )
      setWindowPosition(newPos)

      // Detect edge snap zones
      if (me.clientX <= SNAP_THRESHOLD) {
        setSnapPreview('left')
      } else if (me.clientX >= window.innerWidth - SNAP_THRESHOLD) {
        setSnapPreview('right')
      } else {
        setSnapPreview(null)
      }
    }

    const handleMouseUp = (me: MouseEvent) => {
      isDragging.current = false
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)

      // Snap if releasing in snap zone
      if (me.clientX <= SNAP_THRESHOLD) {
        snapToSide('left')
      } else if (me.clientX >= window.innerWidth - SNAP_THRESHOLD) {
        snapToSide('right')
      }
      setSnapPreview(null)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [clampPosition, setWindowPosition, snapToSide])

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent, direction: string) => {
      if (isWindowMaximized || isSnapped) return
      e.preventDefault()
      e.stopPropagation()
      isResizing.current = true
      resizeDir.current = direction
      resizeStart.current = {
        x: e.clientX,
        y: e.clientY,
        w: windowSize.width,
        h: windowSize.height,
        px: windowPosition.x,
        py: windowPosition.y,
      }

      const handleMouseMove = (me: MouseEvent) => {
        if (!isResizing.current) return
        const dx = me.clientX - resizeStart.current.x
        const dy = me.clientY - resizeStart.current.y
        const dir = resizeDir.current
        let newW = resizeStart.current.w
        let newH = resizeStart.current.h
        let newX = resizeStart.current.px
        let newY = resizeStart.current.py

        if (dir.includes('e')) newW = Math.max(480, resizeStart.current.w + dx)
        if (dir.includes('s')) newH = Math.max(320, resizeStart.current.h + dy)
        if (dir.includes('w')) {
          const dw = Math.min(dx, resizeStart.current.w - 480)
          newW = resizeStart.current.w - dw
          newX = resizeStart.current.px + dw
        }
        if (dir.includes('n')) {
          const dh = Math.min(dy, resizeStart.current.h - 320)
          newH = resizeStart.current.h - dh
          newY = resizeStart.current.py + dh
        }

        newX = Math.max(0, newX)
        newY = Math.max(MENU_BAR_HEIGHT, newY)
        const maxW = window.innerWidth - newX
        const maxH = window.innerHeight - newY
        newW = Math.min(newW, maxW)
        newH = Math.min(newH, maxH)

        setWindowSize({ width: newW, height: newH })
        setWindowPosition({ x: newX, y: newY })
      }

      const handleMouseUp = () => {
        isResizing.current = false
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    },
    [windowSize, windowPosition, isWindowMaximized, isSnapped, setWindowSize, setWindowPosition],
  )

  const handleMaximize = useCallback(() => {
    if (isSnapped) {
      const prev = unsnap()
      if (prev) {
        animateTo({ x: prev.x, y: prev.y }, { width: prev.w, height: prev.h })
      }
      return
    }
    if (!isWindowMaximized) {
      preSnapState.current = {
        x: windowPosition.x,
        y: windowPosition.y,
        w: windowSize.width,
        h: windowSize.height,
      }
    } else {
      const prev = preSnapState.current
      preSnapState.current = null
      if (prev) {
        setIsAnimating(true)
        toggleMaximize()
        setWindowPosition({ x: prev.x, y: prev.y })
        setWindowSize({ width: prev.w, height: prev.h })
        setTimeout(() => setIsAnimating(false), 250)
        return
      }
    }
    setIsAnimating(true)
    toggleMaximize()
    setTimeout(() => setIsAnimating(false), 250)
  }, [isWindowMaximized, isSnapped, windowPosition, windowSize, toggleMaximize, unsnap, animateTo, setWindowPosition, setWindowSize])

  // Re-clamp on window resize
  useEffect(() => {
    const handleResize = () => {
      if (isWindowMaximized) return
      const pos = clampPosition(windowPosition.x, windowPosition.y, windowSize.width, windowSize.height)
      const size = clampSize(pos.x, pos.y, windowSize.width, windowSize.height)
      setWindowPosition(pos)
      setWindowSize(size)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [windowPosition, windowSize, isWindowMaximized, clampPosition, clampSize, setWindowPosition, setWindowSize])

  if (!isTerminalOpen) return null

  const isMaxOrSnapped = isWindowMaximized

  const style = isMaxOrSnapped
    ? {
        position: 'fixed' as const,
        top: MENU_BAR_HEIGHT,
        left: 0,
        width: '100vw',
        height: `calc(100vh - ${MENU_BAR_HEIGHT}px)`,
        zIndex: 50,
      }
    : {
        position: 'absolute' as const,
        left: windowPosition.x,
        top: windowPosition.y,
        width: windowSize.width,
        height: windowSize.height,
      }

  return (
    <>
      {/* Snap preview overlay */}
      {snapPreview && (
        <div
          className="fixed z-[200] rounded-lg border-2 border-rail-purple/40 bg-rail-purple/10 backdrop-blur-sm pointer-events-none"
          style={{
            transition: 'all 150ms ease-out',
            top: MENU_BAR_HEIGHT,
            left: snapPreview === 'left' ? 0 : '50%',
            width: '50%',
            height: `calc(100vh - ${MENU_BAR_HEIGHT}px)`,
          }}
        />
      )}

      <div
        data-window
        style={style}
        className={`flex flex-col window-glow rounded-lg overflow-hidden ${
          isAnimating ? 'window-transition' : ''
        }`}
      >
        {/* Title bar */}
        <div
          className="flex items-center justify-between h-9 px-3 bg-rail-elevated border-b border-rail-border select-none shrink-0"
          onMouseDown={handleTitleBarMouseDown}
          onDoubleClick={handleMaximize}
        >
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-rail-green' : 'bg-rail-red'}`} />
            <span className="text-xs text-rail-text-dim">
              railway-terminal
            </span>
            {isConnected && (
              <span className="text-[10px] text-rail-green">connected</span>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={toggleTerminal}
              className="p-1 rounded hover:bg-rail-border transition-colors"
            >
              <Minus size={12} className="text-rail-text-dim" />
            </button>
            <button
              onClick={handleMaximize}
              className="p-1 rounded hover:bg-rail-border transition-colors"
            >
              {isMaxOrSnapped ? (
                <Square size={10} className="text-rail-text-dim" />
              ) : (
                <Maximize2 size={12} className="text-rail-text-dim" />
              )}
            </button>
            <button
              onClick={toggleTerminal}
              className="p-1 rounded hover:bg-rail-red/30 transition-colors"
            >
              <X size={12} className="text-rail-text-dim" />
            </button>
          </div>
        </div>

        {/* Terminal body */}
        <div className="flex-1 flex overflow-hidden bg-rail-surface">
          {showSettings ? <SettingsPanel /> : <TerminalChat />}
        </div>

        {/* Resize handles */}
        {!isMaxOrSnapped && !isSnapped && (
          <>
            <div className="absolute top-0 left-0 right-0 h-1 cursor-n-resize" onMouseDown={(e) => handleResizeMouseDown(e, 'n')} />
            <div className="absolute bottom-0 left-0 right-0 h-1 cursor-s-resize" onMouseDown={(e) => handleResizeMouseDown(e, 's')} />
            <div className="absolute top-0 bottom-0 left-0 w-1 cursor-w-resize" onMouseDown={(e) => handleResizeMouseDown(e, 'w')} />
            <div className="absolute top-0 bottom-0 right-0 w-1 cursor-e-resize" onMouseDown={(e) => handleResizeMouseDown(e, 'e')} />
            <div className="absolute top-0 left-0 w-3 h-3 cursor-nw-resize" onMouseDown={(e) => handleResizeMouseDown(e, 'nw')} />
            <div className="absolute top-0 right-0 w-3 h-3 cursor-ne-resize" onMouseDown={(e) => handleResizeMouseDown(e, 'ne')} />
            <div className="absolute bottom-0 left-0 w-3 h-3 cursor-sw-resize" onMouseDown={(e) => handleResizeMouseDown(e, 'sw')} />
            <div className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize" onMouseDown={(e) => handleResizeMouseDown(e, 'se')} />
          </>
        )}
      </div>
    </>
  )
}
