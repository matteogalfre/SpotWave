import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { scoreLabel } from '@spotwave/core';
import {
  BREAK_LABEL,
  LEVEL_LABEL,
  TIDE_LABEL,
  featuredSpots,
  getSpotBySlug,
  spotDescription,
} from '../../../lib/data';
import { getSpotForecast } from '../../../lib/forecast';
import ScoreBadge from '../../../components/ScoreBadge';

// Re-render server HTML at most every 30 min (fresh scores without rebuilding).
export const revalidate = 1800;

// Pre-render only the popular spots at build time; the other ~340 render
// on-demand on first visit and are then cached (keeps the build fast).
export function generateStaticParams() {
  return featuredSpots(12).map((s) => ({ slug: s.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const spot = getSpotBySlug(slug);
  if (!spot) return {};
  const desc =
    spotDescription(spot) ||
    `Prévision de surf pour ${spot.name} (${spot.region}, ${spot.country}) : houle, vent, marée et score du jour sur 10.`;
  return {
    title: `${spot.name} — Prévision surf`,
    description: desc.slice(0, 160),
    alternates: { canonical: `/spots/${spot.id}` },
    openGraph: {
      title: `${spot.name} — Prévision surf | SpotWave`,
      description: desc.slice(0, 200),
      url: `/spots/${spot.id}`,
      type: 'article',
    },
  };
}

function num(v: number | null | undefined, digits = 1): string {
  return typeof v === 'number' && isFinite(v) ? v.toFixed(digits) : '—';
}

export default async function SpotPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const spot = getSpotBySlug(slug);
  if (!spot) notFound();

  const forecast = await getSpotForecast(spot);
  const c = forecast?.currentCondition;
  const desc = spotDescription(spot);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Place',
    name: spot.name,
    description: desc,
    address: { '@type': 'PostalAddress', addressCountry: spot.country, addressRegion: spot.region },
    geo: { '@type': 'GeoCoordinates', latitude: spot.latitude, longitude: spot.longitude },
  };

  return (
    <main>
      <div className="container">
        <p className="crumb">
          <Link href="/">Accueil</Link> · <Link href="/spots">Spots</Link> · {spot.name}
        </p>

        <div className="detail-head">
          {forecast ? <ScoreBadge score={forecast.currentScore} size={76} /> : null}
          <div>
            <h1>{spot.name}</h1>
            <div className="place">
              {spot.region} · {spot.country}
              {forecast ? ` — ${scoreLabel(forecast.currentScore)}` : ''}
            </div>
          </div>
        </div>

        {forecast && c ? (
          <>
            <div className="cond">
              <div className="box">
                <div className="k">Houle</div>
                <div className="v">{num(c.waveHeight)} m</div>
              </div>
              <div className="box">
                <div className="k">Période</div>
                <div className="v">{num(c.swellPeriod, 0)} s</div>
              </div>
              <div className="box">
                <div className="k">Vent</div>
                <div className="v">{num(c.windSpeed, 0)} km/h</div>
              </div>
              <div className="box">
                <div className="k">Eau</div>
                <div className="v">{num(c.seaTemp, 0)}°C</div>
              </div>
            </div>
            {forecast.bestTime?.label?.trim() ? (
              <p className="note">Meilleur créneau : {forecast.bestTime.label}</p>
            ) : (
              <p className="note">Pas de bon créneau aujourd’hui — conditions faibles.</p>
            )}
          </>
        ) : (
          <p className="note">Prévisions en direct momentanément indisponibles pour ce spot.</p>
        )}

        {desc ? (
          <div className="panel">
            <h3>Le spot</h3>
            <p>{desc}</p>
          </div>
        ) : null}

        <div className="panel">
          <h3>Caractéristiques</h3>
          <div className="chips">
            <span className="chip">{LEVEL_LABEL[spot.recommendedLevel]}</span>
            <span className="chip gray">{BREAK_LABEL[spot.bottomType]}</span>
            <span className="chip gray">{TIDE_LABEL[spot.optimalTide]}</span>
            <span className="chip gray">Orientation {spot.beachOrientation}°</span>
          </div>
        </div>

        {spot.dangers?.length ? (
          <div className="panel">
            <h3>À savoir / dangers</h3>
            <ul className="danger-list">
              {spot.dangers.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div style={{ margin: '10px 0 60px' }}>
          <a
            className="btn btn-primary"
            href="https://play.google.com/store/apps/details?id=com.spotwave.app"
            target="_blank"
            rel="noreferrer"
          >
            Prévisions 7 jours dans l&apos;app
          </a>
        </div>
      </div>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </main>
  );
}
