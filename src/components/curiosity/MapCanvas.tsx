'use client';

// Map renderer ported from frontend/src/components/MapCanvas.tsx.
// This module is loaded client-side only (next/dynamic with ssr:false), so Leaflet
// can be imported statically. Google Maps JS is used when a browser key is configured;
// Leaflet (OSM demo tiles) is the graceful fallback.

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Coordinates, Place } from '@/lib/curiosity/types';

export interface MapCanvasProps {
  center: Coordinates;
  selected: Place | null;
  pins: Place[];
  userLocation: Coordinates | null;
  onSelect: (position: Coordinates, wikiId?: string, googleId?: string) => void;
  onViewport: (position: Coordinates) => void;
}

const TILE_URL = process.env.NEXT_PUBLIC_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION = process.env.NEXT_PUBLIC_TILE_ATTRIBUTION || '© OpenStreetMap contributors';
const BROWSER_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY || '';

const centerKey = (p: Coordinates) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;

const pinIcon = (selected: boolean, demo: boolean) => L.divIcon({
  className: 'custom-map-marker', iconSize: [42, 48], iconAnchor: [21, 44],
  html: `<div class="pin ${selected ? 'pin-selected' : ''} ${demo ? 'pin-demo' : ''}"><span class="pin-core">${demo ? '✧' : '✦'}</span></div>`
});

const userIcon = L.divIcon({
  className: 'custom-map-marker', iconSize: [22, 22], iconAnchor: [11, 11],
  html: '<div class="your-location"></div>'
});

function LeafletMap(props: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const propCenterRef = useRef<string>(centerKey(props.center));
  const callbacks = useRef(props);
  useEffect(() => { callbacks.current = props; });

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [callbacks.current.center.lat, callbacks.current.center.lng],
      zoom: 13, scrollWheelZoom: true, zoomControl: false, preferCanvas: true
    });
    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19 }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    map.on('click', (event: L.LeafletMouseEvent) => {
      callbacks.current.onSelect({ lat: event.latlng.lat, lng: event.latlng.lng });
    });
    map.on('moveend', () => {
      const c = map.getCenter();
      callbacks.current.onViewport({ lat: c.lat, lng: c.lng });
    });
    mapRef.current = map;
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const key = centerKey(props.center);
    if (propCenterRef.current !== key) {
      propCenterRef.current = key;
      map.flyTo([props.center.lat, props.center.lng], Math.max(map.getZoom(), 12), { duration: 0.85 });
    }
  }, [props.center.lat, props.center.lng]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = props.pins.slice(0, 18).map(place => {
      const marker = L.marker([place.lat, place.lng], {
        icon: pinIcon(props.selected?.id === place.id, place.evidence === 'demo'), title: place.name
      }).addTo(map);
      marker.on('click', () => callbacks.current.onSelect(place, place.id.startsWith('wiki-') ? place.id : undefined));
      return marker;
    });
  }, [props.pins, props.selected?.id]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    userMarkerRef.current?.remove();
    userMarkerRef.current = null;
    if (props.userLocation) {
      userMarkerRef.current = L.marker([props.userLocation.lat, props.userLocation.lng], { icon: userIcon, interactive: false }).addTo(map);
    }
  }, [props.userLocation?.lat, props.userLocation?.lng]);

  return (
    <div
      className="map-frame"
      ref={containerRef}
      role="application"
      aria-label="Interactive world map. Discoveries can also be opened from the list."
    />
  );
}

// ---- Google Maps adapter ----

type GoogleLatLngLiteral = { lat: number; lng: number };
type GoogleEvent = { latLng?: { lat: () => number; lng: () => number }; placeId?: string; stop?: () => void };
type GoogleMarker = { setMap: (map: GoogleMap | null) => void; addListener: (name: string, listener: () => void) => void };
type GoogleMap = {
  panTo: (p: GoogleLatLngLiteral) => void;
  addListener: (event: string, callback: (evt: GoogleEvent) => void) => void;
  getCenter: () => { lat: () => number; lng: () => number } | null;
};

type GoogleWindow = Window & {
  google?: { maps: { Map: new (element: HTMLElement, options: Record<string, unknown>) => GoogleMap; Marker: new (options: Record<string, unknown>) => GoogleMarker } };
  gm_authFailure?: () => void;
};

let googleMapsLoader: Promise<NonNullable<GoogleWindow['google']>> | null = null;

let restoreConsole: (() => void) | null = null;

