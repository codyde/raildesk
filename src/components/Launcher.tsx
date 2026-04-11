import { Terminal, Settings } from 'lucide-react'
import { useDesktopStore } from '@/lib/store'

interface LauncherItem {
  id: string
  label: string
  icon: React.ReactNode
  onClick: () => void
  isActive: boolean
}

export function Launcher() {
  const showSettings = useDesktopStore((s) => s.showSettings)
  const toggleSettings = useDesktopStore((s) => s.toggleSettings)
  const isTerminalOpen = useDesktopStore((s) => s.isTerminalOpen)
  const toggleTerminal = useDesktopStore((s) => s.toggleTerminal)

  const items: LauncherItem[] = [
    {
      id: 'terminal',
      label: 'Terminal',
      icon: <Terminal size={20} />,
      onClick: toggleTerminal,
      isActive: isTerminalOpen,
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: <Settings size={20} />,
      onClick: () => {
        if (!isTerminalOpen) toggleTerminal()
        if (!showSettings) toggleSettings()
      },
      isActive: showSettings,
    },
  ]

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[100]">
      <div className="flex items-center gap-1 px-2 py-1.5 rounded-xl bg-rail-elevated/90 backdrop-blur-sm border border-rail-border">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={item.onClick}
            className={`relative group flex items-center justify-center w-10 h-10 rounded-lg transition-all ${
              item.isActive
                ? 'bg-rail-purple/20 text-rail-purple'
                : 'text-rail-text-dim hover:bg-rail-border/50 hover:text-rail-text'
            }`}
          >
            {item.icon}

            {/* Tooltip */}
            <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-rail-card border border-rail-border text-[10px] text-rail-text whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              {item.label}
            </span>

            {/* Active indicator dot */}
            {item.isActive && (
              <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-rail-purple" />
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
