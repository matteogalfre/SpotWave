import type { Metadata } from 'next';
import Link from 'next/link';
import { getAllSpots, groupByCountry, LEVEL_LABEL } from '../../lib/data';

export const metadata: Metadata = {
  title: 'Tous les spots de surf',
  description:
    'Parcourez tous les spots de surf couverts par SpotWave, par pays, avec prévisions notées sur 10 et le meilleur créneau du jour.',
  alternates: { canonical: '/spots' },
};

export default function SpotsIndexPage() {
  const groups = groupByCountry(getAllSpots());
  const total = getAllSpots().length;

  return (
    <main>
      <section className="section container">
        <p className="crumb">
          <Link href="/">Accueil</Link> · Spots
        </p>
        <h2 style={{ marginTop: 8 }}>Tous les spots</h2>
        <p className="lead">
          {total} spots dans {groups.length} pays. Choisis-en un pour voir le score du jour.
        </p>

        {groups.map((g) => (
          <div key={g.country} style={{ marginBottom: 34 }}>
            <h3 style={{ fontSize: 20, margin: '0 0 14px' }}>
              {g.country} <span style={{ color: 'var(--muted)', fontWeight: 600 }}>· {g.spots.length}</span>
            </h3>
            <div className="grid">
              {g.spots.map((s) => (
                <Link key={s.id} href={`/spots/${s.id}`} className="card">
                  <div className="card-top">
                    <div>
                      <h3>{s.name}</h3>
                      <div className="place">{s.region}</div>
                    </div>
                  </div>
                  <div className="chips">
                    <span className="chip">{LEVEL_LABEL[s.recommendedLevel]}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
