import Link from 'next/link';
import type { SpotConfig } from '@spotwave/core';
import { BREAK_LABEL, LEVEL_LABEL } from '../lib/data';

export default function SpotCard({ spot }: { spot: SpotConfig }) {
  return (
    <Link href={`/spots/${spot.id}`} className="card">
      <div className="card-top">
        <div>
          <h3>{spot.name}</h3>
          <div className="place">
            {spot.region} · {spot.country}
          </div>
        </div>
      </div>
      <div className="chips">
        <span className="chip">{LEVEL_LABEL[spot.recommendedLevel]}</span>
        <span className="chip gray">{BREAK_LABEL[spot.bottomType]}</span>
      </div>
    </Link>
  );
}
