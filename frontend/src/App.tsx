import { useState } from 'react'
import { Sparkles, Mail, Settings as SettingsIcon, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ThemeToggle } from '@/components/ThemeToggle'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { TrendingPage } from '@/features/trending/TrendingPage'

type View = 'trending' | 'reports' | 'settings'

const NAV_ITEMS: { id: View; label: string; icon: typeof Sparkles }[] = [
  { id: 'trending', label: 'Trending', icon: TrendingUp },
  { id: 'reports', label: 'Reports', icon: Mail },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
]

function ComingSoon({ title, icon: Icon }: { title: string; icon: typeof Sparkles }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <Icon className="size-6" />
      </div>
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-medium">{title}</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          Not built yet — this view lands in a later milestone.
        </p>
      </div>
    </div>
  )
}

function App() {
  const [view, setView] = useState<View>('trending')

  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-brand text-brand-foreground">
              <Sparkles className="size-4" />
            </div>
            <span className="font-semibold tracking-tight">Informer</span>
          </div>

          <nav className="flex items-center gap-1 rounded-full bg-muted/60 p-1">
            {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setView(id)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                  view === id
                    ? 'bg-brand-muted text-brand'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="size-4" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </nav>

          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col">
        {view === 'trending' && <TrendingPage />}
        {view === 'reports' && <ComingSoon title="Repo issue/PR reports" icon={Mail} />}
        {view === 'settings' && <SettingsPage />}
      </main>
    </div>
  )
}

export default App
