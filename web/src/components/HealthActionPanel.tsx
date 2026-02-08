import React from 'react';
import type { ItemDetails } from '../lib/itemDetails';
import type { PersonProfile } from '../lib/rag';

const glassStyle: React.CSSProperties = {
  background: 'rgba(18, 20, 24, 0.82)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  borderRadius: 16,
  color: '#e8e8e8',
};

interface HealthActionPanelProps {
  /** Selected item details (when user clicked or auto-selected) */
  itemDetails: ItemDetails | null;
  /** Current shopper profile for "what this means for you" */
  currentProfile: PersonProfile | null;
}

/** Product name lower for matching. */
function productMatch(name: string, ...keywords: string[]): boolean {
  const n = name.toLowerCase();
  return keywords.some((k) => n.includes(k));
}

/** Rough category so we don't treat vitamins like food or fruit like a protein source. */
function getProductCategory(name: string): 'supplement' | 'fruit' | 'vegetable' | 'dairy' | 'meat_fish_egg' | 'grain' | 'beverage' | 'snack_treat' | 'other' {
  const n = name.toLowerCase();
  if (n.match(/vitamin|multivitamin|supplement|probiotic pill|fish oil|omega-3 pill|calcium pill|b12|iron supplement|gummy vitamin/)) return 'supplement';
  if (n.match(/orange|apple|banana|berry|berries|grape|melon|mango|peach|pear|kiwi|citrus|fruit/)) return 'fruit';
  if (n.match(/spinach|broccoli|kale|lettuce|carrot|tomato|pepper|cucumber|vegetable|greens/)) return 'vegetable';
  if (n.match(/milk|yogurt|cheese|cream|dairy/)) return 'dairy';
  if (n.match(/chicken|beef|pork|fish|salmon|tuna|turkey|meat|egg/)) return 'meat_fish_egg';
  if (n.match(/bread|rice|oat|pasta|quinoa|cereal|grain/)) return 'grain';
  if (n.match(/soda|juice|coffee|tea|water|drink|beverage/)) return 'beverage';
  if (n.match(/candy|chocolate|cookie|cake|chips|crisp|ice cream|donut|sweet|treat/)) return 'snack_treat';
  return 'other';
}

