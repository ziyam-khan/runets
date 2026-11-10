'use client'
// A small brick breaker on a canvas. Move the paddle with the pointer or the arrow keys, launch with Space or a click,
// clear every brick to win. Colours are read from the theme (the accent, the ink and the muted ink), so it matches
// either side of a site. It stops drawing when the tab is hidden and announces wins and losses.
import { useEffect, useRef, useState } from 'react'

type Brick = { x: number; y: number; alive: boolean }
const W = 480, H = 320, PADDLE = 72, BALL = 6

export function BrickBreaker({ rows = 4, cols = 8, label = 'Brick breaker' }: { rows?: number; cols?: number; label?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState('Press Space or click to launch.')
  useEffect(() => {
    const canvas = ref.current!, ctx = canvas.getContext('2d')!
    const dpr = Math.min(2, devicePixelRatio || 1)
    canvas.width = W * dpr; canvas.height = H * dpr; ctx.scale(dpr, dpr)
    const css = getComputedStyle(canvas), ink = css.color, accent = css.getPropertyValue('--k-accent').trim() || ink, muted = css.getPropertyValue('--k-muted').trim() || ink
    const bw = (W - 32 - (cols - 1) * 6) / cols, bh = 16
    let bricks: Brick[] = [], paddle = W / 2, ball = { x: 0, y: 0, vx: 0, vy: 0 }, launched = false, over = false, raf = 0, last = 0, keys = 0
    const reset = () => {
      bricks = Array.from({ length: rows * cols }, (_, k) => ({ x: 16 + (k % cols) * (bw + 6), y: 40 + Math.floor(k / cols) * (bh + 6), alive: true }))
      launched = false; over = false; setStatus('Press Space or click to launch.')
    }
    const launch = () => { if (over) reset(); if (!launched) { launched = true; ball.vx = 150 * (Math.random() < 0.5 ? -1 : 1); ball.vy = -230; setStatus('') } }
    const end = (won: boolean) => { over = true; launched = false; setStatus(won ? 'Cleared. Press Space to play again.' : 'Missed. Press Space to try again.') }
    const step = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000 || 0); last = now
      paddle = Math.min(W - PADDLE / 2, Math.max(PADDLE / 2, paddle + keys * 360 * dt))
      if (!launched) { ball.x = paddle; ball.y = H - 28 - BALL }
      else {
        ball.x += ball.vx * dt; ball.y += ball.vy * dt
        if (ball.x < BALL || ball.x > W - BALL) { ball.vx *= -1; ball.x = Math.min(W - BALL, Math.max(BALL, ball.x)) }
        if (ball.y < BALL) { ball.vy = Math.abs(ball.vy) }
        if (ball.vy > 0 && ball.y > H - 28 - BALL && ball.y < H - 18 && Math.abs(ball.x - paddle) < PADDLE / 2 + BALL) {
          ball.vy = -Math.abs(ball.vy) * 1.02; ball.vx = ((ball.x - paddle) / (PADDLE / 2)) * 240 // where it lands on the paddle steers it
        }
        for (const b of bricks) if (b.alive && ball.x > b.x - BALL && ball.x < b.x + bw + BALL && ball.y > b.y - BALL && ball.y < b.y + bh + BALL) { b.alive = false; ball.vy *= -1; break }
        if (bricks.every(b => !b.alive)) end(true)
        else if (ball.y > H + BALL) end(false)
      }
      ctx.clearRect(0, 0, W, H)
      bricks.forEach((b, k) => { if (!b.alive) return; ctx.fillStyle = Math.floor(k / cols) % 2 ? muted : accent; ctx.beginPath(); ctx.roundRect(b.x, b.y, bw, bh, 3); ctx.fill() })
      ctx.fillStyle = ink; ctx.beginPath(); ctx.roundRect(paddle - PADDLE / 2, H - 24, PADDLE, 8, 4); ctx.fill()
      ctx.beginPath(); ctx.arc(ball.x, ball.y, BALL, 0, Math.PI * 2); ctx.fill()
      raf = requestAnimationFrame(step)
    }
    const point = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); paddle = ((e.clientX - r.left) / r.width) * W }
    const down = (e: KeyboardEvent) => { if (e.key === 'ArrowLeft') keys = -1; else if (e.key === 'ArrowRight') keys = 1; else if (e.key === ' ') launch(); else return; e.preventDefault() }
    const up = (e: KeyboardEvent) => { if ((e.key === 'ArrowLeft' && keys < 0) || (e.key === 'ArrowRight' && keys > 0)) keys = 0 }
    reset()
    canvas.addEventListener('pointermove', point); canvas.addEventListener('click', launch); canvas.addEventListener('keydown', down); canvas.addEventListener('keyup', up)
    raf = requestAnimationFrame(step)
    return () => { cancelAnimationFrame(raf); canvas.removeEventListener('pointermove', point); canvas.removeEventListener('click', launch); canvas.removeEventListener('keydown', down); canvas.removeEventListener('keyup', up) }
  }, [rows, cols])
  return <div className="k-bricks">
    <canvas ref={ref} tabIndex={0} aria-label={`${label}: arrow keys move the paddle, Space launches the ball`} style={{ aspectRatio: `${W} / ${H}` }} />
    <p className="k-bricks-status" role="status">{status}</p>
  </div>
}
