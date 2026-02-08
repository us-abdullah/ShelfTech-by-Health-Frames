/**
 * RAG (Retrieval-Augmented Context) for VisionClaw: preferences, dietary, bloodwork, shopping list.
 * Each "person" profile drives overlay emphasis and Gemini analysis.
 */

export type DietaryPreference =
  | 'halal'
  | 'kosher'
  | 'vegetarian'
  | 'vegan'
  | 'no_gelatin'
  | 'no_alcohol'
  | 'gluten_free'
  | 'dairy_free'
  | 'nut_free'
  | 'soy_free'
  | 'low_sodium'
  | 'diabetic_friendly'
  | 'low_fodmap'
  | 'pescatarian';

export interface BloodworkDeficiency {
  nutrient: string;
  severity?: 'low' | 'moderate' | 'deficient';
  targetDaily?: string;
}

/** Body/health context for actionable, health-track recommendations. */
export interface BodyHealth {
  /** Weight in kg (optional, for rough BMI/context) */
  weightKg?: number;
  /** Height in cm (optional) */
  heightCm?: number;
  /** e.g. "IBS", "acid reflux", "diabetes", "high blood pressure", "stomach sensitivity" */
  healthConditions?: string[];
  /** e.g. "cut", "bulk", "maintain", "lose weight", "gain muscle", "alleviate pain" */
  bodyGoals?: string[];
  /** Free text: "stomach hurts often", "avoid spicy", etc. */
  healthNotes?: string;
}

export interface PersonProfile {
  id: string;
  name: string;
  dietaryRestrictions: DietaryPreference[];
  proteinAndBudget: boolean;
  bloodworkDeficiencies: BloodworkDeficiency[];
  shoppingList: string[];
  notes?: string;
  /** Body metrics, conditions, goals – drives overlay tags and "what this means for you" */
  bodyHealth?: BodyHealth;
}

export const PRESET_PROTEIN_BUDGET: PersonProfile = {
  id: 'preset-protein-budget',
  name: 'Alex (Protein + Budget)',
  dietaryRestrictions: [],
  proteinAndBudget: true,
  bloodworkDeficiencies: [],
  shoppingList: ['chicken breast', 'eggs', 'greek yogurt', 'lentils', 'canned tuna', 'oatmeal'],
  notes: 'Prioritize high protein per dollar and volume (mass per dollar).',
  bodyHealth: {
    bodyGoals: ['bulk', 'gain muscle'],
    healthNotes: 'Budget-conscious, wants maximum protein per dollar.',
  },
};

export const PRESET_RELIGIOUS_DIETARY: PersonProfile = {
  id: 'preset-religious',
  name: 'Jordan (Halal/Kosher)',
  dietaryRestrictions: ['halal', 'no_gelatin', 'no_alcohol'],
  proteinAndBudget: false,
  bloodworkDeficiencies: [],
  shoppingList: ['halal meat', 'pita', 'hummus', 'dates', 'olive oil'],
  notes: 'Halal and no gelatin/alcohol. Prefer kosher when halal unclear.',
  bodyHealth: { healthNotes: 'Focus on halal/kosher compliance.' },
};

export const PRESET_BLOODWORK_DEFICIENCY: PersonProfile = {
  id: 'preset-bloodwork',
  name: 'Sam (Bloodwork Deficiencies)',
  dietaryRestrictions: ['vegetarian'],
  proteinAndBudget: false,
  bloodworkDeficiencies: [
    { nutrient: 'Vitamin D', severity: 'deficient', targetDaily: '2000 IU' },
    { nutrient: 'Iron', severity: 'low', targetDaily: '18 mg' },
    { nutrient: 'B12', severity: 'moderate' },
  ],
  shoppingList: ['fortified milk', 'spinach', 'beans', 'eggs', 'nutritional yeast'],
  notes: 'Recent bloodwork: low Vitamin D, borderline iron, moderate B12. Prefer fortified and plant iron sources.',
  bodyHealth: {
    healthConditions: ['low Vitamin D', 'borderline iron'],
    bodyGoals: ['maintain', 'address deficiencies'],
  },
};

export const PRESET_PROFILES: PersonProfile[] = [
  PRESET_PROTEIN_BUDGET,
  PRESET_RELIGIOUS_DIETARY,
  PRESET_BLOODWORK_DEFICIENCY,
];

const STORAGE_KEY = 'visionclaw_profiles';

export function loadCustomProfiles(): PersonProfile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PersonProfile[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCustomProfiles(profiles: PersonProfile[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
  } catch {
    // ignore
  }
}

/** Check if label is on shopping list (fuzzy: lowercase, includes). */
export function isOnShoppingList(label: string, profile: PersonProfile): boolean {
  const lower = label.toLowerCase();
  return profile.shoppingList.some((item) => lower.includes(item.toLowerCase()) || item.toLowerCase().includes(lower));
}

/** One-line summary of profile for prompts. */
export function profileSummary(profile: PersonProfile): string {
  const parts: string[] = [];
  if (profile.dietaryRestrictions.length > 0) {
    parts.push(`Dietary: ${profile.dietaryRestrictions.join(', ')}.`);
  }
  if (profile.proteinAndBudget) {
    parts.push('Prioritize protein and value (protein per dollar, mass per dollar).');
  }
  if (profile.bloodworkDeficiencies.length > 0) {
    parts.push(
      `Deficiencies to address: ${profile.bloodworkDeficiencies.map((d) => d.nutrient + (d.targetDaily ? ` (${d.targetDaily})` : '')).join(', ')}.`
    );
  }
  const bh = profile.bodyHealth;
  if (bh?.healthConditions?.length) {
    parts.push(`Health conditions: ${bh.healthConditions.join(', ')}.`);
  }
  if (bh?.bodyGoals?.length) {
    parts.push(`Body goals: ${bh.bodyGoals.join(', ')}.`);
  }
  if (bh?.healthNotes) parts.push(bh.healthNotes);
  if (profile.shoppingList.length > 0) {
    parts.push(`Shopping list: ${profile.shoppingList.slice(0, 12).join(', ')}${profile.shoppingList.length > 12 ? '...' : ''}.`);
  }
  if (profile.notes) parts.push(profile.notes);
  return parts.join(' ');
}
