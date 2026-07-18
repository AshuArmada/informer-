import { Sparkles, Mail, Settings as SettingsIcon, TrendingUp, Bookmark } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ThemeToggle } from '@/components/ThemeToggle'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { TrendingPage } from '@/features/trending/TrendingPage'
import { ReportsPage } from '@/features/reports/ReportsPage'
import { SavedPage } from '@/features/saved/SavedPage'
import { useHashRoute, type View } from '@/hooks/useHashRoute'

const NAV_ITEMS: { id: View; label: string; icon: typeof Sparkles }[] = [
  { id: 'trending', label: 'Trending', icon: TrendingUp },
  { id: 'saved', label: 'Saved', icon: Bookmark },
  { id: 'reports', label: 'Reports', icon: Mail },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
]

function App() {
  const [view, navigate] = useHashRoute()

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
                onClick={() => navigate(id)}
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
        {view === 'saved' && <SavedPage />}
        {view === 'reports' && <ReportsPage />}
        {view === 'settings' && <SettingsPage />}
      </main>
    </div>
  )
}

export default App
