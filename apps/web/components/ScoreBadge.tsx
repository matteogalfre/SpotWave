import { scoreColor } from '@spotwave/core';

export default function ScoreBadge({ score, size = 56 }: { score: number; size?: number }) {
  const bg = scoreColor(score);
  return (
    <span
      className="score"
      style={{ background: bg, width: size, height: size, fontSize: size * 0.34 }}
      aria-label={`Score ${score.toFixed(1)} sur 10`}
    >
      <span className="num">{score.toFixed(1)}</span>
      <span className="out">/10</span>
    </span>
  );
}
