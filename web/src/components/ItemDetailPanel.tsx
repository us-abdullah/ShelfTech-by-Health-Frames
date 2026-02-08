import React, { useCallback, useState } from 'react';
import type { ItemDetails } from '../lib/itemDetails';
import type { PersonProfile } from '../lib/rag';
import { getIngredientExplanation } from '../lib/ingredientExplanation';

interface ItemDetailPanelProps {
  details: ItemDetails | null;
  onClose: () => void;
  onAskVoice?: () => void;
  isVoiceLoading?: boolean;
  detailsLoading?: boolean;
  currentProfile?: PersonProfile | null;
}

export function ItemDetailPanel({ details, onClose, onAskVoice, isVoiceLoading, detailsLoading, currentProfile }: ItemDetailPanelProps) {
  const [ingredientPopup, setIngredientPopup] = useState<{ ingredient: string; explanation: string } | null>(null);
  const [ingredientLoading, setIngredientLoading] = useState<string | null>(null);

  const productName = details?.name ?? '';
  const handleIngredientClick = useCallback(
    (ingredient: string) => {
      setIngredientLoading(ingredient);
      setIngredientPopup(null);
      getIngredientExplanation(ingredient, productName)
        .then((explanation) => setIngredientPopup({ ingredient, explanation }))
        .catch(() => setIngredientPopup({ ingredient, explanation: 'Could not load explanation.' }))
        .finally(() => setIngredientLoading(null));
    },
    [productName]
  );

  if (!details) return null;

  const {
    name,
    macros,
    dietary,
    allergies,
    ingredients,
    priceAtCostco,
    priceElsewhere,
    nutritionSummary,
    dailyValueContribution,
    voiceAnswer,
    compatibilitySummary,
  } = details;

  const bestPrice = priceAtCostco ?? priceElsewhere?.[0]?.price;
  const proteinPerDollar =
    currentProfile?.proteinAndBudget && macros?.protein != null && bestPrice != null && bestPrice > 0
      ? (macros.protein / bestPrice).toFixed(1)
      : null;
  const caloriesPerDollar =
    currentProfile?.proteinAndBudget && macros?.calories != null && bestPrice != null && bestPrice > 0
      ? Math.round(macros.calories / bestPrice)
      : null;

  const section = (label: string, children: React.ReactNode, accent?: boolean) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ color: accent ? '#00ff88' : '#e0e0e0', fontSize: 14, lineHeight: 1.4 }}>{children}</div>
    </div>
  );

  const glassStyle: React.CSSProperties = {
    background: 'rgba(18, 20, 24, 0.82)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    boxShadow: '0 20px 50px rgba(0,0,0,0.4)',
  };

  return (
    <div
      style={{
        position: 'absolute',
        right: 20,
        top: '50%',
        transform: 'translateY(-50%)',
        width: 340,
        maxWidth: 'calc(100vw - 40px)',
        ...glassStyle,
        borderRadius: 20,
        padding: 20,
        color: '#fff',
        zIndex: 25,
        maxHeight: '85vh',
        overflow: 'auto',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#00ff88', letterSpacing: '-0.02em' }}>
          {name}
          {detailsLoading && <span style={{ marginLeft: 8, fontSize: 12, color: '#888', fontWeight: 400 }}>Loading…</span>}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            background: 'rgba(255,255,255,0.08)',
            border: 'none',
            color: '#888',
            cursor: 'pointer',
            fontSize: 20,
            lineHeight: 1,
            padding: '4px 8px',
            borderRadius: 8,
          }}
        >
          ×
        </button>
      </div>

      {detailsLoading && (
        <div style={{ padding: '20px 0', color: '#888', fontSize: 14 }}>Fetching dietary, macros & nutrition from Gemini…</div>
      )}
      {!detailsLoading && dietary && dietary.length > 0 && section('Dietary', dietary.join(', '), true)}
      {!detailsLoading && macros && section('Macros', `${macros.calories ?? '—'} cal · ${macros.protein ?? '—'}g protein · ${macros.carbs ?? '—'}g carbs · ${macros.fat ?? '—'}g fat`)}
      {!detailsLoading && allergies && allergies.length > 0 && section('Allergies', allergies.join(', '), false)}
      {!detailsLoading && (priceAtCostco != null || (priceElsewhere?.length ?? 0) > 0) && section('Price', [priceAtCostco != null ? `Costco $${priceAtCostco.toFixed(2)}` : null, ...(priceElsewhere ?? []).map((e) => `${e.store} $${e.price.toFixed(2)}`)].filter(Boolean).join(' · '))}
      {!detailsLoading && currentProfile?.proteinAndBudget && (proteinPerDollar != null || caloriesPerDollar != null) && section('Value for you', [proteinPerDollar != null ? `${proteinPerDollar} g protein/$` : null, caloriesPerDollar != null ? `${caloriesPerDollar} cal/$` : null].filter(Boolean).join(' · '), true)}
      {!detailsLoading && ingredients && ingredients.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Ingredients</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {ingredients.map((ing, i) => (
              <button
                type="button"
                key={`${ing}-${i}`}
                onClick={() => handleIngredientClick(ing)}
                disabled={ingredientLoading !== null}
                style={{
                  padding: '6px 10px',
                  background: ingredientLoading === ing ? 'rgba(0,255,136,0.2)' : 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 8,
                  color: '#e0e0e0',
                  fontSize: 12,
                  cursor: ingredientLoading === ing ? 'wait' : 'pointer',
                }}
              >
                {ing}
                {ingredientLoading === ing ? '…' : ''}
              </button>
            ))}
          </div>
          {ingredientPopup && (
            <div
              style={{
                marginTop: 10,
                padding: 12,
                background: 'rgba(0,0,0,0.35)',
                borderRadius: 10,
                border: '1px solid rgba(0,255,136,0.25)',
              }}
            >
              <div style={{ fontSize: 11, color: '#00ff88', marginBottom: 6 }}>{ingredientPopup.ingredient}</div>
              <p style={{ margin: 0, fontSize: 13, color: '#ccc', lineHeight: 1.5 }}>{ingredientPopup.explanation}</p>
              <button
                type="button"
                onClick={() => setIngredientPopup(null)}
                style={{ marginTop: 8, fontSize: 11, color: '#888', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Close
              </button>
            </div>
          )}
        </div>
      )}
      {!detailsLoading && nutritionSummary && section('Nutrition', nutritionSummary)}
      {!detailsLoading && dailyValueContribution && Object.keys(dailyValueContribution).length > 0 && section('Daily value', Object.entries(dailyValueContribution).map(([k, v]) => `${k} ${v}`).join(', '))}
      {!detailsLoading && compatibilitySummary && section('Compatibility', compatibilitySummary, true)}

      {onAskVoice && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <button
            type="button"
            onClick={onAskVoice}
            disabled={isVoiceLoading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              width: '100%',
              padding: '12px 16px',
              background: isVoiceLoading ? 'rgba(0,255,136,0.2)' : 'rgba(0,255,136,0.15)',
              border: '1px solid rgba(0,255,136,0.5)',
              borderRadius: 12,
              color: '#00ff88',
              fontSize: 14,
              fontWeight: 500,
              cursor: isVoiceLoading ? 'wait' : 'pointer',
            }}
          >
            <span style={{ fontSize: 18 }}>{isVoiceLoading ? '◐' : '🎤'}</span>
            {isVoiceLoading ? 'Listening… Ask your question' : 'Ask about this product (voice)'}
          </button>
          {voiceAnswer && (
            <div style={{ marginTop: 12, padding: 12, background: 'rgba(0,0,0,0.3)', borderRadius: 10, fontSize: 13, color: '#ccc', lineHeight: 1.5 }}>
              {voiceAnswer}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
