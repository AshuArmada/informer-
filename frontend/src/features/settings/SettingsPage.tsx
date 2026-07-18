import { KeyRound } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/PageHeader'
import { PatForm } from '@/features/settings/PatForm'

export function SettingsPage() {
  return (
    <div className="flex w-full flex-col gap-6 px-4 py-8 sm:px-6">
      <PageHeader title="Settings" description="Manage the credentials Informer uses." />

      <Card className="max-w-2xl">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
              <KeyRound className="size-5" />
            </div>
            <div className="flex flex-col gap-1">
              <CardTitle>GitHub Personal Access Token</CardTitle>
              <CardDescription>
                Both the Trending feed and Repo Reports need a GitHub token. It's stored encrypted
                in the local database and never sent back to the browser.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <PatForm />
        </CardContent>
      </Card>
    </div>
  )
}
