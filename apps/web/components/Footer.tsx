import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <div>© {new Date().getFullYear()} SpotWave — Prévisions de surf notées sur 10.</div>
        <div style={{ display: 'flex', gap: 20 }}>
          <Link href="/spots">Tous les spots</Link>
          <a href="https://spotwave.fr" target="_blank" rel="noreferrer">
            App mobile
          </a>
        </div>
      </div>
    </footer>
  );
}
