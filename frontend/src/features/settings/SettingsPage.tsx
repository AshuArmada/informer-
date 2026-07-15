import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PatForm } from '@/features/settings/PatForm'

export function SettingsPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>GitHub Personal Access Token</CardTitle>
          <CardDescription>
            Both the Trending feed and Repo Reports need a GitHub token to talk to the API. It's
            stored encrypted in the local database and never sent back to the browser.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PatForm />
        </CardContent>
      </Card>
    </div>
  )
}
