/**
 * Comfort & gear helpers — display only, never feed the surf score.
 * Maps sea-surface temperature to a wetsuit recommendation and the UV index to
 * a risk band. All user-facing strings are resolved by the caller via i18n, so
 * these functions only return stable keys / locale-agnostic thickness tokens.
 */

export type AccessoryKey = 'boots' | 'gloves' | 'hood';

export interface WetsuitRec {
  /** Standard surf notation (torso/extremities), e.g. "3/2". Empty when none needed. */
  thickness: string;
  /** True when boardshorts / a rashguard are enough (warm water). */
  none: boolean;
  /** Extra gear advised for cold water. */
  accessories: AccessoryKey[];
}

/**
 * Sea temperature (°C) → wetsuit thickness, using the industry-standard
 * torso/extremities notation (3/2, 4/3, 5/4, 6/5…). Ranges follow the common
 * surf-shop guidelines.
 */
export function wetsuitRecommendation(seaTempC: number): WetsuitRec {
  if (!Number.isFinite(seaTempC) || seaTempC <= 0) {
    return { thickness: '', none: false, accessories: [] };
  }
  if (seaTempC >= 25) return { thickness: '', none: true, accessories: [] };
  if (seaTempC >= 19) return { thickness: '2', none: false, accessories: [] };
  if (seaTempC >= 17) return { thickness: '3/2', none: false, accessories: [] };
  if (seaTempC >= 14) return { thickness: '4/3', none: false, accessories: [] };
  if (seaTempC >= 11) return { thickness: '5/4', none: false, accessories: ['boots'] };
  if (seaTempC >= 7) return { thickness: '5/4', none: false, accessories: ['boots', 'gloves', 'hood'] };
  return { thickness: '6/5', none: false, accessories: ['boots', 'gloves', 'hood'] };
}

export type UvRiskKey = 'low' | 'moderate' | 'high' | 'veryHigh' | 'extreme';

/** WHO UV index bands. */
export function uvRiskKey(uv: number): UvRiskKey {
  if (uv < 3) return 'low';
  if (uv < 6) return 'moderate';
  if (uv < 8) return 'high';
  if (uv < 11) return 'veryHigh';
  return 'extreme';
}
