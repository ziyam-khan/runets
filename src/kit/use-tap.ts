'use client'
// A soft tap, synthesised: a short sine blip falling from 1.2 kHz with a fast decay, so a press can be heard without
// shipping an audio file. The audio context starts on the first tap (browsers allow it after a gesture).
import { useCallback, useRef } from 'react'

export function useTap({ enabled = true, volume = 0.08 }: { enabled?: boolean; volume?: number } = {}) {
  const ctx = useRef<AudioContext | null>(null)
  return useCallback(() => {
    if (!enabled || typeof AudioContext === 'undefined') return
    const ac = (ctx.current ??= new AudioContext())
    if (ac.state === 'suspended') void ac.resume()
    const t = ac.currentTime, osc = ac.createOscillator(), gain = ac.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(1200, t); osc.frequency.exponentialRampToValueAtTime(420, t + 0.05)
    gain.gain.setValueAtTime(0.0001, t); gain.gain.exponentialRampToValueAtTime(volume, t + 0.004); gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.07)
    osc.connect(gain).connect(ac.destination)
    osc.start(t); osc.stop(t + 0.08)
  }, [enabled, volume])
}
