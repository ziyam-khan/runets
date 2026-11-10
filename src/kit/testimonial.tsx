// A testimonial: the quote, then who said it, with an optional picture. It is a figure with a blockquote and a
// caption, so it reads as a quote anywhere. No state: it renders on the server.
import type { ReactNode } from 'react'

export function Testimonial({ quote, name, role, avatar, className }: { quote: ReactNode; name?: string; role?: string; /** An image URL; initials stand in without one. */ avatar?: string; className?: string }) {
  const initials = name?.split(/\s+/).map(w => w[0]).slice(0, 2).join('')
  return <figure className={['k-testimonial', className].filter(Boolean).join(' ')}>
    <blockquote>{quote}</blockquote>
    {name && <figcaption>
      <span className="k-testimonial-avatar" aria-hidden="true">{avatar ? <img src={avatar} alt="" width={36} height={36} /> : initials}</span>
      <span><strong>{name}</strong>{role && <span>{role}</span>}</span>
    </figcaption>}
  </figure>
}