// Google's JS API reports auth/billing problems (e.g. BillingNotEnabledMapError) only via
// console.error; there is no callback for billing issues. Watch for it and fall back to Leaflet.
function watchMapsConsoleErrors(onError: () => void) {
  restoreConsole?.();
  const original = console.error;
  console.error = (...args: unknown[]) => {
    const text = args.map(a => String(a)).join(' ');
    if (text.includes('Google Maps JavaScript API error')) {
      restoreConsole?.();
      console.warn(`[curiosity] Google Maps unavailable (${text.slice(text.indexOf('error:') + 7, text.indexOf('error:') + 60).trim()}). Using OpenStreetMap tiles instead.`);
      onError();
      return;
    }
    original(...args);
  };
  restoreConsole = () => { console.error = original; restoreConsole = null; };
}

function loadGoogleMaps(key: string): Promise<NonNullable<GoogleWindow['google']>> {
  if (typeof window !== 'undefined' && (window as GoogleWindow).google?.maps) {
    return Promise.resolve((window as GoogleWindow).google!);
  }
  if (googleMapsLoader) return googleMapsLoader;
  googleMapsLoader = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly`;
    script.async = true;
    script.onload = () => {
      const google = (window as GoogleWindow).google;
      if (google?.maps) resolve(google);
      else { googleMapsLoader = null; reject(new Error('Google Maps unavailable')); }
    };
    script.onerror = () => { googleMapsLoader = null; reject(new Error('Failed to load Google Maps')); };
    document.head.append(script);
  });
  return googleMapsLoader;
}

function GoogleMapView(props: MapCanvasProps & { onFailure: () => void }) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GoogleMap | null>(null);
  const markersRef = useRef<GoogleMarker[]>([]);
  const callbackRef = useRef(props);
  const failureRef = useRef(props.onFailure);
  useEffect(() => { callbackRef.current = props; failureRef.current = props.onFailure; });

  useEffect(() => {
    if (!BROWSER_KEY || !container.current) { failureRef.current(); return; }
    let disposed = false;
    const fail = () => { if (!disposed) failureRef.current(); };
    (window as GoogleWindow).gm_authFailure = fail;
    watchMapsConsoleErrors(fail);
    loadGoogleMaps(BROWSER_KEY).then(google => {
      if (disposed || !container.current || mapRef.current) return;
      const map = new google.maps.Map(container.current, {
        center: callbackRef.current.center, zoom: 13, disableDefaultUI: true, zoomControl: true,
        gestureHandling: 'greedy', clickableIcons: true, mapTypeControl: false, streetViewControl: false
      });
      mapRef.current = map;
      map.addListener('click', evt => {
        if (!evt.latLng) return;
        if (evt.placeId) evt.stop?.();
        callbackRef.current.onSelect({ lat: evt.latLng.lat(), lng: evt.latLng.lng() }, undefined, evt.placeId);
      });
      map.addListener('idle', () => {
        const c = map.getCenter();
        if (c) callbackRef.current.onViewport({ lat: c.lat(), lng: c.lng() });
      });
      // Draw markers for the current pin set once the map exists.
      markersRef.current = callbackRef.current.pins.slice(0, 18).map(place => {
        const marker = new google.maps.Marker({ map, position: { lat: place.lat, lng: place.lng }, title: place.name });
        marker.addListener('click', () => callbackRef.current.onSelect(place, place.id.startsWith('wiki-') ? place.id : undefined));
        return marker;
      });
    }).catch(() => { if (!disposed) failureRef.current(); });
    return () => { disposed = true; markersRef.current.forEach(marker => marker.setMap(null)); markersRef.current = []; restoreConsole?.(); };
  }, []);

  useEffect(() => { mapRef.current?.panTo(props.center); }, [props.center.lat, props.center.lng]);

  useEffect(() => {
    const map = mapRef.current;
    const google = (window as GoogleWindow).google;
    if (!map || !google) return;
    markersRef.current.forEach(marker => marker.setMap(null));
    markersRef.current = props.pins.slice(0, 18).map(place => {
      const marker = new google.maps.Marker({ map, position: { lat: place.lat, lng: place.lng }, title: place.name });
      marker.addListener('click', () => callbackRef.current.onSelect(place, place.id.startsWith('wiki-') ? place.id : undefined));
      return marker;
    });
  }, [props.pins]);

  return (
    <div
      className="map-frame"
      ref={container}
      role="application"
      aria-label="Interactive Google map. Discoveries can also be opened from the list."
    />
  );
}

export function MapCanvas(props: MapCanvasProps) {
  const [failed, setFailed] = useState(false);
  if (BROWSER_KEY && !failed) return <GoogleMapView {...props} onFailure={() => setFailed(true)} />;
  return <LeafletMap {...props} />;
}

export default MapCanvas;
