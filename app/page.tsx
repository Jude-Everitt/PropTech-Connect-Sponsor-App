import Link from "next/link";

export default function Home() {
  return (
    <main className="portal-shell landing-shell">
      <header className="portal-header"><span className="brand-mark landing-brand-name"><span className="brand-word-proptech">PropTech</span> <span className="brand-word-connect">Connect</span></span><nav className="access-tabs" aria-label="Choose portal sign in"><Link href="/auth/sign-in?role=sponsor">Sponsor sign in</Link><Link href="/auth/sign-in?role=admin">Admin sign in</Link></nav></header>
      <section className="landing-hero">
        <h1 className="landing-title"><span>PropTech</span> <em>Connect</em></h1>
        <p className="intro-copy">We connect Global executives, investors, and entrepreneurs to drive innovation in Real Estate</p>
        <Link href="/auth/sign-in?role=sponsor" className="primary-button">Enter the event hub <span>↗</span></Link>
      </section>
      <footer className="landing-footer"><span>PTC 2022</span><span>Built for the people behind the event</span></footer>
    </main>
  );
}
