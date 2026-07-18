import { useState } from 'react'
import { ListChecks, Send, CalendarClock } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/PageHeader'
import { RepoPicker } from '@/features/reports/RepoPicker'
import { ReportTable } from '@/features/reports/ReportTable'
import { SendReportForm } from '@/features/reports/SendReportForm'
import { ScheduleSettings } from '@/features/reports/ScheduleSettings'

function SectionTitle({ icon: Icon, title, description }: {
  icon: typeof Send
  title: string
  description: string
}) {
  return (
    <CardHeader>
      <div className="flex items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Icon className="size-5" />
        </div>
        <div className="flex flex-col gap-1">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
      </div>
    </CardHeader>
  )
}

export function ReportsPage() {
  const [reloadKey, setReloadKey] = useState(0)
  const bumpReload = () => setReloadKey((k) => k + 1)

  return (
    <div className="flex w-full flex-col gap-6 px-4 py-8 sm:px-6">
      <PageHeader title="Reports" description="Open issues by assignee and PR counts for the repos you track." />

      <Card>
        <SectionTitle
          icon={ListChecks}
          title="Tracked repositories"
          description="Pick which of your repos appear in reports."
        />
        <CardContent>
          <RepoPicker onTrackedChange={bumpReload} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle icon={Send} title="Send now" description="Email the current report on demand." />
          <CardContent>
            <SendReportForm />
          </CardContent>
        </Card>

        <Card>
          <SectionTitle
            icon={CalendarClock}
            title="Scheduled digest"
            description="Automatically email the report on a schedule."
          />
          <CardContent>
            <ScheduleSettings />
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Preview</h2>
        <ReportTable reloadKey={reloadKey} />
      </div>
    </div>
  )
}
