import { useCallback, useRef, useState } from 'react'
import { useDesktopStore } from '@/lib/store'
import { TerminalWindow } from './TerminalWindow'
import { Taskbar } from './Taskbar'
import { Launcher } from './Launcher'

export function Desktop() {
  const canvasOffset = useDesktopStore((s) => s.canvasOffset)
  const setCanvasOffset = useDesktopStore((s) => s.setCanvasOffset)

  const isPanning = useRef(false)
  const panStart = useRef({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)

  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Only pan on middle-click or when clicking directly on the canvas background
      const target = e.target as HTMLElement
      if (target.closest('[data-window]')) return

      if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
        e.preventDefault()
        isPanning.current = true
        setIsDragging(true)
        panStart.current = {
          x: e.clientX - canvasOffset.x,
          y: e.clientY - canvasOffset.y,
        }
      }
    },
    [canvasOffset],
  )

  const handleCanvasMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isPanning.current) return
      setCanvasOffset({
        x: e.clientX - panStart.current.x,
        y: e.clientY - panStart.current.y,
      })
    },
    [],
  )

  const handleCanvasMouseUp = useCallback(() => {
    isPanning.current = false
    setIsDragging(false)
  }, [])

  return (
    <div className="relative w-full h-full overflow-hidden bg-rail-deep">
      {/* Desktop background image */}
      <div className="absolute inset-0 desktop-bg-image pointer-events-none" />

      {/* Menu bar - fixed at top */}
      <Taskbar />

      {/* Desktop canvas */}
      <div
        className="absolute inset-0 desktop-grid"
        style={{
          cursor: isDragging ? 'grabbing' : 'default',
          backgroundPosition: `${canvasOffset.x}px ${canvasOffset.y}px`,
        }}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={handleCanvasMouseUp}
        onMouseLeave={handleCanvasMouseUp}
      >
        {/* Canvas content layer that moves with pan offset */}
        <div
          style={{
            transform: `translate(${canvasOffset.x}px, ${canvasOffset.y}px)`,
          }}
        >
          <TerminalWindow />
        </div>
      </div>

      {/* Launcher dock - fixed at bottom center */}
      <Launcher />
    </div>
  )
}
