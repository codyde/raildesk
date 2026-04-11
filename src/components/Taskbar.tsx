import { Wifi, WifiOff, Train } from 'lucide-react'
import { useDesktopStore } from '@/lib/store'

export function Taskbar() {
  const isConnected = useDesktopStore((s) => s.isConnected)
  const availableTools = useDesktopStore((s) => s.availableTools)

  const now = new Date()
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const date = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })

  return (
    <div className="absolute top-0 left-0 right-0 h-8 bg-rail-elevated/95 backdrop-blur-sm border-b border-rail-border flex items-center justify-between px-4 z-[100]">
      {/* Left: branding */}
      <div className="flex items-center gap-2">
        <Train size={14} className="text-rail-purple" />
        <span className="text-[11px] font-bold text-rail-text tracking-wider">Railway</span>
      </div>

      {/* Right: status indicators */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          {isConnected ? (
            <Wifi size={11} className="text-rail-green" />
          ) : (
            <WifiOff size={11} className="text-rail-text-muted" />
          )}
          <span className={`text-[10px] ${isConnected ? 'text-rail-green' : 'text-rail-text-muted'}`}>
            {isConnected ? `${availableTools.length} tools` : 'offline'}
          </span>
        </div>

        <div className="w-px h-4 bg-rail-border" />
        <span className="text-[11px] text-rail-text-dim tabular-nums">{date} {time}</span>
      </div>
    </div>
  )
}