/** Only mention macros when they're meaningful; item-specific copy first. */
function getActionableBullets(details: ItemDetails, profile: PersonProfile | null): string[] {
  const bullets: string[] = [];
  const { macros, name } = details;
  const goals = profile?.bodyHealth?.bodyGoals ?? [];
  const conditions = profile?.bodyHealth?.healthConditions ?? [];
  const notes = (profile?.bodyHealth?.healthNotes ?? '').toLowerCase();
  const deficiencies = profile?.bloodworkDeficiencies ?? [];
  const cal = macros?.calories ?? 0;
  const protein = macros?.protein ?? 0;
  const carbs = macros?.carbs ?? 0;
  const fat = macros?.fat ?? 0;
  const category = getProductCategory(name ?? '');

  const hasCut = goals.some((g) => /cut|loss|weight|lean/i.test(g));
  const hasBulk = goals.some((g) => /bulk|gain|muscle|mass/i.test(g));
  const hasStomach = conditions.some((c) => /stomach|ibs|digest|reflux|sensitive|gut/i.test(c)) || /stomach|belly|digest|reflux|ibs/.test(notes);
  const hasDiabetes = conditions.some((c) => /diabet|blood sugar|glucose/i.test(c)) || /diabet|blood sugar/.test(notes);
  const hasPain = goals.some((g) => /pain|inflammat|ache/i.test(g)) || conditions.some((c) => /pain|inflammat|arthritis/i.test(c));
  const deficiencyList = deficiencies.map((d) => d.nutrient.toLowerCase());

  // —— 1. Item-specific: what this product actually is (always honest) ——
  if (category === 'supplement') {
    bullets.push('Supplements micronutrients—take with food as directed. Not a substitute for a balanced diet.');
    if (productMatch(name!, 'vitamin d', 'vitamin d3')) bullets.push('Can help meet your Vitamin D target if you’re low.');
    if (productMatch(name!, 'iron')) bullets.push('Take with vitamin C (e.g. orange juice) for better absorption.');
    if (productMatch(name!, 'b12')) bullets.push('Useful if you’re low in B12; consistent intake matters.');
    return bullets; // no macro BS for supplements
  }

  if (category === 'fruit') {
    if (productMatch(name!, 'orange', 'citrus', 'grapefruit', 'lemon')) bullets.push('Vitamin C supports immunity and helps absorb iron from other foods; fiber and hydration. Low cal, no fat.');
    else if (productMatch(name!, 'banana')) bullets.push('Potassium for muscles and blood pressure; quick carbs for energy. Easy on the stomach for many; good pre- or post-workout.');
    else if (productMatch(name!, 'berry', 'berries')) bullets.push('Antioxidants and fiber; relatively low sugar for fruit. Supports heart and digestion.');
    else bullets.push('Fruit: vitamins, fiber, natural sugar. Low in protein—pair with protein or fat to stay full.');
  }

  if (category === 'vegetable') {
    bullets.push('Fiber, vitamins, minimal calories. Add fat (oil, nuts) or eat with a meal so you absorb fat-soluble vitamins.');
  }

  if (category === 'dairy') {
    if (productMatch(name!, 'yogurt', 'greek yogurt')) bullets.push('Protein and probiotics for gut health; plain versions have less added sugar. Filling and versatile.');
    else if (productMatch(name!, 'milk')) bullets.push('Protein and often fortified with D and calcium for bones. Pair with meals for satiety.');
    else bullets.push('Dairy: protein and calcium; check label for added sugar and sodium.');
  }

  if (category === 'meat_fish_egg') {
    if (productMatch(name!, 'salmon', 'fish', 'sardine', 'mackerel')) bullets.push('High-quality protein and omega-3s for heart and brain. Filling and nutrient-dense.');
    else bullets.push('Solid protein for muscle and satiety; pair with veggies and a carb for a complete meal.');
  }

  if (category === 'grain') {
    bullets.push('Carbs and often fiber for energy and digestion. Pair with protein and fat to avoid a quick spike and crash.');
  }

  if (category === 'snack_treat') {
    bullets.push('Treat—enjoy in moderation. For a cut, watch portion size.');
  }

  if (category === 'beverage') {
    if (productMatch(name!, 'soda', 'sweet', 'juice') && carbs > 15) bullets.push('Sugar-heavy; consider water or a smaller portion.');
    else if (productMatch(name!, 'water')) bullets.push('No calories; stay hydrated.');
    else bullets.push('Check label for added sugar and calories.');
  }

  // —— 2. Macros only when significant (no "1g protein supports muscle" or "15 cal for bulk") ——
  const meaningfulProtein = protein >= 7;
  const meaningfulCarbs = carbs >= 12;
  const meaningfulFat = fat >= 5;
  const meaningfulCalForBulk = cal >= 150;
  const meaningfulCalForCut = cal >= 80;

  if (category !== 'beverage') {
    if (hasCut && cal > 0 && meaningfulCalForCut) {
      bullets.push(`${cal} cal — Budget into your deficit; ${cal > 250 ? 'this is a bigger hit—consider portion.' : 'reasonable for a cut.'}`);
    } else if (hasBulk && cal > 0 && meaningfulCalForBulk) {
      if (protein >= 10) bullets.push(`${cal} cal, ${protein}g protein — Solid for surplus and muscle; pair with training.`);
      else bullets.push(`${cal} cal — Contributes to your surplus; pair with protein elsewhere.`);
    } else if (cal > 200 && !hasCut && !hasBulk) {
      bullets.push(`${cal} cal — Substantial; fits into your daily total.`);
    }
  }

  if (meaningfulProtein) {
    if (profile?.proteinAndBudget && details.priceAtCostco != null && details.priceAtCostco > 0) {
      const perDollar = (protein / details.priceAtCostco).toFixed(1);
      bullets.push(`${protein}g protein — ${perDollar}g per dollar; good value for your protein goal.`);
    } else if (hasBulk && protein >= 15) {
      bullets.push(`${protein}g protein — Meaningful for muscle gain; hit your daily target with meals like this.`);
    } else if (protein >= 15) {
      bullets.push(`${protein}g protein — Strong source; helps with satiety and maintenance.`);
    }
  }

  if (meaningfulCarbs) {
    if (hasDiabetes) {
      bullets.push(`${carbs}g carbs — Count toward your limit; pair with protein or fat to blunt spikes.`);
    } else if (hasBulk && carbs >= 25) {
      bullets.push(`${carbs}g carbs — Good fuel for recovery and surplus.`);
    } else if (carbs >= 30) {
      bullets.push(`${carbs}g carbs — Notable carb hit; time with activity if you care about timing.`);
    }
  }

  if (meaningfulFat) {
    bullets.push(`${fat}g fat — Supports hormones and absorption; keeps you full.`);
  }

  // —— 3. Deficiencies: only when product actually helps ——
  if (deficiencyList.length > 0 && name) {
    if (deficiencyList.some((d) => d.includes('vitamin d')) && productMatch(name, 'milk', 'yogurt', 'fortified', 'salmon', 'egg', 'tuna')) {
      bullets.push('Helps meet your Vitamin D goal.');
    } else if (deficiencyList.some((d) => d.includes('iron')) && productMatch(name, 'spinach', 'bean', 'lentil', 'meat', 'beef', 'liver', 'fortified')) {
      bullets.push('Contributes to iron—pair with vitamin C for absorption.');
    } else if (deficiencyList.some((d) => d.includes('b12')) && productMatch(name, 'meat', 'fish', 'egg', 'dairy', 'fortified', 'nutritional yeast')) {
      bullets.push('B12 source—helps with your deficiency when eaten regularly.');
    }
  }

  // —— 4. Stomach / digestive ——
  if (hasStomach && name) {
    if (productMatch(name, 'banana', 'rice', 'oat', 'toast', 'plain yogurt', 'chicken', 'white fish')) {
      bullets.push('Usually gentle on sensitive stomachs.');
    } else if (productMatch(name, 'yogurt', 'kefir', 'ferment')) {
      bullets.push('Probiotics may help digestion; plain is often easier with IBS.');
    } else if (productMatch(name, 'spicy', 'chili', 'acid', 'citrus', 'tomato')) {
      bullets.push('Can trigger reflux or stomach issues if you’re sensitive.');
    }
  }

  // —— 5. Pain / inflammation ——
  if (hasPain && name) {
    if (productMatch(name, 'fish', 'salmon', 'sardine', 'mackerel', 'omega')) {
      bullets.push('Omega-3s support an anti-inflammatory diet.');
    } else if (productMatch(name, 'turmeric', 'ginger', 'green leafy')) {
      bullets.push('Often included in anti-inflammatory eating.');
    }
  }

  // —— 6. Pairings: what to eat it with ——
  if (name) {
    if (category === 'fruit') {
      if (productMatch(name, 'orange', 'citrus', 'grapefruit', 'lemon')) bullets.push('Pairs well: leafy greens (vitamin C helps absorb iron), nuts or cheese (balance sugar), or in a smoothie with yogurt and oats.');
      else if (productMatch(name, 'banana')) bullets.push('Pairs well: nut butter or oats for sustained energy; with protein (e.g. Greek yogurt) post-workout.');
      else if (productMatch(name, 'berry', 'berries')) bullets.push('Pairs well: yogurt, cottage cheese, or oatmeal; add to salads or smoothies.');
      else bullets.push('Pairs well: yogurt, oatmeal, or with a handful of nuts to balance blood sugar.');
    }
    if (category === 'vegetable') {
      bullets.push('Pairs well: olive oil or lemon for absorption of fat-soluble vitamins; add to eggs, grains, or lean protein for a full meal.');
    }
    if (category === 'dairy') {
      if (productMatch(name, 'yogurt', 'greek yogurt')) bullets.push('Pairs well: fruit, nuts, or granola; use as a dip or in smoothies. Plain + fruit gives protein without excess sugar.');
      else if (productMatch(name, 'milk')) bullets.push('Pairs well: cereal, oatmeal, or in coffee; drink with a meal for better satiety.');
      else bullets.push('Pairs well: fruit, whole grains, or as part of a balanced plate with protein and veggies.');
    }
    if (category === 'meat_fish_egg') {
      if (productMatch(name, 'salmon', 'fish')) bullets.push('Pairs well: leafy greens, rice or quinoa, and lemon; fatty fish goes great with veggies for a full meal.');
      else bullets.push('Pairs well: vegetables and a carb (rice, potato, bread) for a balanced meal; add greens for fiber and vitamins.');
    }
    if (category === 'grain') {
      bullets.push('Pairs well: protein (eggs, chicken, beans) and vegetables to round out the meal and slow digestion.');
    }
    if (category === 'snack_treat') {
      bullets.push('Have with a source of protein or fiber (e.g. nuts, fruit) so it doesn’t spike blood sugar alone.');
    }
  }

  // —— 7. Optimal timing ——
  if (name) {
    if (category === 'fruit') {
      if (productMatch(name, 'orange', 'citrus')) bullets.push('When: morning or with breakfast (vitamin C + hydration); or post-workout with protein for recovery.');
      else if (productMatch(name, 'banana')) bullets.push('When: pre- or post-workout for quick energy; or as a morning snack with nut butter.');
      else if (productMatch(name, 'berry', 'berries')) bullets.push('When: morning in oatmeal or yogurt; or as an afternoon snack. Avoid large portions late if you’re sensitive to sugar.');
      else bullets.push('When: morning or with meals to help with absorption; as a snack between meals for a light option.');
    }
    if (category === 'vegetable') {
      bullets.push('When: with lunch and dinner for fiber and fullness; start a meal with greens to eat more veggies.');
    }
    if (category === 'dairy') {
      if (productMatch(name, 'yogurt', 'greek yogurt')) bullets.push('When: breakfast or post-workout for protein; as a snack with fruit. Plain before bed is a common choice if you tolerate dairy.');
      else if (productMatch(name, 'milk')) bullets.push('When: with breakfast or post-workout; with a meal if you want to feel full longer.');
      else bullets.push('When: with meals or as a snack; pair with fruit or whole grains.');
    }
    if (category === 'meat_fish_egg') {
      bullets.push('When: lunch or dinner for most people; post-workout for muscle repair. Pair with carbs and veggies for a complete meal.');
    }
    if (category === 'grain') {
      bullets.push('When: around workouts for fuel, or with breakfast/lunch. Earlier in the day often works better if you’re watching carbs.');
    }
    if (category === 'snack_treat') {
      bullets.push('When: after a meal or with protein so it’s a treat, not a blood-sugar spike. Small portion is key.');
    }
  }

  return bullets;
}

