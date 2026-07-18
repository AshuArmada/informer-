import { useEffect, useState } from 'react'

export const VIEWS = ['trending', 'saved', 'reports', 'settings'] as const
export type View = (typeof VIEWS)[number]

function currentView(): View {
  const hash = window.location.hash.replace(/^#\/?/, '') as View
  return VIEWS.includes(hash) ? hash : 'trending'
}

/** Set the active view by updating the URL hash. Safe to call from anywhere. */
export function navigateTo(view: View): void {
  if (currentView() !== view) window.location.hash = view
}

/** Reads the active view from `location.hash` and keeps it in sync with the browser. */
export function useHashRoute(): [View, (view: View) => void] {
  const [view, setView] = useState<View>(currentView)

  useEffect(() => {
    const onChange = () => setView(currentView())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  return [view, navigateTo]
}
