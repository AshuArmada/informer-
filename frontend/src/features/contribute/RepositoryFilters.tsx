import { SlidersHorizontal, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { defaultFilters, type RepositoryFiltersValue } from './filters'

const selectClass = 'mt-1.5 h-10 w-full rounded-lg border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand'

export function RepositoryFilters({ value, onChange }: { value: RepositoryFiltersValue; onChange: (value: RepositoryFiltersValue) => void }) {
  const count = Object.entries(value).filter(([key, v]) => v !== defaultFilters[key as keyof RepositoryFiltersValue]).length
  const set = <K extends keyof RepositoryFiltersValue>(key: K, next: RepositoryFiltersValue[K]) => onChange({ ...value, [key]: next })
  return <details className="rounded-xl border bg-background/70" open={count > 0 || undefined}>
    <summary className="flex cursor-pointer items-center gap-2 rounded-xl p-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"><SlidersHorizontal className="size-4 text-brand" /> Refine your search <span className="ml-auto text-xs text-muted-foreground">{count ? `${count} filters selected` : 'Topics, issues, license & activity'}</span></summary>
    <div className="space-y-4 border-t p-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs font-medium">Repository topic<Input className="mt-1.5 h-10" value={value.topic} onChange={e => set('topic', e.target.value.toLowerCase())} pattern={String.raw`[a-z0-9\-]*`} maxLength={50} placeholder="e.g. machine-learning" /></label>
        <label className="text-xs font-medium">Open issue label<Input className="mt-1.5 h-10" value={value.issue_label} onChange={e => set('issue_label', e.target.value)} maxLength={50} list="issue-labels" placeholder="Any label, e.g. bug" /><datalist id="issue-labels">{['good first issue', 'help wanted', 'bug', 'documentation', 'enhancement', 'hacktoberfest'].map(label => <option key={label} value={label} />)}</datalist></label>
        <label className="text-xs font-medium">License<select className={selectClass} value={value.license} onChange={e => set('license', e.target.value)}><option value="">Any license</option><option value="mit">MIT</option><option value="apache-2.0">Apache 2.0</option><option value="gpl-3.0">GPL 3.0</option><option value="bsd-3-clause">BSD 3-Clause</option><option value="mpl-2.0">Mozilla 2.0</option></select></label>
        <label className="text-xs font-medium">Minimum stars<Input className="mt-1.5 h-10" type="number" min={0} max={10000000} step={1} value={value.min_stars} onChange={e => set('min_stars', Number(e.target.value))} /></label>
        <label className="text-xs font-medium">Last code push<select className={selectClass} value={value.activity_days} onChange={e => set('activity_days', Number(e.target.value))}>{[7, 30, 90, 365].map(days => <option key={days} value={days}>Within {days} days</option>)}</select></label>
        <label className="flex items-center gap-2 self-end rounded-lg border p-3 text-sm"><input type="checkbox" checked={value.unassigned} onChange={e => set('unassigned', e.target.checked)} className="size-4 accent-[var(--brand)]" /> Has unassigned open issues</label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="max-w-xl text-xs leading-5 text-muted-foreground">Topic tags describe a repository. Issue labels describe work to do. Label and assignment filters check each fetched batch of projects.</p><Button type="button" size="sm" variant="ghost" onClick={() => onChange({ ...defaultFilters })}><X /> Clear refinements</Button></div>
    </div>
  </details>
}