export function HealthActionPanel({ itemDetails, currentProfile }: HealthActionPanelProps) {
  if (!currentProfile) return null;

  const bh = currentProfile.bodyHealth;
  const hasBodyData = bh && (bh.healthConditions?.length || bh.bodyGoals?.length || bh.healthNotes);

  return (
    <div
      style={{
        position: 'absolute',
        left: 16,
        top: '50%',
        transform: 'translateY(-50%)',
        width: 260,
        maxWidth: 'calc(100vw - 32px)',
        ...glassStyle,
        padding: 16,
        zIndex: 12,
        maxHeight: '80vh',
        overflow: 'auto',
      }}
    >
      <div style={{ fontSize: 11, color: '#00ff88', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
        Health & action
      </div>

      {itemDetails ? (
        <>
          <div style={{ fontSize: 12, color: '#fff', fontWeight: 600, marginBottom: 8 }}>What this means for you</div>
          <p style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>
            Benefits, what to pair it with, and when it works best—tailored to you.
          </p>
          {(() => {
            const bullets = getActionableBullets(itemDetails, currentProfile);
            return bullets.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: '#ccc', lineHeight: 1.5 }}>
                {bullets.map((b, i) => (
                  <li key={i} style={{ marginBottom: 6 }}>
                    {b}
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ fontSize: 12, color: '#888' }}>Select an item or wait for details to see personalized takeaways.</p>
            );
          })()}
        </>
      ) : (
        <>
          <div style={{ fontSize: 12, color: '#fff', fontWeight: 600, marginBottom: 6 }}>Your health snapshot</div>
          {hasBodyData ? (
            <div style={{ fontSize: 12, color: '#aaa', lineHeight: 1.45 }}>
              {bh!.bodyGoals?.length ? (
                <p style={{ margin: '0 0 6px 0' }}><strong style={{ color: '#00ff88' }}>Goals:</strong> {bh!.bodyGoals.join(', ')}</p>
              ) : null}
              {bh!.healthConditions?.length ? (
                <p style={{ margin: '0 0 6px 0' }}><strong style={{ color: '#00ff88' }}>Conditions:</strong> {bh!.healthConditions.join(', ')}</p>
              ) : null}
              {bh!.healthNotes ? (
                <p style={{ margin: 0 }}><strong style={{ color: '#00ff88' }}>Notes:</strong> {bh!.healthNotes}</p>
              ) : null}
            </div>
          ) : (
            <p style={{ fontSize: 12, color: '#666' }}>
              Add body goals, conditions, or notes in Who&apos;s shopping to get tags like &quot;Gentle on stomach&quot; or &quot;Good for cut&quot; on products.
            </p>
          )}
        </>
      )}
    </div>
  );
}
