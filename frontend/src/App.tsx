import { useState } from 'react'
import { Sparkles, Mail, Settings as SettingsIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ThemeToggle } from '@/components/ThemeToggle'
import { SettingsPage } from '@/features/settings/SettingsPage'

type View = 'trending' | 'reports' | 'settings'

const NAV_ITEMS: { id: View; label: string; icon: typeof Sparkles }[] = [
  { id: 'trending', label: 'Trending', icon: Sparkles },
  { id: 'reports', label: 'Reports', icon: Mail },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
]

function ComingSoon({ title }: { title: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
      <h2 className="text-lg font-medium">{title}</h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        Not built yet — this view lands in a later milestone.
      </p>
    </div>
  )
}

function App() {
  const [view, setView] = useState<View>('settings')

  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-2 font-semibold">
          <Sparkles className="size-5" />
          Informer
        </div>
        <nav className="flex items-center gap-1">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setView(id)}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                view === id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </nav>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 flex-col">
        {view === 'trending' && <ComingSoon title="Trending feed" />}
        {view === 'reports' && <ComingSoon title="Repo issue/PR reports" />}
        {view === 'settings' && <SettingsPage />}
      </main>
    </div>
  )
}

export default App
