import Link from "next/link";

export default function Home() {
  return (
    <main className="portal-shell landing-shell">
      <header className="portal-header"><span className="brand-mark"><span>PTC</span> / CONNECT</span><nav className="access-tabs" aria-label="Choose portal sign in"><Link href="/auth/sign-in?role=sponsor">Sponsor sign in</Link><Link href="/auth/sign-in?role=admin">Admin sign in</Link></nav></header>
      <section className="landing-hero">
        <p className="eyebrow">PropTech Connect / London</p>
        <h1>Make your<br /><em>mark.</em></h1>
        <p className="intro-copy">One considered place for every sponsor commitment, collaboration, and moment that makes the event yours.</p>
        <Link href="/auth/sign-in?role=sponsor" className="primary-button">Enter the event hub <span>↗</span></Link>
      </section>
      <footer className="landing-footer"><span>PTC 2026</span><span>Built for the people behind the event</span></footer>
    </main>
  );
}
