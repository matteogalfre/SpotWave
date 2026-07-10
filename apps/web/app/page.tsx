import Link from 'next/link';
import { featuredSpots, getAllSpots, groupByCountry } from '../lib/data';
import SpotCard from '../components/SpotCard';

const PLAY_STORE = 'https://play.google.com/store/apps/details?id=com.spotwave.app';

export default function HomePage() {
  const all = getAllSpots();
  const featured = featuredSpots(12);
  const countries = groupByCountry(all).length;

  return (
    <main>
      <section className="hero">
        <div className="container hero-inner">
          <div>
            <h1>
              Les prévisions de surf,
              <br />
              notées <span className="accent">sur 10</span>.
            </h1>
            <p>
              Fini les tableaux illisibles. SpotWave lit la houle, le vent et la marée pour te dire,
              d’un coup d’œil, si ça vaut le coup — et à quelle heure foncer.
            </p>
            <div className="hero-cta">
              <Link className="btn btn-primary" href="/spots">
                Explorer les spots
              </Link>
              <a className="btn btn-ghost" href={PLAY_STORE} target="_blank" rel="noreferrer">
                Télécharger l&apos;app Android
              </a>
            </div>
            <div className="hero-badges">
              <div>
                <b>{all.length}</b>spots
              </div>
              <div>
                <b>{countries}</b>pays
              </div>
              <div>
                <b>7j</b>de prévisions
              </div>
            </div>
          </div>

          <div className="preview-card">
            {featured.slice(0, 4).map((s) => (
              <div className="preview-row" key={s.id}>
                <div>
                  <div className="preview-name">{s.name}</div>
                  <div className="preview-sub">
                    {s.region} · {s.country}
                  </div>
                </div>
                <div className="preview-sub">→</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section container">
        <h2>Spots populaires</h2>
        <p className="lead">Une sélection de classiques. Clique pour voir le score du jour, calculé en direct.</p>
        <div className="grid">
          {featured.map((s) => (
            <SpotCard key={s.id} spot={s} />
          ))}
        </div>
      </section>

      <section id="comment" className="section container">
        <h2>Comment ça marche</h2>
        <p className="lead">Le même moteur de score que l’app mobile, ici rendu côté serveur.</p>
        <div className="grid">
          <div className="card">
            <h3>1. On agrège les données</h3>
            <p className="place" style={{ marginTop: 8 }}>
              Houle, période, direction, vent et marée horaires sur 7 jours, pour chaque spot.
            </p>
          </div>
          <div className="card">
            <h3>2. On note sur 10</h3>
            <p className="place" style={{ marginTop: 8 }}>
              Un score continu et sans à-coups, adapté à l’orientation et au type de vague du spot.
            </p>
          </div>
          <div className="card">
            <h3>3. On trouve le créneau</h3>
            <p className="place" style={{ marginTop: 8 }}>
              Le meilleur moment de la journée pour se mettre à l’eau, mis en avant automatiquement.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
