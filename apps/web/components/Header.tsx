import Link from 'next/link';

const PLAY_STORE = 'https://play.google.com/store/apps/details?id=com.spotwave.app';

export default function Header() {
  return (
    <header className="header">
      <div className="container header-inner">
        <Link href="/" className="logo">
          <span className="logo-mark">〜</span>
          SpotWave
        </Link>
        <nav className="nav">
          <span className="nav-links">
            <Link href="/spots">Spots</Link>
            <Link href="/#comment">Comment ça marche</Link>
          </span>
          <a className="btn btn-primary" href={PLAY_STORE} target="_blank" rel="noreferrer">
            <span className="btn-full">Télécharger l&apos;app</span>
            <span className="btn-short">App Android</span>
          </a>
        </nav>
      </div>
    </header>
  );
}
