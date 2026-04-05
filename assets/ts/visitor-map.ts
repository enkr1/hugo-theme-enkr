/**
 * Visitor Globe — Cobe 3D Globe
 * Renders an interactive 3D globe on /visitors/ with markers at visitor locations.
 * Data fetched from Firestore: visitor_geo/summary (counts) + visitor_geo/coords (lat/lng).
 */

// --- Types ---

declare global {
    interface Window {
        firestoreDb?: unknown;
    }
}

interface GeoData {
    summary: Record<string, number>;
    coords: Record<string, { lat: number; lng: number }>;
}

interface CacheEntry {
    data: GeoData;
    ts: number;
}

interface CobeState {
    phi: number;
    theta: number;
    width: number;
    height: number;
}

// --- Cache ---

const CACHE_KEY = 'visitor-geo-globe';
const CACHE_TTL = 20 * 60 * 1000; // 20 minutes

function getCached(): GeoData | null {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const entry: CacheEntry = JSON.parse(raw);
        if (Date.now() - entry.ts > CACHE_TTL) {
            localStorage.removeItem(CACHE_KEY);
            return null;
        }
        return entry.data;
    } catch {
        return null;
    }
}

function setCache(data: GeoData): void {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
    } catch { /* ignore */ }
}

// --- Helpers ---

function countToSize(count: number, maxCount: number): number {
    const minSize = 0.03;
    const maxSize = 0.15;
    const logScale = Math.log(count + 1) / Math.log(maxCount + 1);
    return minSize + logScale * (maxSize - minSize);
}

function countryToFlag(cc: string): string {
    if (!/^[A-Z]{2}$/.test(cc)) return '';
    return [...cc].map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)).join('');
}

function validCountryCode(cc: string): boolean {
    return /^[A-Z]{2}$/.test(cc);
}

// --- Data fetching ---

async function waitForFirestore(): Promise<unknown> {
    let attempts = 0;
    while (!window.firestoreDb && attempts < 20) {
        await new Promise(r => setTimeout(r, 100));
        attempts++;
    }
    return window.firestoreDb;
}

function getDevData(): GeoData {
    return {
        summary: { SG: 45, US: 120, CN: 30, IN: 15, GB: 8, DE: 5, JP: 12, AU: 3, BR: 7, KR: 10 },
        coords: {
            SG: { lat: 1.35, lng: 103.82 }, US: { lat: 37.09, lng: -95.71 },
            CN: { lat: 35.86, lng: 104.19 }, IN: { lat: 20.59, lng: 78.96 },
            GB: { lat: 55.37, lng: -3.43 }, DE: { lat: 51.16, lng: 10.45 },
            JP: { lat: 36.20, lng: 138.25 }, AU: { lat: -25.27, lng: 133.77 },
            BR: { lat: -14.23, lng: -51.92 }, KR: { lat: 35.90, lng: 127.76 },
        },
    };
}

async function fetchGeoData(): Promise<GeoData | null> {
    try {
        const { doc, getDoc } = await import(
            'https://www.gstatic.com/firebasejs/10.11.1/firebase-firestore.js'
        );

        const db = await waitForFirestore();
        if (!db) return null;

        const [summarySnap, coordsSnap] = await Promise.all([
            getDoc(doc(db, 'visitor_geo', 'summary')),
            getDoc(doc(db, 'visitor_geo', 'coords')),
        ]);

        const rawSummary = summarySnap.exists() ? (summarySnap.data() as Record<string, unknown>) : {};
        const rawCoords = coordsSnap.exists() ? (coordsSnap.data() as Record<string, unknown>) : {};

        // Sanitize: only accept valid country codes with numeric counts
        const summary: Record<string, number> = {};
        for (const [key, val] of Object.entries(rawSummary)) {
            if (validCountryCode(key) && typeof val === 'number' && val > 0) {
                summary[key] = val;
            }
        }

        // Sanitize: only accept valid coords
        const coords: Record<string, { lat: number; lng: number }> = {};
        for (const [key, val] of Object.entries(rawCoords)) {
            if (validCountryCode(key) && val && typeof val === 'object') {
                const v = val as Record<string, unknown>;
                if (typeof v.lat === 'number' && typeof v.lng === 'number') {
                    coords[key] = { lat: v.lat, lng: v.lng };
                }
            }
        }

        if (Object.keys(summary).length === 0) return null;

        return { summary, coords };
    } catch {
        return null;
    }
}

// --- Globe interaction state (lives outside renderGlobe to survive destroy/recreate) ---

