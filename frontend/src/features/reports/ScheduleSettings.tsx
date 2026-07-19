import { useEffect, useState } from 'react'
import { Loader2, CheckCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { api, type ReportSchedule } from '@/lib/api'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const selectClass =
  'h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'

export function ScheduleSettings() {
  const [schedule, setSchedule] = useState<ReportSchedule | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .getSchedule()
      .then(setSchedule)
      .catch((e: Error) => setError(e.message))
  }, [])

  const patch = (p: Partial<ReportSchedule>) => {
    setSchedule((s) => (s ? { ...s, ...p } : s))
    setSaved(false)
  }

  const save = async () => {
    if (!schedule) return
    setSaving(true)
    setError(null)
    try {
      const updated = await api.updateSchedule(schedule)
      setSchedule(updated)
      setSaved(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (!schedule) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <Label htmlFor="sched-enabled">Recurring digest</Label>
          <span className="text-xs text-muted-foreground">
            Email the report automatically on a schedule.
          </span>
        </div>
        <Switch
          id="sched-enabled"
          checked={schedule.enabled}
          onCheckedChange={(v) => patch({ enabled: v })}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sched-cadence">Cadence</Label>
          <select
            id="sched-cadence"
            className={selectClass}
            value={schedule.cadence}
            onChange={(e) =>
              patch({
                cadence: e.target.value as 'daily' | 'weekly',
                day_of_week:
                  e.target.value === 'weekly' ? (schedule.day_of_week ?? 0) : null,
              })
            }
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sched-time">Time</Label>
          <Input
            id="sched-time"
            type="time"
            value={schedule.time}
            onChange={(e) => patch({ time: e.target.value })}
          />
        </div>

        {schedule.cadence === 'weekly' && (
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="sched-day">Day of week</Label>
            <select
              id="sched-day"
              className={selectClass}
              value={schedule.day_of_week ?? 0}
              onChange={(e) => patch({ day_of_week: Number(e.target.value) })}
            >
              {DAYS.map((d, i) => (
                <option key={i} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="col-span-2 flex flex-col gap-1.5">
          <Label htmlFor="sched-email">Send to</Label>
          <Input
            id="sched-email"
            type="email"
            placeholder="you@example.com"
            value={schedule.email ?? ''}
            onChange={(e) => patch({ email: e.target.value })}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="size-4 animate-spin" />}
          Save schedule
        </Button>
        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
            <CheckCheck className="size-4" /> Saved
          </span>
        )}
        {error && <span className="text-sm text-destructive">{error}</span>}
      </div>
    </div>
  )
}
