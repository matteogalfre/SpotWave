export const LEVEL_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  beginner: { label: 'Débutant', color: '#4A90FF', bg: 'rgba(74,144,255,0.15)' },
  intermediate: { label: 'Intermédiaire', color: '#FFB84D', bg: 'rgba(255,184,77,0.15)' },
  expert: { label: 'Expert', color: '#FF5A5A', bg: 'rgba(255,90,90,0.15)' },
};

export const LEVEL_LABELS: Record<string, string> = {
  beginner: 'Débutant',
  intermediate: 'Intermédiaire',
  expert: 'Expert',
};

export const BREAK_LABELS: Record<string, string> = {
  beach: 'Beach break',
  reef: 'Reef break',
  point: 'Point break',
};

export const TIDE_LABELS: Record<string, string> = {
  low: 'Marée basse',
  mid: 'Mi-marée',
  high: 'Marée haute',
  all: 'Toutes marées',
};

export const DAY_NAMES_SHORT = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
export const DAY_NAMES_FULL = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

export function fmtDayLabel(iso: string, now?: Date): string {
  const d = new Date(iso);
  const ref = now ?? new Date();
  const todayStr = ref.toISOString().slice(0, 10);
  const tomorrow = new Date(ref);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);
  const dateStr = d.toISOString().slice(0, 10);
  if (dateStr === todayStr) return "Aujourd'hui";
  if (dateStr === tomorrowStr) return 'Demain';
  return `${DAY_NAMES_FULL[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
}

export function fmtDayLabelShort(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateStr = d.toISOString().slice(0, 10);
  if (dateStr === todayStr) return "Aujourd'hui";
  if (dateStr === tomorrow.toISOString().slice(0, 10)) return 'Demain';
  return `${DAY_NAMES_SHORT[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
}

export function fmtRange(iso: string, duration: number, maxH: number): string {
  const h = parseInt(iso.slice(11, 13), 10);
  const end = Math.min(h + duration, maxH);
  return `${h}h–${end}h`;
}

export function fmtH(iso: string): string {
  return iso.slice(11, 16);
}

export function fmtElapsed(d: Date): string {
  const mins = Math.round((Date.now() - d.getTime()) / 60_000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  return `il y a ${Math.floor(mins / 60)}h`;
}
