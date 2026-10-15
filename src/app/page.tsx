'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import './curiosity.css';
import {
  ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Bookmark, Check, ChevronDown, ChevronRight,
  Compass, Crosshair, Globe2, Heart, History, Info, LoaderCircle, MapPin, MessageCircle,
  Moon, Navigation2, Pause, Play, RotateCcw, Search, Send, Settings2, ShieldCheck, Shuffle,
  Sparkles, Sun, Volume2, VolumeX, X, WifiOff, Trash2, LogIn, LogOut, Library
} from 'lucide-react';
import type { ChatItem, ClientCapabilities, Coordinates, ExploreSession, HistoryItem, Mode, Place, SavedPlace } from '@/lib/curiosity/types';
import { api, endpoints } from '@/lib/curiosity/api';
import { localData, type Preferences } from '@/lib/curiosity/storage';

// The map touches window/Leaflet/Google APIs, so it is client-side only.
const MapCanvas = dynamic(
  () => import('@/components/curiosity/MapCanvas').then(m => m.MapCanvas),
  { ssr: false, loading: () => <div className="map-frame" aria-hidden="true" /> }
);

const INITIAL_CENTER = { lat: 6.455, lng: 3.395 };
const MODES: { id: Mode; title: string; description: string }[] = [
  { id: 'quiet', title: 'Quiet explore', description: 'Just the map, stories on your terms.' },
  { id: 'smart', title: 'Smart companion', description: 'Thoughtful suggestions without constant interruption.' },
  { id: 'storyteller', title: 'Storyteller', description: 'Listen to discoveries, when you choose.' }
];
const TOPICS = ['History', 'Architecture', 'Engineering', 'Culture', 'Nature', 'Economy', 'Education', 'Places'];
const dateString = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const coordsLabel = (p: Coordinates) => `${p.lat.toFixed(4)}°, ${p.lng.toFixed(4)}°`;
const short = (text: string, length = 155) => text.length > length ? `${text.slice(0, length).trimEnd()}…` : text;
const assetPlace = (place: Place): SavedPlace => ({ placeId: place.id, name: place.name, category: place.category, lat: place.lat, lng: place.lng, note: '', savedAt: new Date().toISOString() });
const debounce = (fn: (position: Coordinates) => void, wait: number) => {
  let timer: ReturnType<typeof setTimeout>;
  return (position: Coordinates) => { clearTimeout(timer); timer = setTimeout(() => fn(position), wait); };
};
const syncUrlTab = (tab: string) => {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (tab === 'explore') url.searchParams.delete('tab'); else url.searchParams.set('tab', tab);
  window.history.replaceState(null, '', url);
};

function PlaceCard({ place, open, saved, toggle, compact = false }: { place: Place; open: () => void; saved: boolean; toggle: () => void; compact?: boolean }) {
  return <article className={`place-card ${compact ? 'place-card-compact' : ''}`}>
    <button className="place-image" onClick={open} aria-label={`Discover ${place.name}`}>
      {place.thumbnail ? <img alt="" src={place.thumbnail} loading="lazy" /> : <div className="image-pattern"><Globe2 size={31} /><span>GO EXPLORE</span></div>}
      <span className="image-category">{place.category}</span>
    </button>
    <div className="place-details"><div className="card-title-row"><button className="card-title" onClick={open}>{place.name}</button>
      <button className={`icon-button save-icon ${saved ? 'saved' : ''}`} aria-label={saved ? `Remove ${place.name} from saved` : `Save ${place.name}`} onClick={toggle}><Bookmark size={17} fill={saved ? 'currentColor' : 'none'} /></button></div>
      <p>{short(place.summary || place.description, compact ? 85 : 138)}</p>
      <div className="card-footer"><span><span className={`evidence-dot ${place.evidence}`}></span>{place.evidence === 'source-backed' ? 'Source-backed' : place.evidence === 'demo' ? 'Illustrative demo' : 'Area context'}</span><button onClick={open}>Explore <ArrowRight size={15} /></button></div>
    </div>
  </article>;
}

function AccountPanel({ close, hasAccounts, guestSaved, onLogin }: { close: () => void; hasAccounts: boolean; guestSaved: SavedPlace[]; onLogin: (user: { id: string; email: string } | null, cloud?: SavedPlace[]) => void }) {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [isNew, setIsNew] = useState(false); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(''); const [success, setSuccess] = useState('');
  const [me, setMe] = useState<{ id: string; email: string } | null>(null);
  useEffect(() => { api<{ user: { id: string; email: string } | null }>('/auth/me').then(r => setMe(r.user)).catch(() => { }); }, []);
  async function signIn(event: FormEvent) {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const result = await api<{ user: { id: string; email: string } }>(`/auth/${isNew ? 'register' : 'login'}`, { method: 'POST', data: { email, password } });
      setMe(result.user); setPassword('');
      const cloud = await api<{ items: (SavedPlace & { placeId: string })[] }>('/saved');
      onLogin(result.user, cloud.items); setSuccess('Signed in. Your cloud atlas is separate from guest discoveries.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Sign-in failed'); } finally { setBusy(false); }
  }
  async function importGuest() {
    setError(''); setBusy(true);
    try {
      await api('/saved/import', { method: 'POST', data: { items: guestSaved.map(s => ({ placeId: s.placeId, name: s.name, lat: s.lat, lng: s.lng, category: s.category, note: s.note })) } });
      const cloud = await api<{ items: SavedPlace[] }>('/saved'); onLogin(me, cloud.items); setSuccess('Guest discoveries imported to your account.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Import failed'); } finally { setBusy(false); }
  }
  async function logOut() {
    await api('/auth/logout', { method: 'POST' }); setMe(null); onLogin(null); setSuccess('Signed out. Guest discoveries stay on this device.');
  }
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}><section className="modal account-modal" role="dialog" aria-modal="true" aria-labelledby="account-heading">
    <div className="modal-head"><span className="eyebrow">YOUR ACCOUNT</span><button className="icon-button" onClick={close} aria-label="Close account"><X /></button></div>
    <h2 id="account-heading">Your atlas, your way.</h2>
    {!hasAccounts ? <><p>Explore freely without an account. Your saved places and journey history are stored locally in this browser.</p><div className="info-box"><ShieldCheck size={19} />Cross-device accounts require a connected account service. Nothing is being uploaded in guest mode.</div></> :
      me ? <><div className="identity-chip"><Check size={19} />Signed in as <strong>{me.email}</strong></div><p>Your account discoveries are saved separately from this device&apos;s guest atlas.</p>
        {guestSaved.length > 0 && <button className="button primary full" onClick={importGuest} disabled={busy}><Library size={16} /> Import {guestSaved.length} guest discoveries</button>}
        <button className="button secondary full" onClick={logOut}><LogOut size={17} /> Sign out</button></> :
      <><p>Create an account to sync saved discoveries between devices. You can also continue exploring without signing in.</p>
        <form className="account-form" onSubmit={signIn}><label>Email address<input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" /></label>
          <label>Password<input type="password" minLength={isNew ? 12 : 1} value={password} onChange={e => setPassword(e.target.value)} required autoComplete={isNew ? 'new-password' : 'current-password'} /></label>
          <button className="button primary full" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <LogIn size={17} />} {isNew ? 'Create account' : 'Sign in'}</button></form>
        <button className="text-link" onClick={() => setIsNew(x => !x)}>{isNew ? 'Already have an account? Sign in' : 'New here? Create an account'}</button>
      </>}
    {error && <p className="error-text" role="alert">{error}</p>}{success && <p className="success-text" role="status">{success}</p>}
  </section></div>;
}

