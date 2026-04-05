/**
 * Visitor Map Renderer
 * Fetches country visitor counts from Firestore and renders dots on the SVG world map.
 */

/** Country center coordinates in equirectangular projection (x = lon+180, y = 90-lat) */
const COORDS: Record<string, [number, number]> = {
    // North America
    US: [263, 52], CA: [260, 30], MX: [258, 67],
    // Central America & Caribbean
    GT: [269, 75], CR: [276, 80], PA: [280, 81], CU: [281, 68], JM: [283, 72],
    // South America
    BR: [307, 100], AR: [296, 126], CL: [289, 124], CO: [286, 86], PE: [284, 100],
    VE: [293, 82], EC: [281, 88], UY: [304, 125], PY: [302, 117], BO: [295, 108],
    // Europe
    GB: [179, 38], DE: [190, 39], FR: [182, 43], ES: [176, 50], IT: [192, 47],
    NL: [185, 38], BE: [184, 39], SE: [195, 28], NO: [190, 28], FI: [205, 26],
    PL: [199, 38], CH: [188, 43], AT: [194, 43], PT: [171, 50], IE: [172, 37],
    DK: [190, 34], CZ: [195, 40], RO: [205, 44], HU: [199, 43], GR: [204, 52],
    UA: [210, 39], RU: [220, 30],
    // Middle East
    TR: [215, 51], SA: [225, 65], AE: [234, 65], IL: [215, 58], IR: [232, 57],
    IQ: [224, 57], JO: [216, 58],
    // Africa
    ZA: [206, 120], NG: [188, 80], EG: [211, 63], KE: [218, 89], MA: [174, 58],
    GH: [180, 82], TZ: [215, 96], ET: [219, 82], DZ: [183, 62], TN: [189, 56],
    // South Asia
    IN: [259, 70], PK: [249, 60], BD: [270, 66], LK: [261, 83], NP: [264, 62],
    // East Asia
    CN: [284, 55], JP: [320, 54], KR: [307, 53], TW: [301, 66], HK: [294, 68],
    MN: [284, 43],
    // Southeast Asia
    SG: [284, 89], MY: [281, 86], TH: [281, 75], VN: [286, 74], ID: [297, 92],
    PH: [301, 77], MM: [276, 70], KH: [285, 78],
    // Oceania
    AU: [313, 118], NZ: [355, 138],
};

// --- Cache ---
const MAP_CACHE_KEY = 'visitor-geo-map';
const MAP_CACHE_TTL = 20 * 60 * 1000; // 20 minutes

interface MapCache {
    data: Record<string, number>;
    ts: number;
}

function getCachedMap(): Record<string, number> | null {
    try {
        const raw = localStorage.getItem(MAP_CACHE_KEY);
        if (!raw) return null;
        const entry: MapCache = JSON.parse(raw);
        if (Date.now() - entry.ts > MAP_CACHE_TTL) {
            localStorage.removeItem(MAP_CACHE_KEY);
            return null;
        }
        return entry.data;
    } catch { return null; }
}

function setCachedMap(data: Record<string, number>): void {
    try {
        localStorage.setItem(MAP_CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
    } catch { /* ignore */ }
}

// --- Rendering ---

/**
 * Map a visitor count to a dot radius (log scale, clamped)
 */
function countToRadius(count: number, maxCount: number): number {
    if (count <= 0) return 0;
    const minR = 2;
    const maxR = 7;
    const logScale = Math.log(count + 1) / Math.log(maxCount + 1);
    return minR + logScale * (maxR - minR);
}

/**
 * Map a visitor count to an opacity (higher count = more opaque)
 */
function countToOpacity(count: number, maxCount: number): number {
    const min = 0.4;
    const max = 1.0;
    const logScale = Math.log(count + 1) / Math.log(maxCount + 1);
    return min + logScale * (max - min);
}

/**
 * Render dots on the SVG map
 */
function renderDots(data: Record<string, number>): void {
    const dotsGroup = document.getElementById('geo-dots');
    const summaryCount = document.getElementById('geo-country-count');
    if (!dotsGroup) return;

    // Clear existing dots
    dotsGroup.innerHTML = '';

    const entries = Object.entries(data).filter(([cc]) => COORDS[cc]);
    if (entries.length === 0) return;

    const maxCount = Math.max(...entries.map(([, c]) => c));

    const svgNS = 'http://www.w3.org/2000/svg';
    for (const [cc, count] of entries) {
        const coord = COORDS[cc];
        if (!coord) continue;

        const circle = document.createElementNS(svgNS, 'circle');
        circle.setAttribute('cx', String(coord[0]));
        circle.setAttribute('cy', String(coord[1]));
        circle.setAttribute('r', String(countToRadius(count, maxCount)));
        circle.setAttribute('opacity', String(countToOpacity(count, maxCount)));
        circle.setAttribute('data-country', cc);
        circle.setAttribute('data-count', String(count));
        circle.classList.add('visitor-map__dot');
        dotsGroup.appendChild(circle);
    }

    // Update summary
    if (summaryCount) {
        summaryCount.textContent = String(entries.length);
    }

    // Tooltip on hover
    setupTooltips();
}

/**
 * Add hover tooltips to dots
 */
function setupTooltips(): void {
    const tooltip = document.getElementById('geo-tooltip');
    if (!tooltip) return;

    const dots = document.querySelectorAll('.visitor-map__dot');
    dots.forEach(dot => {
        dot.addEventListener('mouseenter', (e) => {
            const el = e.target as SVGCircleElement;
            const cc = el.getAttribute('data-country') || '';
            const count = el.getAttribute('data-count') || '0';
            tooltip.textContent = `${cc}: ${Number(count).toLocaleString()}`;
            tooltip.classList.add('visible');
        });
        dot.addEventListener('mouseleave', () => {
            tooltip.classList.remove('visible');
        });
    });
}

// --- Init ---

async function init(): Promise<void> {
    const container = document.getElementById('visitor-map');
    if (!container) return;

    // Only run in production
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') return;

    // Check cache first
    const cached = getCachedMap();
    if (cached) {
        renderDots(cached);
        return;
    }

    // Fetch from Firestore
    try {
        const { doc, getDoc } = await import(
            'https://www.gstatic.com/firebasejs/10.11.1/firebase-firestore.js'
        );

        // Wait for Firestore to be available
        let attempts = 0;
        while (!window.firestoreDb && attempts < 20) {
            await new Promise(r => setTimeout(r, 100));
            attempts++;
        }
        if (!window.firestoreDb) return;

        const snapshot = await getDoc(doc(window.firestoreDb, 'visitor_geo', 'summary'));
        if (!snapshot.exists()) return;

        const data = snapshot.data() as Record<string, number>;
        setCachedMap(data);
        renderDots(data);
    } catch {
        // Firestore read failed — map stays empty
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => init());
} else {
    init();
}
