// Marketing frame for the landing page: top header and footer.
import Link from "next/link";
import Logo from "@/app/components/Logo";
import ScrollBar from "@/app/components/ScrollBar";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ScrollBar />
      <header className="site">
        <div className="shell row spread">
          <Link className="brand" href="/">
            <Logo />
            <span>
              Shielded <b>Quest</b>
            </span>
          </Link>
          <nav className="nav">
            <Link href="/create">Create</Link>
            <Link href="/docs">Docs</Link>
            <Link className="btn primary sm" href="/hunts">
              Explore hunts
            </Link>
          </nav>
        </div>
      </header>
      {children}
      <footer className="site">
        <div className="shell">
          <div className="foot-grid">
            <div data-reveal>
              <Link className="brand" href="/">
                <Logo size={22} />
                <span>
                  Shielded <b>Quest</b>
                </span>
              </Link>
              <p className="muted small">
                Puzzle-gated prizes on Zcash. Built for the Zecathon by Diaguren Labs. Testnet only.
              </p>
            </div>
            <div className="foot-links" data-reveal style={{ ["--i" as string]: 1 }}>
              <Link href="/hunts">Hunts</Link>
              <Link href="/create">Create a hunt</Link>
              <Link href="/demo">One-minute hunt</Link>
            </div>
            <div className="foot-links" data-reveal style={{ ["--i" as string]: 2 }}>
              <Link href="/docs">Docs</Link>
              <Link href="/docs/privacy">Privacy &amp; threat model</Link>
              <Link href="/docs/verify">Verify it yourself</Link>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
