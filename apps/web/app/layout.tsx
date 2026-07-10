import type { Metadata, Viewport } from 'next';
import './globals.css';
import Header from '../components/Header';
import Footer from '../components/Footer';
import RegisterSW from '../components/RegisterSW';

export const metadata: Metadata = {
  metadataBase: new URL('https://spotwave.fr'),
  title: {
    default: 'SpotWave — Prévisions de surf notées sur 10',
    template: '%s · SpotWave',
  },
  description:
    'Prévisions de surf claires et notées sur 10 pour des centaines de spots dans le monde. Houle, vent, marée et le meilleur créneau du jour, en un coup d’œil.',
  keywords: ['prévision surf', 'surf forecast', 'houle', 'spots de surf', 'conditions de surf'],
  applicationName: 'SpotWave',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'SpotWave' },
  openGraph: {
    type: 'website',
    siteName: 'SpotWave',
    locale: 'fr_FR',
  },
  twitter: { card: 'summary_large_image' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0e3a45',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <Header />
        {children}
        <Footer />
        <RegisterSW />
      </body>
    </html>
  );
}
