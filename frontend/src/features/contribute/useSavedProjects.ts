import { createContext, useEffect, useRef, useState } from 'react'
import { api, type ContributionRepo } from '@/lib/api'

export type SaveableProject = Pick<ContributionRepo, 'full_name' | 'description' | 'language' | 'html_url'> & { stars: number | null }

export const SavedProjectsContext = createContext<ReturnType<typeof useSavedProjects> | null>(null)

export function useSavedProjects() {
  const [saved, setSaved] = useState<Map<string, string> | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [pending, setPending] = useState<Set<string>>(new Set())
  const [errors, setErrors] = useState<Record<string, string | null>>({})
  const inFlight = useRef(new Set<string>())

  useEffect(() => {
    let active = true
    api.getSaved().then(repos => {
      if (active) setSaved(new Map(repos.map(repo => [repo.repo_full_name.toLowerCase(), repo.repo_full_name])))
    }).catch(error => {
      if (active) setLoadError(error instanceof Error ? error.message : 'Could not check saved projects.')
    })
    return () => { active = false }
  }, [attempt])

  async function toggle(repo: SaveableProject) {
    const key = repo.full_name.toLowerCase()
    if (!saved || inFlight.current.has(key)) return
    const savedName = saved.get(key)
    inFlight.current.add(key)
    setPending(new Set(inFlight.current))
    setErrors(previous => ({ ...previous, [key]: null }))
    try {
      if (savedName) await api.unsaveRepo(savedName)
      else await api.saveRepo({ repo_full_name: repo.full_name, description: repo.description, language: repo.language, html_url: repo.html_url, stars: repo.stars ?? 0 })
      setSaved(previous => {
        const next = new Map(previous)
        if (savedName) next.delete(key)
        else next.set(key, repo.full_name)
        return next
      })
    } catch (error) {
      setErrors(previous => ({ ...previous, [key]: error instanceof Error ? error.message : 'Could not update this project. Try again.' }))
    } finally {
      inFlight.current.delete(key)
      setPending(new Set(inFlight.current))
    }
  }

  function retry() {
    setLoadError(null)
    setAttempt(value => value + 1)
  }

  return { saved, pending, errors, loadError, toggle, retry }
}
