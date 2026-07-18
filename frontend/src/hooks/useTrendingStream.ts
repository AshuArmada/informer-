import { useEffect, useRef, useState } from 'react'
import type { TrendingResponse } from '@/lib/api'

export type StreamStatus = 'connecting' | 'open' | 'error'

export function useTrendingStream(onMessage: (data: TrendingResponse) => void) {
  const [status, setStatus] = useState<StreamStatus>('connecting')
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  useEffect(() => {
    const source = new EventSource('/api/stream')

    source.addEventListener('trending', (event) => {
      setStatus('open')
      try {
        const payload = JSON.parse((event as MessageEvent).data) as TrendingResponse
        onMessageRef.current(payload)
      } catch {
        // Ignore a malformed frame; the next one will arrive shortly.
      }
    })

    source.onopen = () => setStatus('open')
    source.onerror = () => setStatus('error') // EventSource auto-reconnects on its own.

    return () => source.close()
  }, [])

  return { status }
}
