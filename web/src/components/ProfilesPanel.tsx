import React, { useState } from 'react';
import type { PersonProfile } from '../lib/rag';
import { PRESET_PROFILES, loadCustomProfiles, saveCustomProfiles, type DietaryPreference } from '../lib/rag';

const DIETARY_OPTIONS: { value: DietaryPreference; label: string }[] = [
  { value: 'halal', label: 'Halal' },
  { value: 'kosher', label: 'Kosher' },
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'pescatarian', label: 'Pescatarian' },
  { value: 'no_gelatin', label: 'No gelatin' },
  { value: 'no_alcohol', label: 'No alcohol' },
  { value: 'gluten_free', label: 'Gluten-free' },
  { value: 'dairy_free', label: 'Dairy-free' },
  { value: 'nut_free', label: 'Nut-free' },
  { value: 'soy_free', label: 'Soy-free' },
  { value: 'low_sodium', label: 'Low sodium' },
  { value: 'diabetic_friendly', label: 'Diabetic-friendly' },
  { value: 'low_fodmap', label: 'Low FODMAP' },
];

const glassStyle: React.CSSProperties = {
  background: 'rgba(20, 20, 24, 0.75)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  borderRadius: 16,
  color: '#e8e8e8',
};

interface ProfilesPanelProps {
  currentProfile: PersonProfile | null;
  onSelectProfile: (p: PersonProfile) => void;
  onClose: () => void;
}