function Welcome({ onManual, onLocate }: { onManual: () => void; onLocate: () => void }) {
  return <div className="modal-backdrop welcome-screen"><section className="welcome-modal" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
    <div className="welcome-visual" aria-hidden="true"><div className="orbit orbit-one"></div><div className="orbit orbit-two"></div><div className="welcome-globe"><Globe2 size={86} strokeWidth={0.8} /></div><span className="orbit-label label-one">✦ 08° 21′ N</span><span className="orbit-label label-two">A world to discover</span></div>
    <div className="welcome-content"><span className="brand"><span className="brand-mark"><Compass size={20} /></span> curiosity<span className="brand-dot">.</span></span>
      <div className="eyebrow">YOUR WORLD, REIMAGINED</div><h1 id="welcome-title">Every place<br />has <em>a story.</em></h1>
      <p>That street you pass every day. The building you&apos;ve always wondered about. The world is full of things worth knowing.</p>
      <div className="welcome-actions"><button className="button primary" onClick={onManual}>Explore the world <ArrowRight size={18} /></button>
        <button className="button light" onClick={onLocate}><Crosshair size={18} /> Around me</button></div>
      <div className="welcome-foot"><span><MapPin size={14} /> Tap anywhere</span><span><Sparkles size={14} /> Discover what matters</span><span><Bookmark size={14} /> Make it yours</span></div>
    </div>
  </section></div>;
}

function SavedCard({ place, onOpen, onRemove, onNote }: { place: SavedPlace; onOpen: () => void; onRemove: () => void; onNote: (note: string) => void }) {
  const [note, setNote] = useState(place.note); const [editing, setEditing] = useState(false);
  // Adjust local draft when the saved note changes upstream (documented render-adjust pattern).
  const [syncedNote, setSyncedNote] = useState(place.note);
  if (syncedNote !== place.note) { setSyncedNote(place.note); setNote(place.note); }
  return <article className="library-item"><div className="library-icon"><MapPin size={21} /></div><div className="library-content">
    <button onClick={onOpen} className="library-title">{place.name}<ArrowUpRight size={15} /></button><p>{place.category} · {dateString(place.savedAt ?? new Date().toISOString())}</p>
    {place.note && !editing && <div className="note-preview">“{place.note}”</div>}
    {editing ? <div className="note-editor"><textarea value={note} maxLength={1500} placeholder="Why did this place catch your eye?" onChange={e => setNote(e.target.value)} />
      <button className="small-action" onClick={() => { onNote(note); setEditing(false); }}>Save note</button><button className="small-action" onClick={() => setEditing(false)}>Cancel</button></div> : <button className="small-action" onClick={() => setEditing(true)}>{place.note ? 'Edit note' : '+ Add a note'}</button>}
  </div><button className="icon-button muted-icon" onClick={onRemove} aria-label={`Remove ${place.name}`}><X size={16} /></button></article>;
}

