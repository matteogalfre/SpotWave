import { SUGGEST_SPOT_FORM_ACTION, SUGGEST_SPOT_ENTRIES } from '../utils/constants';
import { postGoogleForm } from './googleForm';

export type SkillLevel = 'Beginner' | 'Intermediate' | 'Expert';

export interface SpotSuggestion {
  name: string;
  country: string;
  level?: SkillLevel | '';
  webcam?: string;
}

/** Submits a community spot suggestion silently to the Google Form. */
export async function submitSpotSuggestion(s: SpotSuggestion): Promise<boolean> {
  const fields: Record<string, string> = {
    [SUGGEST_SPOT_ENTRIES.name]: s.name.trim(),
    [SUGGEST_SPOT_ENTRIES.country]: s.country.trim(),
  };
  if (s.level) fields[SUGGEST_SPOT_ENTRIES.level] = s.level;
  if (s.webcam && s.webcam.trim()) fields[SUGGEST_SPOT_ENTRIES.webcam] = s.webcam.trim();
  return postGoogleForm(SUGGEST_SPOT_FORM_ACTION, fields);
}
