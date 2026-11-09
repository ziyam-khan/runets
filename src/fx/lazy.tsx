'use client'
// <LazyFx>: the same as <Fx>, but the engine and its shaders load after the page has, in their own chunk.
// Use it wherever first paint matters; the element looks right without the effect.
import { useEffect, useState, type ComponentType } from 'react'
import type { FxProps } from './fx'

let loaded: ComponentType<FxProps> | null = null
export function LazyFx(props: FxProps) {
  const [Fx, setFx] = useState<ComponentType<FxProps> | null>(() => loaded)
  useEffect(() => {
    if (Fx) return
    let live = true
    const go = () => import('./fx').then(m => { loaded = m.Fx; if (live) setFx(() => m.Fx) }).catch(() => {})
    if (document.readyState === 'complete') go(); else window.addEventListener('load', go, { once: true })
    return () => { live = false; window.removeEventListener('load', go) }
  }, [Fx])
  return Fx ? <Fx {...props} /> : null
}
