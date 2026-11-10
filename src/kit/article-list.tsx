// An article list: a row per article with its date (or a Draft chip) and its tag on the left, the title and a line
// about it on the right. Drafts carry data-draft, so a build can refuse to ship one. Renders on the server.
export type ArticleRow = { href: string; title: string; description: string; date?: string; tag?: string; /** Tag chip on the dark side of the palette. */ dark?: boolean; draft?: boolean }

export function ArticleList({ items, level = 2 }: { items: ArticleRow[]; level?: 2 | 3 }) {
  const H = `h${level}` as 'h2'
  return <div className="k-articles">{items.map(a => <article key={a.href} className="k-article" data-draft={a.draft || undefined}>
    <div className="k-article-meta">{a.draft ? <span className="k-badge" data-tone="warning">Draft</span> : a.date && <time dateTime={a.date}>{a.date}</time>}{a.tag && <span className="k-article-tag" data-palette={a.dark ? 'dark' : 'light'}>{a.tag}</span>}</div>
    <div><H><a href={a.href}>{a.title}</a></H><p>{a.description}</p></div>
  </article>)}</div>
}
