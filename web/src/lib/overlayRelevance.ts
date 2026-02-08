/**
 * Per-item overlay relevance from RAG profile: shopping list match + optional quick scan from Gemini.
 */

import type { PersonProfile } from './rag';
import { isOnShoppingList } from './rag';

export type EmphasisLevel = 'high' | 'medium' | 'none';

export interface OverlaySnippet {
  emphasis: EmphasisLevel;
  /** e.g. "On list" */
  badge?: string;
  /** Short line for overlay: protein/dollar, Halal, or vitamin highlight */
  line?: string;
}

/** Compute overlay snippet: shopping list badge + preference relevance line from API (Halal, High protein, Vitamin D, etc.). */
export function getOverlaySnippet(label: string, profile: PersonProfile | null, relevanceFromApi?: string): OverlaySnippet {
  if (!profile) {
    return { emphasis: 'none' };
  }
  const onList = isOnShoppingList(label, profile);
  const hasRelevance = Boolean(relevanceFromApi?.trim());
  if (onList && hasRelevance) {
    return {
      emphasis: 'high',
      badge: 'On list',
      line: relevanceFromApi!.trim(),
    };
  }
  if (onList) {
    return { emphasis: 'high', badge: 'On list' };
  }
  if (hasRelevance) {
    return { emphasis: 'high', line: relevanceFromApi!.trim() };
  }
  return { emphasis: 'none' };
}