export function ProfilesPanel({ currentProfile, onSelectProfile, onClose }: ProfilesPanelProps) {
  const [customProfiles, setCustomProfiles] = useState<PersonProfile[]>(() => loadCustomProfiles());
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDietary, setNewDietary] = useState<DietaryPreference[]>([]);
  const [newProteinBudget, setNewProteinBudget] = useState(false);
  const [newDeficiencies, setNewDeficiencies] = useState('');
  const [newShoppingList, setNewShoppingList] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newHealthConditions, setNewHealthConditions] = useState('');
  const [newBodyGoals, setNewBodyGoals] = useState('');
  const [newHealthNotes, setNewHealthNotes] = useState('');

  const allProfiles = [...PRESET_PROFILES, ...customProfiles];

  const toggleDietary = (v: DietaryPreference) => {
    setNewDietary((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));
  };

  const addPerson = () => {
    const name = newName.trim() || 'New person';
    const deficiencies = newDeficiencies
      .split(/[,;]\s*|\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((nutrient) => ({ nutrient }));
    const shoppingList = newShoppingList
      .split(/[,;]\s*|\n/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const healthConditions = newHealthConditions.split(/[,;]\s*|\n/).map((s) => s.trim()).filter(Boolean);
    const bodyGoals = newBodyGoals.split(/[,;]\s*|\n/).map((s) => s.trim()).filter(Boolean);
    const profile: PersonProfile = {
      id: `custom-${Date.now()}`,
      name,
      dietaryRestrictions: newDietary,
      proteinAndBudget: newProteinBudget,
      bloodworkDeficiencies: deficiencies,
      shoppingList,
      notes: newNotes.trim() || undefined,
      bodyHealth:
        healthConditions.length > 0 || bodyGoals.length > 0 || newHealthNotes.trim()
          ? { healthConditions, bodyGoals, healthNotes: newHealthNotes.trim() || undefined }
          : undefined,
    };
    const next = [...customProfiles, profile];
    setCustomProfiles(next);
    saveCustomProfiles(next);
    setAdding(false);
    setNewName('');
    setNewDietary([]);
    setNewProteinBudget(false);
    setNewDeficiencies('');
    setNewShoppingList('');
    setNewNotes('');
    setNewHealthConditions('');
    setNewBodyGoals('');
    setNewHealthNotes('');
    onSelectProfile(profile);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 40,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)',
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        style={{
          ...glassStyle,
          width: '100%',
          maxWidth: 440,
          maxHeight: '90vh',
          overflow: 'auto',
          padding: 24,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#fff' }}>Who’s shopping?</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ background: 'none', border: 'none', color: '#888', fontSize: 22, cursor: 'pointer' }}
          >
            ×
          </button>
        </div>
        <p style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>
          Overlay and analysis use this profile (dietary, body health, bloodwork, shopping list).
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {allProfiles.map((p) => (
            <button
              type="button"
              key={p.id}
              onClick={() => onSelectProfile(p)}
              style={{
                padding: '12px 16px',
                textAlign: 'left',
                background: currentProfile?.id === p.id ? 'rgba(0, 255, 136, 0.2)' : 'rgba(255,255,255,0.06)',
                border: `1px solid ${currentProfile?.id === p.id ? 'rgba(0,255,136,0.5)' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: 12,
                color: '#fff',
                cursor: 'pointer',
              }}
            >
              <span style={{ fontWeight: 600 }}>{p.name}</span>
              <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
                {p.dietaryRestrictions.length ? `${p.dietaryRestrictions.join(', ')} · ` : ''}
                {p.proteinAndBudget ? 'Protein & budget · ' : ''}
                {p.bloodworkDeficiencies.length ? `${p.bloodworkDeficiencies.length} deficiencies · ` : ''}
                {p.shoppingList.length ? `${p.shoppingList.length} on list` : ''}
              </div>
              {p.bodyHealth && (p.bodyHealth.healthConditions?.length || p.bodyHealth.bodyGoals?.length || p.bodyHealth.healthNotes) && (
                <div style={{ fontSize: 10, color: '#666', marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  {p.bodyHealth.bodyGoals?.length ? `Goals: ${p.bodyHealth.bodyGoals.join(', ')}. ` : ''}
                  {p.bodyHealth.healthConditions?.length ? `Conditions: ${p.bodyHealth.healthConditions.join(', ')}. ` : ''}
                  {p.bodyHealth.healthNotes ? p.bodyHealth.healthNotes.slice(0, 60) + (p.bodyHealth.healthNotes.length > 60 ? '…' : '') : ''}
                </div>
              )}
            </button>
          ))}
        </div>
        {!adding ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            style={{
              width: '100%',
              padding: 12,
              background: 'rgba(255,255,255,0.06)',
              border: '1px dashed rgba(255,255,255,0.2)',
              borderRadius: 12,
              color: '#888',
              cursor: 'pointer',
            }}
          >
            + Add new person
          </button>
        ) : (
          <div style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 16 }}>
            <input
              type="text"
              placeholder="Name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              style={{
                width: '100%',
                padding: 10,
                marginBottom: 12,
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                color: '#fff',
              }}
            />
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>Dietary</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {DIETARY_OPTIONS.map((o) => (
                  <label key={o.value} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={newDietary.includes(o.value)}
                      onChange={() => toggleDietary(o.value)}
                    />
                    <span style={{ fontSize: 12 }}>{o.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={newProteinBudget}
                onChange={(e) => setNewProteinBudget(e.target.checked)}
              />
              <span style={{ fontSize: 13 }}>Prioritize protein & value (protein per dollar)</span>
            </label>
            <input
              type="text"
              placeholder="Bloodwork deficiencies (e.g. Vitamin D, Iron)"
              value={newDeficiencies}
              onChange={(e) => setNewDeficiencies(e.target.value)}
              style={{
                width: '100%',
                padding: 10,
                marginBottom: 12,
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                color: '#fff',
              }}
            />
            <textarea
              placeholder="Shopping list (one per line or comma-separated)"
              value={newShoppingList}
              onChange={(e) => setNewShoppingList(e.target.value)}
              rows={3}
              style={{
                width: '100%',
                padding: 10,
                marginBottom: 12,
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                color: '#fff',
                resize: 'vertical',
              }}
            />
            <div style={{ fontSize: 11, color: '#00ff88', marginBottom: 6 }}>Body & health (for actionable tags)</div>
            <input
              type="text"
              placeholder="Health conditions (e.g. IBS, acid reflux, diabetes, stomach sensitivity)"
              value={newHealthConditions}
              onChange={(e) => setNewHealthConditions(e.target.value)}
              style={{
                width: '100%',
                padding: 10,
                marginBottom: 8,
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                color: '#fff',
              }}
            />
            <input
              type="text"
              placeholder="Body goals (e.g. cut, bulk, lose weight, gain muscle, alleviate pain)"
              value={newBodyGoals}
              onChange={(e) => setNewBodyGoals(e.target.value)}
              style={{
                width: '100%',
                padding: 10,
                marginBottom: 8,
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                color: '#fff',
              }}
            />
            <input
              type="text"
              placeholder="Health notes (e.g. stomach hurts often, avoid spicy)"
              value={newHealthNotes}
              onChange={(e) => setNewHealthNotes(e.target.value)}
              style={{
                width: '100%',
                padding: 10,
                marginBottom: 12,
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                color: '#fff',
              }}
            />
            <input
              type="text"
              placeholder="Notes (optional)"
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              style={{
                width: '100%',
                padding: 10,
                marginBottom: 12,
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                color: '#fff',
              }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={addPerson}
                style={{
                  flex: 1,
                  padding: 10,
                  background: '#00ff88',
                  color: '#000',
                  border: 'none',
                  borderRadius: 8,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => setAdding(false)}
                style={{
                  padding: 10,
                  background: 'rgba(255,255,255,0.1)',
                  color: '#ccc',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
