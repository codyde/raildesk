import { createFileRoute } from '@tanstack/react-router'
import { Desktop } from '@/components/Desktop'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  return <Desktop />
}
