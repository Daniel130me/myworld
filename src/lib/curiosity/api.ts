import type { AnswerResult, CapabilitiesResult, ChatItem, Coordinates, Place, ResolveResult } from './types';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function api<T>(path: string, options?: { method?: string; data?: unknown; signal?: AbortSignal }): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    method: options?.method || 'GET', credentials: 'include',
    headers: { 'Accept': 'application/json', ...(options?.data ? { 'Content-Type': 'application/json' } : {}) },
    body: options?.data ? JSON.stringify(options.data) : undefined, signal: options?.signal
  });
  const result: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = result && typeof result === 'object' && 'error' in result && typeof result.error === 'string'
      ? result.error : `Request failed (${response.status})`;
    throw new ApiError(response.status, message);
  }
  return result as T;
}

export const endpoints = {
  capabilities: () => api<CapabilitiesResult>('/capabilities'),
  recommendations: (location: Coordinates, seen: string[], recentTopics: string[], exclude: string[], preferredTopics: string[], mode: 'nearby' | 'surprise' = 'nearby') =>
    api<{ places: Place[]; mode: 'live' | 'demo'; notice: string }>('/curiosity/recommendations', { method: 'POST', data: { ...location, seen, recentTopics, exclude, preferredTopics, mode } }),
  resolve: (coordinates: Coordinates, placeId?: string, wikiId?: string) =>
    api<ResolveResult>('/places/resolve', { method: 'POST', data: { ...coordinates, placeId, wikiId } }),
  discovery: (id: string) => api<{ place: Place; related: Place[] }>(`/discoveries/${encodeURIComponent(id)}`),
  search: (q: string) => api<{ places: Place[]; notice: string }>(`/search?q=${encodeURIComponent(q)}`),
  answer: (placeId: string, question: string, history: ChatItem[]) =>
    api<AnswerResult>('/conversations/answer', { method: 'POST', data: { placeId, question, history: history.slice(-8).map(({ role, content }) => ({ role, content })) } })
};
