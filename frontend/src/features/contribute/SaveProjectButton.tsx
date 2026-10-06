import { useContext } from 'react'
import { Bookmark, BookmarkCheck, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { SavedProjectsContext, type SaveableProject } from './useSavedProjects'

export function SaveProjectButton({ repo, corner = false }: { repo: SaveableProject; corner?: boolean }) {
  const projects = useContext(SavedProjectsContext)
  if (!projects) throw new Error('SaveProjectButton requires SavedProjectsContext')
  const key = repo.full_name.toLowerCase()
  const saved = projects.saved?.has(key) ?? false
  const pending = projects.pending.has(key)
  const error = projects.loadError || projects.errors[key]

  return <div className={corner ? 'absolute right-3 top-3 z-10' : 'relative'}>
    <Button type="button" variant="ghost" size="icon" className={cn('size-9 rounded-full text-muted-foreground hover:text-brand', saved && 'bg-brand-muted text-brand', error && 'text-destructive')} aria-pressed={saved}
      aria-label={projects.loadError ? `Retry saved status for ${repo.full_name}` : `${saved ? 'Unsave' : 'Save'} ${repo.full_name}`}
      title={projects.loadError ? 'Retry saved status' : pending ? 'Updating...' : saved ? 'Remove from Saved projects' : 'Add to Saved projects'}
      disabled={pending || (!projects.saved && !projects.loadError)}
      onClick={() => projects.loadError ? projects.retry() : void projects.toggle(repo)}>
      {pending || (!projects.saved && !projects.loadError) ? <LoaderCircle className="animate-spin" /> : saved ? <BookmarkCheck /> : <Bookmark />}
    </Button>
    {error && <p role="alert" className="absolute right-0 top-11 w-56 max-w-[calc(100vw-5rem)] rounded-lg border border-destructive/30 bg-background p-3 text-xs text-destructive shadow-sm">{error}</p>}
  </div>
}