function CuriosityApp() {
  const [currentTab, setCurrentTab] = useState('explore');
  const [center, setCenter] = useState<Coordinates>(INITIAL_CENTER);
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [selected, setSelected] = useState<Place | null>(null);
  const [related, setRelated] = useState<Place[]>([]);
  const [candidates, setCandidates] = useState<Place[]>([]);
  const [loadingSelection, setLoadingSelection] = useState(false);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [overlay, setOverlay] = useState<'search' | 'account' | 'session' | 'recap' | null>(null);
  const [saved, setSaved] = useState<SavedPlace[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [sessions, setSessions] = useState<ExploreSession[]>([]);
  const [chats, setChats] = useState<Record<string, ChatItem[]>>({});
  const [prefs, setPrefs] = useState<Preferences>({ theme: 'light', preferredTopics: [], sound: false });
  const [seen, setSeen] = useState<string[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [searchText, setSearchText] = useState(''); const [searchTerm, setSearchTerm] = useState('');
  const [question, setQuestion] = useState(''); const [asking, setAsking] = useState(false);
  const [toast, setToast] = useState('');
  const [online, setOnline] = useState(true);
  const [following, setFollowing] = useState(false);
  const [locating, setLocating] = useState(false);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [cloudSaved, setCloudSaved] = useState<SavedPlace[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const watchRef = useRef<number | null>(null);
  const followingRef = useRef(following);
  useEffect(() => { followingRef.current = following; }, [following]);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeSession = sessions.find(s => s.status !== 'ended') ?? null;
  const visibleSaved = user ? cloudSaved : saved;
  const selectionChat = selected ? chats[selected.id] ?? [] : [];

  // Restore guest data from this browser after hydration (avoids SSR mismatches).
  useEffect(() => {
    setOnline(navigator.onLine);
    const storedHistory = localData.readHistory();
    setSaved(localData.readSaved());
    setHistory(storedHistory);
    setSessions(localData.readSessions());
    setChats(localData.readChats());
    setPrefs(localData.readPreferences());
    setSeen(storedHistory.map(item => item.place.id));
    setShowWelcome(!localData.hasSeenWelcome());
    document.documentElement.dataset.theme = localData.readPreferences().theme;
    setHydrated(true);
    // Restore tab / deep-linked place from the URL once.
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab) setCurrentTab(tab);
    const placeId = params.get('place');
    if (placeId) {
      endpoints.discovery(placeId).then(result => {
        setSelected(result.place); setRelated(result.related);
        setCenter({ lat: result.place.lat, lng: result.place.lng }); setSheetExpanded(true);
      }).catch(() => notify('The shared discovery could not be opened.'));
    }
  }, []);

  const capabilities = useQuery({ queryKey: ['capabilities'], queryFn: endpoints.capabilities, retry: 1 });
  const recommendationCenter = { lat: Number(center.lat.toFixed(2)), lng: Number(center.lng.toFixed(2)) };
  const discoveries = useQuery({
    queryKey: ['recommend', recommendationCenter.lat, recommendationCenter.lng, seen.slice(-12).join(','), dismissed.join(','), prefs.preferredTopics.join(',')],
    queryFn: () => endpoints.recommendations(recommendationCenter, seen.slice(-50), history.slice(0, 8).map(h => h.place.category), dismissed, prefs.preferredTopics),
    enabled: online, staleTime: 1000 * 60 * 3
  });
  const searchResults = useQuery({ queryKey: ['search', searchTerm], queryFn: () => endpoints.search(searchTerm), enabled: searchTerm.length >= 2 && online, staleTime: 1000 * 60 * 3 });
  const discoveryDetail = useQuery({ queryKey: ['detail', selected?.id], queryFn: () => endpoints.discovery(selected!.id), enabled: Boolean(selected && /^wiki-\d+$/.test(selected.id)), staleTime: 1000 * 60 * 6 });
  const currentPlace = discoveryDetail.data?.place ?? selected;
  const placePins = useMemo(() => [...(discoveries.data?.places ?? []), ...(selected ? [selected] : [])].filter((p, i, arr) => arr.findIndex(x => x.id === p.id) === i), [discoveries.data, selected]);

  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setOverlay('search'); }
      if (event.key === 'Escape') { setOverlay(null); }
    };
    window.addEventListener('keydown', keys); return () => window.removeEventListener('keydown', keys);
  }, []);
  // Persist guest data only after the initial load, so we never overwrite storage with empty defaults.
  useEffect(() => { if (hydrated) localData.savePlaces(saved); }, [saved, hydrated]);
  useEffect(() => { if (hydrated) localData.saveHistory(history); }, [history, hydrated]);
  useEffect(() => { if (hydrated) localData.saveSessions(sessions); }, [sessions, hydrated]);
  useEffect(() => { if (hydrated) localData.saveChats(chats); }, [chats, hydrated]);
  useEffect(() => { if (hydrated) { localData.savePreferences(prefs); document.documentElement.dataset.theme = prefs.theme; } }, [prefs, hydrated]);
  useEffect(() => {
    const state = () => setOnline(navigator.onLine);
    window.addEventListener('online', state); window.addEventListener('offline', state);
    return () => { window.removeEventListener('online', state); window.removeEventListener('offline', state); };
  }, []);
  useEffect(() => { api<{ user: { id: string; email: string } | null }>('/auth/me').then(async r => {
    if (!r.user) return;
    setUser(r.user);
    const savedResult = await api<{ items: SavedPlace[] }>('/saved'); setCloudSaved(savedResult.items.map(p => ({ ...p, savedAt: (p as unknown as { createdAt?: string }).createdAt ?? new Date().toISOString() })));
  }).catch(() => { }); }, []);
  useEffect(() => () => { if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current); window.speechSynthesis?.cancel(); }, []);

  function notify(text: string) {
    setToast(text); if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 4500);
  }
  function goTo(tab: string) { setCurrentTab(tab); syncUrlTab(tab); setSelected(null); setCandidates([]); setSheetExpanded(false); setOverlay(null); }
  function completeWelcome() { localData.markWelcome(); setShowWelcome(false); }
  function recordDiscovery(place: Place) {
    setHistory(prev => [{ place, openedAt: new Date().toISOString() }, ...prev.filter(x => x.place.id !== place.id)].slice(0, 100));
    setSeen(prev => [...new Set([...prev, place.id])].slice(-100));
    setSessions(prev => prev.map(s => s.status === 'active' ? { ...s, discoveries: [...new Set([...s.discoveries, place.id])] } : s));
  }
  function openPlace(place: Place) {
    setSelected(place); setCandidates([]); setRelated([]); setSheetExpanded(true); recordDiscovery(place);
    if (place.id.startsWith('wiki-') || place.id.startsWith('demo-')) {
      endpoints.discovery(place.id).then(d => setRelated(d.related)).catch(() => { });
    }
    if (currentTab !== 'explore') { setCurrentTab('explore'); syncUrlTab('explore'); }
    if (place.lat || place.lng) setCenter({ lat: place.lat, lng: place.lng });
    setOverlay(null);
  }
  async function chooseCoordinate(value: Coordinates, wikiId?: string, googleId?: string) {
    if ('id' in value && typeof value.id === 'string' && !googleId) { openPlace(value as Place); return; }
    setSelected({ id: `point-${value.lat.toFixed(5)}-${value.lng.toFixed(5)}`, name: 'Exploring this spot', ...value, category: 'Area context', description: 'Finding what is known nearby…', summary: 'Looking for identifiable places and sources around this coordinate.', source: null, thumbnail: null, evidence: 'area-context', matched: 'area-only' });
    setSheetExpanded(true); setCandidates([]); setLoadingSelection(true);
    try {
      const result = await endpoints.resolve(value, googleId, wikiId);
      setSelected(result.selection); setCandidates(result.candidates);
      if (result.selection.matched === 'exact-id' || result.selection.matched === 'exact-name') recordDiscovery(result.selection);
      if (result.notice) notify(result.notice);
    } catch { notify('Location research is temporarily unavailable. Try another place or search.'); }
    finally { setLoadingSelection(false); }
  }
  function toggleSave(place: Place) {
    const exists = visibleSaved.some(s => s.placeId === place.id);
    if (user) {
      if (exists) {
        const entry = cloudSaved.find(s => s.placeId === place.id);
        if (entry?.id) api(`/saved/${entry.id}`, { method: 'DELETE' }).then(() => setCloudSaved(prev => prev.filter(p => p.placeId !== place.id))).catch(() => notify('Could not remove the cloud item.'));
      } else api('/saved', { method: 'POST', data: { ...assetPlace(place), placeId: place.id } }).then(() => api<{ items: SavedPlace[] }>('/saved')).then(r => setCloudSaved(r.items.map(p => ({ ...p, savedAt: (p as unknown as { createdAt?: string }).createdAt ?? new Date().toISOString() })))).catch(() => notify('Could not sync. Try again.'));
    } else setSaved(prev => exists ? prev.filter(s => s.placeId !== place.id) : [assetPlace(place), ...prev]);
    setSessions(prev => prev.map(s => s.status === 'active' && !exists ? { ...s, saved: [...new Set([...s.saved, place.id])] } : s));
    notify(exists ? 'Removed from your atlas' : 'Added to your discovery atlas');
  }
  function updateNote(savedPlace: SavedPlace, note: string) {
    if (user) { if (savedPlace.id) api(`/saved/${savedPlace.id}`, { method: 'PATCH', data: { note } }).then(() => setCloudSaved(prev => prev.map(s => s.placeId === savedPlace.placeId ? { ...s, note } : s))).catch(() => notify('Could not save note')); }
    else setSaved(prev => prev.map(s => s.placeId === savedPlace.placeId ? { ...s, note } : s));
  }
  async function openSaved(s: SavedPlace) {
    setCenter({ lat: s.lat, lng: s.lng }); goTo('explore');
    const localPlace = history.find(h => h.place.id === s.placeId)?.place;
    if (localPlace) { openPlace(localPlace); return; }
    try { const result = await endpoints.discovery(s.placeId); openPlace(result.place); }
    catch { await chooseCoordinate({ lat: s.lat, lng: s.lng }); notify('The original record is unavailable; showing the selected area.'); }
  }
  async function ask(questionText = question) {
    if (!currentPlace || !questionText.trim() || asking) return;
    const text = questionText.trim(); setQuestion(''); setAsking(true);
    setChats(prev => ({ ...prev, [currentPlace.id]: [...(prev[currentPlace.id] ?? []), { role: 'user', content: text }] }));
    try { const reply = currentPlace.matched === 'area-only' && currentPlace.id.startsWith('point-')
      ? { answer: 'I cannot identify an exact building or verify claims about this coordinate. Try a named nearby discovery with a linked source.', generated: false, sources: [] }
      : await endpoints.answer(currentPlace.id, text, selectionChat);
      setChats(prev => ({ ...prev, [currentPlace.id]: [...(prev[currentPlace.id] ?? []), { role: 'assistant', content: reply.answer, generated: reply.generated, sources: reply.sources }] }));
    } catch (e) { setChats(prev => ({ ...prev, [currentPlace.id]: [...(prev[currentPlace.id] ?? []), { role: 'assistant', content: e instanceof Error ? e.message : 'Unable to answer right now' }] })); }
    finally { setAsking(false); }
  }
  function getLocation() {
    if (!navigator.geolocation) { notify('This browser does not support geolocation. You can explore manually.'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(position => {
      const p = { lat: position.coords.latitude, lng: position.coords.longitude }; setUserLocation(p); setCenter(p);
      setAccuracy(position.coords.accuracy); setFollowing(true); setLocating(false); notify('Showing your approximate current location.');
    }, () => { setLocating(false); notify('Location unavailable. You can explore anywhere manually.'); }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 });
  }
  function startForegroundWatch() {
    if (!userLocation || !navigator.geolocation || watchRef.current !== null) return;
    // Watch only after the user has explicitly requested foreground location.
    watchRef.current = navigator.geolocation.watchPosition(pos => {
      const position = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setUserLocation(position); setAccuracy(pos.coords.accuracy);
      if (followingRef.current) setCenter(position);
    }, () => notify('Location updates were interrupted. Manual exploration still works.'),
    { enableHighAccuracy: false, maximumAge: 30000, timeout: 15000 });
  }
  function startSession(mode: Mode) {
    const session: ExploreSession = { id: crypto.randomUUID(), startedAt: new Date().toISOString(), status: 'active', mode, discoveries: [], saved: [] };
    setSessions(prev => [session, ...prev]); setOverlay(null); notify(`${MODES.find(m => m.id === mode)?.title} is now active`);
    if (mode !== 'quiet') startForegroundWatch();
  }
  function stopTracking() { if (watchRef.current !== null) { navigator.geolocation.clearWatch(watchRef.current); watchRef.current = null; } }
  function updateSession(status: 'paused' | 'active' | 'ended') {
    const oldMode = activeSession?.mode;
    setSessions(prev => prev.map(s => s.status !== 'ended' ? { ...s, status, ...(status === 'ended' ? { endedAt: new Date().toISOString() } : {}) } : s));
    if (status !== 'active') { stopTracking(); window.speechSynthesis?.cancel(); }
    else if (oldMode !== 'quiet') startForegroundWatch();
    if (status === 'ended') { setOverlay('recap'); notify('Journey saved on this device.'); }
    else notify(status === 'paused' ? 'Session paused' : 'Session resumed');
  }
  function changeMode(mode: Mode) { setSessions(prev => prev.map(s => s.status !== 'ended' ? { ...s, mode } : s)); notify(`Changed to ${MODES.find(m => m.id === mode)?.title}`); }
  function speak(text: string) {
    if (!('speechSynthesis' in window)) { notify('Speech synthesis is not supported in this browser.'); return; }
    window.speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(short(text.replace(/\s+/g, ' ').trim(), 720)); utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance); notify('Reading the sourced story. Tap mute to stop.');
  }
  function surpriseMe() {
    const places = discoveries.data?.places ?? [];
    const categories = new Set(history.slice(0, 6).map(x => x.place.category));
    const next = places.find(p => !categories.has(p.category) && !seen.includes(p.id)) ?? places.find(p => !seen.includes(p.id)) ?? places[0];
    if (next) openPlace(next); else notify('Try another map area to discover something different.');
  }
  const centerDebounce = useMemo(() => debounce((p: Coordinates) => { setCenter(p); setFollowing(false); }, 800), []);
  const lastSession = sessions.find(s => s.status === 'ended');

  return <div className="app-shell">
    <header className="topbar"><button className="brand brand-button" onClick={() => goTo('explore')} aria-label="Curiosity home"><span className="brand-mark"><Compass size={19} /></span> curiosity<span className="brand-dot">.</span></button>
      <div className="topbar-center"><span className="topbar-divider" /><span className="topbar-tagline">The world is more interesting than you think.</span></div>
      <div className="top-actions"><button className="top-search" onClick={() => setOverlay('search')}><Search size={17} /><span>Search the world</span><kbd>⌘ K</kbd></button>
        <button className="icon-button theme-icon" onClick={() => setPrefs(prev => ({ ...prev, theme: prev.theme === 'light' ? 'dark' : 'light' }))} aria-label="Toggle theme">{prefs.theme === 'light' ? <Moon size={19} /> : <Sun size={19} />}</button>
        <button className="avatar" aria-label="Account" onClick={() => setOverlay('account')}><span>{user?.email?.[0]?.toUpperCase() ?? 'G'}</span></button></div></header>
    <main className="workspace">
      <aside className={`sidebar ${sheetExpanded ? 'sheet-open' : 'sheet-peek'}`} aria-label="Discovery panel">
        <button className="sheet-handle" onClick={() => setSheetExpanded(p => !p)} aria-label={sheetExpanded ? 'Collapse discovery panel' : 'Expand discovery panel'}><span /></button>
        <div className="sidebar-scroll">
        {currentTab === 'explore' && (currentPlace ? <section className="selected-view">
          <div className="section-toolbar"><button className="quiet-link" onClick={() => { setSelected(null); setCandidates([]); setSheetExpanded(false); }}><ArrowLeft size={16} /> Back to discoveries</button>
            <button className="icon-button" onClick={() => setSheetExpanded(p => !p)} aria-label="Toggle panel"><ChevronDown size={18} /></button></div>
          <div className="story-title-area"><div className="eyebrow"><span className={`evidence-dot ${currentPlace.evidence}`}></span>{currentPlace.evidence === 'source-backed' ? 'VERIFIED SOURCE AVAILABLE' : currentPlace.evidence === 'demo' ? 'ILLUSTRATIVE DEMONSTRATION' : 'NEARBY AREA · NOT EXACT OBJECT'}</div>
            <h1>{currentPlace.name}</h1><p className="story-subtitle">{currentPlace.description}</p></div>
          {currentPlace.thumbnail && <div className="story-hero"><img src={currentPlace.thumbnail} alt={`Illustration of ${currentPlace.name}`} loading="lazy" /></div>}
          <div className="story-actions"><button className={`button ${visibleSaved.some(s => s.placeId === currentPlace.id) ? 'secondary' : 'primary'}`} onClick={() => toggleSave(currentPlace)}><Bookmark size={16} fill={visibleSaved.some(s => s.placeId === currentPlace.id) ? 'currentColor' : 'none'} />{visibleSaved.some(s => s.placeId === currentPlace.id) ? 'Saved to atlas' : 'Save discovery'}</button>
            <button className="button secondary square" onClick={() => { const url = new URL(window.location.href); url.searchParams.set('place', currentPlace.id); if (navigator.share) navigator.share({ title: currentPlace.name, url: url.toString() }).catch(() => { }); else navigator.clipboard?.writeText(url.toString()).then(() => notify('Link copied to clipboard')).catch(() => notify('Sharing unavailable')); }} aria-label="Share discovery"><ArrowUpRight size={19} /></button>
            {currentPlace.source && <button className="button secondary square" title="Listen to story" onClick={() => speak(currentPlace.summary)} aria-label="Listen to story"><Volume2 size={19} /></button>}
            <button className="button secondary square" title="Stop audio" onClick={() => window.speechSynthesis?.cancel()} aria-label="Stop speaking"><VolumeX size={19} /></button></div>
          <div className="story-section"><div className="story-heading"><Sparkles size={16} />THE STORY SO FAR</div>
            {loadingSelection ? <div className="skeleton-text"><i /><i /><i /></div> : <p className="narrative">{currentPlace.summary}</p>}
            {currentPlace.evidence !== 'source-backed' && <div className="evidence-notice"><Info size={18} /><span>{currentPlace.evidence === 'demo' ? 'This is an illustrative topic, not a verified historical claim.' : 'A coordinate alone cannot prove which building or business is here. Nearby entries are suggestions, not verified matches.'}</span></div>}</div>
          {currentPlace.source && <div className="story-section"><div className="story-heading"><BookOpen size={16} />CHECK THE SOURCE</div>
            <a className="source-card" href={currentPlace.source.url} target="_blank" rel="noreferrer"><span><strong>{currentPlace.source.title}</strong><small>{currentPlace.source.publisher} · Retrieved {dateString(currentPlace.source.retrievedAt)}</small></span><ArrowUpRight size={18} /></a>
            <p className="microcopy">The summary is based on this reference; check the full article for details and updates.</p></div>}
          {candidates.length > 0 && <div className="story-section"><div className="story-heading"><MapPin size={16} />RECOGNIZED PLACES NEARBY</div><p className="hint">These are possible things to explore, not an identification of the spot you tapped.</p>
            <div className="related-list">{candidates.map(p => <button key={p.id} onClick={() => openPlace(p)}><span><strong>{p.name}</strong><small>{p.category}</small></span><ArrowRight size={16} /></button>)}</div></div>}
          <div className="story-section conversation"><div className="story-heading"><MessageCircle size={16} />ASK ABOUT THIS PLACE</div>
            <p className="hint">{capabilities.data?.ai ? 'Answers use available source evidence, with uncertainty disclosed.' : 'Source-grounded excerpts are available. AI conversation can be enabled later.'}</p>
            {selectionChat.length > 0 && <div className="chat-list" aria-live="polite">{selectionChat.map((item, i) => <div key={`${i}-${item.role}`} className={`chat-bubble ${item.role}`}>{item.content}{item.role === 'assistant' && <small>{item.generated ? 'AI summary · verify against the sources' : 'Source-based response'}</small>}{item.role === 'assistant' && item.sources && item.sources.length > 0 && <span className="chat-sources">{item.sources.slice(0, 4).map((s, si) => <a key={`${s.url}-${si}`} href={s.url} target="_blank" rel="noreferrer" title={s.title}>{s.publisher}</a>)}</span>}</div>)}</div>}
            <div className="suggested-questions">{(currentPlace.evidence === 'source-backed' ? ['What is interesting here?', 'What can the source confirm?', 'Tell me something different'] : ['Is this the exact building?', 'What else is nearby?']).map(item => <button key={item} onClick={() => ask(item)} disabled={asking}>{item}<ArrowUpRight size={13} /></button>)}</div>
            <form className="chat-form" onSubmit={e => { e.preventDefault(); ask(); }}><input value={question} onChange={e => setQuestion(e.target.value)} placeholder="What are you curious about?" maxLength={650} aria-label="Ask a question" /><button aria-label="Send question" disabled={asking || !question.trim()}>{asking ? <LoaderCircle className="spin" size={18} /> : <Send size={18} />}</button></form></div>
          {(related.length > 0 || discoveries.data?.places) && <div className="story-section"><div className="story-heading"><Shuffle size={16} />FOLLOW YOUR CURIOSITY</div><div className="related-list">
              {related.filter(x => x.id !== currentPlace.id).slice(0, 3).map(p => <button key={p.id} onClick={() => openPlace(p)}><span><strong>{p.name}</strong><small>{p.category} · Related place</small></span><ChevronRight size={16} /></button>)}
              <button onClick={surpriseMe}><span><strong>Surprise me</strong><small>Explore a different direction</small></span><Shuffle size={16} /></button></div></div>}
        </section> : <section className="explore-feed">
          <div className="hero-intro"><div className="eyebrow"><span className="eyebrow-dash" /> WELCOME TO YOUR WORLD</div>
            <h1>There&apos;s more<br />to <em>everywhere.</em></h1><p>Places are full of stories. Find a little wonder, wherever you look.</p></div>
          <div className="explore-cta-grid"><button className="explore-cta primary-cta" onClick={() => { setSheetExpanded(true); discoveries.refetch(); }}><span className="cta-icon"><Sparkles size={20} /></span><strong>Explore for me</strong><small>Find something fascinating nearby</small><ArrowUpRight size={19} className="cta-arrow" /></button>
            <button className="explore-cta" onClick={() => setOverlay('session')}><span className="cta-icon"><Navigation2 size={20} /></span><strong>Start exploring</strong><small>Make this a discovery journey</small><ArrowUpRight size={19} className="cta-arrow" /></button></div>
          {activeSession && <div className="session-banner"><div><span className="eyebrow">EXPLORATION SESSION</span><strong>{MODES.find(m => m.id === activeSession.mode)?.title}</strong><small>{activeSession.discoveries.length} discoveries opened · {activeSession.status}</small></div><button className="icon-button" onClick={() => updateSession(activeSession.status === 'paused' ? 'active' : 'paused')} aria-label={activeSession.status === 'paused' ? 'Resume session' : 'Pause session'}>{activeSession.status === 'paused' ? <Play size={18} /> : <Pause size={18} />}</button><button className="small-action" onClick={() => updateSession('ended')}>End</button></div>}
          <div className="section-heading"><div><div className="eyebrow">THE CURIOUS COLLECTION</div><h2>Worth exploring <span className="handdrawn">✳</span></h2></div><button className="quiet-link" onClick={() => discoveries.refetch()}><RotateCcw size={16} /> Refresh</button></div>
          <div className="location-context"><MapPin size={16} /><span>Discoveries around <strong>{userLocation ? 'your chosen area' : coordsLabel(center)}</strong></span></div>
          {!online && <div className="info-box"><WifiOff size={18} />You&apos;re offline. Live research is unavailable, but your saved atlas is still here.</div>}
          {discoveries.data?.mode === 'demo' && <div className="demo-label"><Info size={15} /> Demonstration topics — not verified facts</div>}
          {discoveries.isPending && online ? <div className="cards-loading"><div /><div /><div /></div> :
            discoveries.isError ? <div className="empty-state"><WifiOff size={24} /><h3>Couldn&apos;t reach the discovery service</h3><p>Try reconnecting or opening your personal atlas.</p><button className="button secondary" onClick={() => discoveries.refetch()}>Try again</button></div> :
            !discoveries.data?.places.length ? <div className="empty-state"><Compass size={24} /><h3>No nearby encyclopedia entries</h3><p>Move the map to another area, or search for a place to explore.</p><button className="button secondary" onClick={() => setOverlay('search')}>Search places</button></div> :
            <div className="place-grid">{discoveries.data.places.map(p => <PlaceCard key={p.id} place={p} open={() => openPlace(p)} saved={visibleSaved.some(s => s.placeId === p.id)} toggle={() => toggleSave(p)} />)}</div>}
          <button className="surprise-cta" onClick={surpriseMe}><Shuffle size={19} /><span><strong>Take me somewhere unexpected</strong><small>A little more curiosity, a little less routine.</small></span><ArrowRight size={18} /></button>
          <p className="feed-footer">A world of stories, one place at a time. <Heart size={12} /></p>
        </section>)}
        {currentTab === 'atlas' && <section className="inner-page"><div className="eyebrow">YOUR PERSONAL COLLECTION</div><h1>Your discovery <em>atlas.</em></h1><p className="page-subtitle">The places that made you curious, saved to return to whenever you like.</p>
          <div className="stat-strip"><div><strong>{visibleSaved.length}</strong><span>Saved places</span></div><div><strong>{history.length}</strong><span>Explored virtually</span></div></div>
          <div className="section-heading small-heading"><h2>Saved discoveries</h2></div>
          {visibleSaved.length ? <div className="library-list">{visibleSaved.map(s => <SavedCard key={s.placeId} place={s} onOpen={() => openSaved(s)} onRemove={() => {
            if (user) { if (s.id) api(`/saved/${s.id}`, { method: 'DELETE' }).then(() => setCloudSaved(prev => prev.filter(p => p.placeId !== s.placeId))).catch(() => notify('Could not remove'));
            } else setSaved(prev => prev.filter(p => p.placeId !== s.placeId));
          }} onNote={note => updateNote(s, note)} />)}</div> : <div className="empty-state"><Bookmark size={27} /><h3>A beautiful blank page</h3><p>When something catches your curiosity, tap the bookmark. It will appear here.</p><button className="button primary" onClick={() => goTo('explore')}>Start discovering <ArrowRight size={16} /></button></div>}
        </section>}
        {currentTab === 'history' && <section className="inner-page"><div className="eyebrow">WHERE YOUR CURIOSITY WENT</div><h1>Recently <em>explored.</em></h1><p className="page-subtitle">A record of places you opened on the map — not a record of places you physically visited.</p>
          {history.length > 0 ? <><div className="library-list">{history.map(item => <div key={item.place.id} className="library-item"><div className="library-icon"><History size={19} /></div><div className="library-content"><button className="library-title" onClick={() => openPlace(item.place)}>{item.place.name}<ArrowUpRight size={15} /></button><p>{item.place.category} · {dateString(item.openedAt)}</p></div></div>)}</div><button className="quiet-link destructive" onClick={() => { if (window.confirm('Clear the history stored on this browser?')) { setHistory([]); setSeen([]); } }}><Trash2 size={16} /> Clear history</button></> : <div className="empty-state"><History size={26} /><h3>Your journey starts here</h3><p>Open a discovery to start a history of the subjects you&apos;ve explored.</p></div>}
          <div className="section-heading small-heading"><h2>Past sessions</h2></div><div className="library-list">{sessions.filter(s => s.status === 'ended').map(s => <div className="library-item" key={s.id}><div className="library-icon"><Navigation2 size={19} /></div><div className="library-content"><strong>{MODES.find(m => m.id === s.mode)?.title}</strong><p>{dateString(s.startedAt)} · {s.discoveries.length} opened · {s.saved.length} saved</p></div></div>)}</div>
        </section>}
        {currentTab === 'settings' && <section className="inner-page"><div className="eyebrow">MAKE IT YOURS</div><h1>Explore your <em>way.</em></h1><p className="page-subtitle">Make room for the things you&apos;re curious about, and change course whenever you like.</p>
          <div className="settings-group"><h2>Appearance</h2><div className="settings-row"><span>Dark mode</span><button className={`switch ${prefs.theme === 'dark' ? 'on' : ''}`} role="switch" aria-checked={prefs.theme === 'dark'} onClick={() => setPrefs(p => ({ ...p, theme: p.theme === 'dark' ? 'light' : 'dark' }))}><span /></button></div></div>
          <div className="settings-group"><h2>Topics that interest you</h2><p className="hint">A gentle preference, not a filter. You&apos;ll still encounter new ideas.</p><div className="topic-grid">{TOPICS.map(t => <button className={`topic-chip ${prefs.preferredTopics.includes(t) ? 'active' : ''}`} key={t} onClick={() => setPrefs(p => ({ ...p, preferredTopics: p.preferredTopics.includes(t) ? p.preferredTopics.filter(x => x !== t) : [...p.preferredTopics, t] }))}>{t}{prefs.preferredTopics.includes(t) && <Check size={14} />}</button>)}</div></div>
          <div className="settings-group"><h2>Privacy &amp; data</h2><div className="info-box"><ShieldCheck size={21} /> Precise location is requested only when you choose it. Your guest atlas stays on this device. Exploration is not background-tracked.</div>
            <button className="setting-action" onClick={() => { stopTracking(); setFollowing(false); setUserLocation(null); notify('Foreground location tracking stopped.'); }}><Crosshair size={17} /> Stop location tracking <ChevronRight size={16} /></button>
            <button className="setting-action destructive" onClick={() => { if (window.confirm('Delete locally saved discoveries, history, conversations, sessions, and preferences from this browser?')) { stopTracking(); localData.clear(); setSaved([]); setHistory([]); setSessions([]); setChats({}); setPrefs({ theme: 'light', preferredTopics: [], sound: false }); notify('Local exploration data cleared.'); } }}><Trash2 size={17} /> Delete local exploration data <ChevronRight size={16} /></button>
            <button className="setting-action" onClick={() => setOverlay('account')}><LogIn size={17} /> Account &amp; cloud data <ChevronRight size={16} /></button></div>
          <div className="settings-group"><h2>About this version</h2><p className="hint">Curiosity v0.1 · Free-tier first release. Public encyclopedia data powers available stories. No live news connection in this version. Illustrative demo content is always labeled.</p></div>
        </section>}
        {currentTab === 'about' && <section className="inner-page"><div className="eyebrow">A NOTE ABOUT CURIOSITY</div><h1>The world is <em>wonderful.</em></h1><p className="page-subtitle">Curiosity helps you notice, learn and connect the stories behind places.</p><div className="story-section"><h2>What we know and what we don&apos;t</h2><p>Wikipedia provides publicly linked information about identified places. Clicking an unmarked coordinate does not identify a building. When we cannot verify a place, we say so and offer nearby suggestions.</p></div><div className="story-section"><h2>Location &amp; privacy</h2><p>Location permission is optional. This version uses only foreground access while you explore, and guest saved items stay inside your browser. Internet research requests include the coordinates or search term necessary to find places.</p></div><div className="story-section"><h2>Copyright and attribution</h2><p>Wikipedia text and Wikimedia images belong to their contributors and respective license holders. Check the original source for terms, attribution, and image licenses. Maps may use OpenStreetMap-contributed geographic data.</p></div><div className="story-section"><h2>Free-tier limitations</h2><p>This deployment runs on a single free web service. Guest data lives in your browser. Live AI and Google Maps require appropriately restricted provider credentials.</p></div></section>}
        </div>
        <nav className="sidebar-nav" aria-label="Main navigation"><button className={currentTab === 'explore' ? 'active' : ''} onClick={() => goTo('explore')}><Compass size={19} /><span>Explore</span></button>
          <button className={currentTab === 'atlas' ? 'active' : ''} onClick={() => goTo('atlas')}><Bookmark size={19} /><span>My atlas</span></button>
          <button className={currentTab === 'history' ? 'active' : ''} onClick={() => goTo('history')}><History size={19} /><span>History</span></button>
          <button className={currentTab === 'settings' ? 'active' : ''} onClick={() => goTo('settings')}><Settings2 size={19} /><span>Settings</span></button></nav>
      </aside>
      <section className="map-workspace" aria-label="Explore the map"><MapCanvas center={center} pins={currentTab === 'atlas' ? visibleSaved.map(s => ({ id: s.placeId, name: s.name, category: s.category, lat: s.lat, lng: s.lng, summary: 'Your saved discovery', description: s.note, source: null, thumbnail: null, evidence: 'area-context' as const, matched: 'area-only' as const })) : placePins}
        selected={selected} userLocation={userLocation} onViewport={centerDebounce} onSelect={chooseCoordinate} />
        <div className="map-topbar"><span className="map-badge"><span className="live-indicator" /> {discoveries.data?.mode === 'demo' ? 'Demo discovery layer' : 'Public knowledge layer'}</span>
          <button onClick={() => setOverlay('search')} className="map-search-button"><Search size={17} /> Search a place</button></div>
        <div className="map-actions"><button className="map-fab" onClick={getLocation} disabled={locating} title="My location" aria-label="Show my location">{locating ? <LoaderCircle className="spin" size={19} /> : <Crosshair size={19} />}</button>
          <button className="map-fab" onClick={() => { setCenter(INITIAL_CENTER); notify('Returned to the starter map area.'); }} title="Reset map" aria-label="Reset map"><Globe2 size={19} /></button>
          <button className="map-fab" onClick={() => { if (selected) setCenter({ lat: selected.lat, lng: selected.lng }); else notify('Select a discovery first.'); }} aria-label="Return to selected place" title="Last selected"><MapPin size={19} /></button></div>
        <div className="map-bottom-info"><div><span className="map-coordinate"><MapPin size={14} />{coordsLabel(center)}</span>{accuracy !== null && <span className="map-accuracy">GPS ±{Math.round(accuracy)} m</span>}</div><button onClick={() => { setSelected(null); setSheetExpanded(false); goTo('explore'); }}>Discover nearby <ArrowRight size={15} /></button></div>
        {activeSession && activeSession.mode === 'smart' && activeSession.status === 'active' && !selected && <div className="smart-nudge"><Sparkles size={17} /><span>Something interesting is nearby.</span><button onClick={() => { const p = discoveries.data?.places[0]; if (p) openPlace(p); }}>Discover <ArrowRight size={15} /></button></div>}
      </section>
    </main>
    {showWelcome && <Welcome onManual={completeWelcome} onLocate={() => { completeWelcome(); getLocation(); }} />}
    {overlay === 'search' && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setOverlay(null); }}><section className="modal search-modal" role="dialog" aria-modal="true" aria-labelledby="search-heading"><div className="modal-head"><span className="eyebrow">FIND YOUR NEXT CURIOSITY</span><button className="icon-button" onClick={() => setOverlay(null)} aria-label="Close search"><X /></button></div><h2 id="search-heading">Where to?</h2>
      <form className="search-form" onSubmit={e => { e.preventDefault(); setSearchTerm(searchText.trim()); }}><Search size={22} /><input autoFocus placeholder="Search landmarks, places, topics…" value={searchText} onChange={e => setSearchText(e.target.value)} /><button className="button primary" disabled={searchText.trim().length < 2}>Search</button></form>
      <p className="hint">Search currently finds geographically identified encyclopedia entries. Full address autocomplete requires a configured place-search provider.</p>
      {searchResults.isFetching && <div className="loading-message"><LoaderCircle size={18} className="spin" />Searching public knowledge…</div>}
      {searchResults.isError && <p className="error-text">Search unavailable. Please try again.</p>}
      {searchResults.data && <div className="search-results" role="list">{searchResults.data.places.map(place => <button role="listitem" key={place.id} onClick={() => { openPlace(place); setCenter({ lat: place.lat, lng: place.lng }); }}><span className="search-place-icon"><MapPin size={17} /></span><span><strong>{place.name}</strong><small>{place.description}</small></span><ArrowUpRight size={18} /></button>)}{!searchResults.data.places.length && <p>No matching mapped entries were found. Try a more specific landmark or location name.</p>}</div>}
      </section></div>}
    {overlay === 'account' && <AccountPanel close={() => setOverlay(null)} hasAccounts={Boolean(capabilities.data?.accounts)} guestSaved={saved} onLogin={(next, items) => { setUser(next); if (items) setCloudSaved(items.map(p => ({ ...p, savedAt: (p as unknown as { createdAt?: string }).createdAt ?? new Date().toISOString() }))); }} />}
    {overlay === 'session' && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setOverlay(null); }}><section className="modal session-modal" role="dialog" aria-modal="true" aria-labelledby="session-heading"><div className="modal-head"><span className="eyebrow">LET&apos;S GO EXPLORING</span><button className="icon-button" onClick={() => setOverlay(null)} aria-label="Close session dialog"><X /></button></div>
      <h2 id="session-heading">Choose your pace.</h2><p>How would you like the world to unfold around you?</p>
      {activeSession ? <><div className="identity-chip"><Navigation2 size={18} /> Current mode: <strong>{MODES.find(m => m.id === activeSession.mode)?.title}</strong></div><div className="mode-options">{MODES.map(m => <button key={m.id} onClick={() => changeMode(m.id)}><span><strong>{m.title}</strong><small>{m.description}</small></span>{activeSession.mode === m.id && <Check size={17} />}</button>)}</div>
        <button className="button primary full" onClick={() => { updateSession(activeSession.status === 'active' ? 'paused' : 'active'); setOverlay(null); }}>{activeSession.status === 'active' ? 'Pause exploring' : 'Resume exploring'}</button><button className="button secondary full" onClick={() => updateSession('ended')}>End session &amp; see recap</button></> :
      <div className="mode-options">{MODES.map(m => <button key={m.id} onClick={() => startSession(m.id)}><span><strong>{m.title}</strong><small>{m.description}</small></span><ArrowRight size={17} /></button>)}</div>}
      <p className="microcopy">Foreground session only. Background GPS and audio cannot be guaranteed by mobile browsers.</p></section></div>}
    {overlay === 'recap' && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setOverlay(null); }}><section className="modal recap-modal" role="dialog" aria-modal="true" aria-labelledby="recap-heading"><div className="modal-head"><span className="eyebrow">YOUR EXPLORATION RECAP</span><button className="icon-button" onClick={() => setOverlay(null)} aria-label="Close recap"><X /></button></div><div className="recap-orb"><Compass size={40} /></div><h2 id="recap-heading">Look where curiosity took you.</h2>
      <p>A record of the subjects you opened on the map, not places you physically visited.</p><div className="stat-strip"><div><strong>{lastSession?.discoveries.length ?? 0}</strong><span>Places explored</span></div><div><strong>{lastSession?.saved.length ?? 0}</strong><span>Discoveries saved</span></div></div><button className="button primary full" onClick={() => setOverlay(null)}>Keep exploring <ArrowRight size={17} /></button></section></div>}
    {toast && <div className="toast-message" role="status"><Info size={17} />{toast}<button aria-label="Dismiss message" onClick={() => setToast('')}><X size={14} /></button></div>}
    {!online && <div className="offline-banner"><WifiOff size={15} /> Offline: only locally saved content is available.</div>}
    <button className="about-shortcut" onClick={() => goTo('about')} aria-label="About Curiosity"><Info size={16} /></button>
  </div>;
}

export default function Home() {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { retry: 1, staleTime: 120000, refetchOnWindowFocus: false } }
  }));
  return (
    <QueryClientProvider client={queryClient}>
      <CuriosityApp />
    </QueryClientProvider>
  );
}
