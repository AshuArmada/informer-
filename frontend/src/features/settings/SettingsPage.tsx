import { KeyRound, ShieldCheck } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/PageHeader'
import { PatForm } from '@/features/settings/PatForm'
import { ProviderForm } from './ProviderForm'

export function SettingsPage() {
  return (
    <div className="flex w-full flex-col gap-6 px-4 py-8 sm:px-6">
      <PageHeader title="Connections & settings" description="Your tools, your keys. Connect the services behind your next contribution." />
      <div className="flex items-start gap-3 rounded-xl border border-brand/25 bg-brand-muted/40 p-5"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-brand" /><div><h2 className="text-sm font-semibold">Private by default, built for this computer</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">Credentials stay encrypted in your local database. Browser-origin checks, protected changes, and request limits guard the local API. This is a single-user app; public hosting needs authentication and HTTPS.</p></div></div>

      <Card className="max-w-2xl">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
              <KeyRound className="size-5" />
            </div>
            <div className="flex flex-col gap-1">
              <CardTitle>GitHub Personal Access Token</CardTitle>
              <CardDescription>
                Contribution discovery, Trending, and Repo Reports need a GitHub token. It's stored encrypted
                in the local database and never sent back to the browser.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <PatForm />
        </CardContent>
      </Card>
      <ProviderForm />
    </div>
  )
}