let phi = 0;
let theta = 0.3;
let pointerDown = false;

function setupDragOnce(canvas: HTMLCanvasElement): void {
    let pointerX = 0;
    let pointerY = 0;

    canvas.addEventListener('pointerdown', (e) => {
        pointerDown = true;
        pointerX = e.clientX;
        pointerY = e.clientY;
        canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointerup', (e) => {
        pointerDown = false;
        canvas.releasePointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointerout', () => { pointerDown = false; });
    canvas.addEventListener('pointermove', (e) => {
        if (!pointerDown) return;
        const dx = e.clientX - pointerX;
        const dy = e.clientY - pointerY;
        pointerX = e.clientX;
        pointerY = e.clientY;
        phi += dx * 0.005;
        theta = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, theta + dy * 0.005));
    });
}

// --- Globe rendering ---

async function renderGlobe(canvas: HTMLCanvasElement, data: GeoData): Promise<() => void> {
    const { default: createGlobe } = await import('https://esm.sh/cobe@0.6.3');

    const entries = Object.entries(data.summary).filter(([cc]) => data.coords[cc]);
    const maxCount = entries.length > 0 ? Math.max(...entries.map(([, c]) => c)) : 1;

    const markers = entries.map(([cc, count]) => ({
        location: [data.coords[cc]!.lat, data.coords[cc]!.lng] as [number, number],
        size: countToSize(count, maxCount),
    }));

    const width = canvas.offsetWidth * 2;

    const destroy = createGlobe(canvas, {
        devicePixelRatio: 2,
        width,
        height: width,
        phi: 0,
        theta,
        dark: 0,
        diffuse: 2,
        mapSamples: 16000,
        mapBrightness: 1.5,
        baseColor: [0.545, 0.451, 0.333],   // #8B7355 内蕴金 (Metal/Earth gold)
        markerColor: [0.94, 0.90, 0.83],    // #F0E6D3 Warm Ivory
        glowColor: [0.545, 0.451, 0.333],   // gold glow
        markers,
        onRender: (state: CobeState) => {
            state.phi = phi;
            state.theta = theta;
            if (!pointerDown) phi += 0.003;
        },
    });

    return destroy;
}

// --- Country list + stats ---

const displayNames = new Intl.DisplayNames(['en'], { type: 'region' });

function renderCountryList(data: GeoData): void {
    const listEl = document.getElementById('country-list');
    const countEl = document.getElementById('geo-country-count');
    const totalEl = document.getElementById('geo-total-views');
    if (!listEl) return;

    const entries = Object.entries(data.summary)
        .filter(([cc]) => validCountryCode(cc))
        .sort(([, a], [, b]) => b - a);

    const totalViews = entries.reduce((sum, [, c]) => sum + c, 0);

    // Stats
    if (countEl) countEl.textContent = String(entries.length);
    if (totalEl) totalEl.textContent = totalViews.toLocaleString();

    // Country list — ordered list (no innerHTML)
    listEl.textContent = '';
    for (const [cc, count] of entries) {
        const item = document.createElement('li');
        item.className = 'country-list__item';

        const flagSpan = document.createElement('span');
        flagSpan.className = 'country-list__flag';
        flagSpan.textContent = countryToFlag(cc);

        const nameSpan = document.createElement('span');
        nameSpan.className = 'country-list__name';
        try {
            nameSpan.textContent = displayNames.of(cc) || cc;
        } catch {
            nameSpan.textContent = cc;
        }

        const countSpan = document.createElement('span');
        countSpan.className = 'country-list__count';
        countSpan.textContent = count.toLocaleString();

        item.appendChild(flagSpan);
        item.appendChild(nameSpan);
        item.appendChild(countSpan);
        listEl.appendChild(item);
    }
}

// --- Init ---

async function init(): Promise<void> {
    const canvas = document.getElementById('cobe-globe') as HTMLCanvasElement | null;
    if (!canvas) return;

    const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    let data: GeoData | null = null;

    if (isDev) {
        data = getDevData();
    } else {
        data = getCached();
        if (!data) {
            data = await fetchGeoData();
            if (data) setCache(data);
        }
    }

    if (!data) return;

    renderCountryList(data);
    setupDragOnce(canvas);
    let destroy = await renderGlobe(canvas, data);

    // Pause animation when tab is hidden, resume when visible
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            destroy();
        } else {
            renderGlobe(canvas, data!).then(d => { destroy = d; });
        }
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => init());
} else {
    init();
}
