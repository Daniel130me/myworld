import type { ChatItem, ExploreSession, HistoryItem, SavedPlace } from './types';

// Guest data stays in the browser. Nothing is uploaded in guest mode.

const STORAGE = {
  saved: 'curiosity-saved-v1', history: 'curiosity-history-v1', sessions: 'curiosity-sessions-v1',
  chats: 'curiosity-chats-v1', preferences: 'curiosity-preferences-v1', seenIntro: 'curiosity-welcome-v1'
} as const;

export type Preferences = { theme: 'light' | 'dark'; preferredTopics: string[]; sound: boolean };

function read<T>(key: string, fallback: T): T {
  try { const content = localStorage.getItem(key); return content ? JSON.parse(content) as T : fallback; } catch { return fallback; }
}
function write(key: string, data: unknown) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch { /* Private browsing or storage quota: app still works. */ }
}

export const localData = {
  readSaved: () => read<SavedPlace[]>(STORAGE.saved, []),
  savePlaces: (places: SavedPlace[]) => write(STORAGE.saved, places.slice(0, 200)),
  readHistory: () => read<HistoryItem[]>(STORAGE.history, []),
  saveHistory: (places: HistoryItem[]) => write(STORAGE.history, places.slice(0, 100)),
  readSessions: () => read<ExploreSession[]>(STORAGE.sessions, []),
  saveSessions: (sessions: ExploreSession[]) => write(STORAGE.sessions, sessions.slice(0, 25)),
  readChats: () => read<Record<string, ChatItem[]>>(STORAGE.chats, {}),
  saveChats: (chats: Record<string, ChatItem[]>) => write(STORAGE.chats, chats),
  readPreferences: () => read<Preferences>(STORAGE.preferences, { theme: 'light', preferredTopics: [], sound: false }),
  savePreferences: (prefs: Preferences) => write(STORAGE.preferences, prefs),
  hasSeenWelcome: () => read<boolean>(STORAGE.seenIntro, false),
  markWelcome: () => write(STORAGE.seenIntro, true),
  clear: () => { Object.values(STORAGE).forEach(key => { try { localStorage.removeItem(key); } catch { /* ignored */ } }); }
};
