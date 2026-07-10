import fr from './fr';
import en from './en';
import pt from './pt';
import es from './es';
import de from './de';
import it from './it';
import ja from './ja';

export { fr, en, pt, es, de, it, ja };

export type Locale = 'fr' | 'en' | 'pt' | 'es' | 'de' | 'it' | 'ja';

type DeepString<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R ? (...args: A) => R : string;
};

// French is the source of truth for the translation shape; every other locale
// must match it.
export type Translations = DeepString<typeof fr>;

export const translations: Record<Locale, Translations> = { fr, en, pt, es, de, it, ja };

export const LOCALES: Locale[] = ['fr', 'en', 'pt', 'es', 'de', 'it', 'ja'];

/** Platform-agnostic translation accessor (no React) — used by the web app too. */
export function getTranslations(locale: Locale): Translations {
  return translations[locale] ?? en;
}
