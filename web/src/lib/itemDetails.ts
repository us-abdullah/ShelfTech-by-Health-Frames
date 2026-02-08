/**
 * Mock item details (macros, dietary, price). Replace with Costco/product API later.
 */

export interface ItemDetails {
  name: string;
  macros?: { calories?: number; protein?: number; carbs?: number; fat?: number };
  dietary?: string[];
  allergies?: string[];
  /** List of ingredients (for click-to-explain) */
  ingredients?: string[];
  priceAtCostco?: number;
  priceElsewhere?: { store: string; price: number }[];
  nutritionSummary?: string;
  dailyValueContribution?: Record<string, string>;
  voiceAnswer?: string;
  compatibilitySummary?: string;
}

export function getMockItemDetails(label: string): ItemDetails {
  const lower = label.toLowerCase();
  return {
    name: label,
    macros: { calories: 120, protein: 8, carbs: 12, fat: 5 },
    dietary: lower.includes('milk') || lower.includes('cheese') ? ['Vegetarian'] : [],
    allergies: lower.includes('nut') ? ['Tree nuts'] : [],
    priceAtCostco: 9.99,
    priceElsewhere: [
      { store: 'Walmart', price: 11.49 },
      { store: 'Target', price: 10.99 },
    ],
    nutritionSummary: 'Good source of protein. Check label for allergens.',
    dailyValueContribution: { 'Vitamin D': '15%', Calcium: '20%' },
  };
}
