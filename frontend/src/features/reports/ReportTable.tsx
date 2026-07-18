import { useEffect, useState } from 'react'
import { CircleDot, GitPullRequest, Users, Inbox, CircleAlert } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { api, type RepoReport, type ReportResponse } from '@/lib/api'

function RepoBlock({ repo }: { repo: RepoReport }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <a
          href={repo.html_url}
          target="_blank"
          rel="noreferrer"
          className="font-medium hover:text-brand"
        >
          {repo.full_name}
        </a>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <CircleDot className="size-3.5" /> {repo.open_issue_count} open
          </span>
          <span className="flex items-center gap-1">
            <GitPullRequest className="size-3.5" />
            {repo.pr_counts.open} open · {repo.pr_counts.merged} merged · {repo.pr_counts.closed}{' '}
            closed
          </span>
        </div>
      </div>

      {repo.error ? (
        <p className="mt-3 text-sm text-destructive">{repo.error}</p>
      ) : repo.groups.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No open issues 🎉</p>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          {repo.groups.map((group) => (
            <div key={group.assignee ?? '__unassigned__'} className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2 text-sm font-medium">
                {group.avatar_url ? (
                  <img src={group.avatar_url} alt="" className="size-5 rounded-full" />
                ) : (
                  <span className="flex size-5 items-center justify-center rounded-full bg-muted">
                    <Users className="size-3 text-muted-foreground" />
                  </span>
                )}
                {group.assignee ?? 'Unassigned'}
                <Badge variant="secondary" className="text-xs">
                  {group.count}
                </Badge>
              </div>
              <ul className="ml-7 flex flex-col gap-1">
                {group.issues.map((issue) => (
                  <li key={issue.number} className="text-sm">
                    <a
                      href={issue.html_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted-foreground hover:text-brand"
                    >
                      <span className="tabular-nums">#{issue.number}</span> {issue.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function ReportTable({ reloadKey }: { reloadKey: number }) {
  const [data, setData] = useState<ReportResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    setError(null)
    api
      .getReport()
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [reloadKey])

  if (error) {
    return (
      <Alert variant="destructive">
        <CircleAlert className="size-4" />
        <AlertTitle>Couldn't build the report</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  if (loading && !data) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-xl" />
        ))}
      </div>
    )
  }

  if (data && data.repos.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
        <Inbox className="size-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          No repositories tracked yet — add some above to see their issues and PRs here.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {data?.repos.map((repo) => (
        <RepoBlock key={repo.full_name} repo={repo} />
      ))}
    </div>
  )
}
