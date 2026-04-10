/** Shared utilities and constants for inline comments */

// ─── Shared Constants ────────────────────────────────────────────
export const FIREBASE_CDN = 'https://www.gstatic.com/firebasejs/10.11.1';
export const HIGHLIGHT_CLASS = 'inline-comment-hl';
export const EXCLUDED_SELECTORS = 'pre, code, .highlight, .code-block';
export const CARD_CLASS = 'ic-card';
export const CARD_FOCUSED_CLASS = 'ic-card--focused';

/** Check if a node is inside an excluded element (code blocks, etc.) */
export function isInsideExcluded(node: Node): boolean {
    let current: Node | null = node;
    while (current) {
        if (current instanceof HTMLElement && current.matches(EXCLUDED_SELECTORS)) {
            return true;
        }
        current = current.parentNode;
    }
    return false;
}

/** Format a Firestore timestamp as relative time */
export function timeAgo(timestamp: unknown): string {
    if (!timestamp) return '';
    // Firestore Timestamp has .toDate(), plain Date works directly
    const date = typeof (timestamp as { toDate?: () => Date }).toDate === 'function'
        ? (timestamp as { toDate: () => Date }).toDate()
        : new Date(timestamp as string | number);

    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return date.toLocaleDateString();
}

/** Truncate text with ellipsis */
export function truncate(str: string, maxLen: number): string {
    return str.length > maxLen ? str.substring(0, maxLen) + '\u2026' : str;
}

/** Deterministic avatar gradient from UID */
const GRADIENTS = [
    'linear-gradient(135deg, #5bb5a2, #4a90d9)',
    'linear-gradient(135deg, #e8915b, #e06b8f)',
    'linear-gradient(135deg, #8b7de8, #5bb5a2)',
    'linear-gradient(135deg, #4a90d9, #8b7de8)',
    'linear-gradient(135deg, #e06b8f, #f7c948)',
    'linear-gradient(135deg, #34c182, #4a90d9)',
    'linear-gradient(135deg, #f7c948, #e8915b)',
    'linear-gradient(135deg, #5bb5a2, #8b7de8)',
];

export function avatarGradient(uid: string): string {
    let hash = 0;
    for (let i = 0; i < uid.length; i++) {
        hash = ((hash << 5) - hash + uid.charCodeAt(i)) | 0;
    }
    return GRADIENTS[Math.abs(hash) % GRADIENTS.length]!;
}

/** Get initials from display name (max 2 chars) */
export function initials(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
        return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
}

/** Create a DOM element with optional class and attributes */
export function el(
    tag: string,
    className?: string,
    attrs?: Record<string, string>,
): HTMLElement {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (attrs) {
        for (const [key, value] of Object.entries(attrs)) {
            element.setAttribute(key, value);
        }
    }
    return element;
}

/** Create a text node */
export function text(content: string): Text {
    return document.createTextNode(content);
}

/** Rate limit: returns true if action is allowed */
const rateLimits = new Map<string, number>();
export function rateLimit(key: string, intervalMs: number): boolean {
    const last = rateLimits.get(key) ?? 0;
    if (Date.now() - last < intervalMs) return false;
    rateLimits.set(key, Date.now());
    return true;
}

// ─── Panel Minimized State (localStorage, persists across sessions) ──
const MINIMIZED_KEY = 'ic-panel-minimized';

export function getMinimizedState(): boolean {
    try {
        return localStorage.getItem(MINIMIZED_KEY) === 'true';
    } catch { return false; }
}

export function setMinimizedState(val: boolean): void {
    try {
        localStorage.setItem(MINIMIZED_KEY, String(val));
    } catch { /* unavailable */ }
}

// ─── Comments Cache (sessionStorage, stale-while-revalidate) ────
const CACHE_PREFIX = 'ic-cache-';

/** Serialize Firestore Timestamps to epoch ms for JSON storage */
function serializeTimestamp(ts: unknown): number {
    if (!ts) return 0;
    if (typeof (ts as { toDate?: () => Date }).toDate === 'function') {
        return (ts as { toDate: () => Date }).toDate().getTime();
    }
    return typeof ts === 'number' ? ts : new Date(ts as string).getTime();
}

export function getCachedComments(slug: string): unknown[] | null {
    try {
        const raw = sessionStorage.getItem(CACHE_PREFIX + slug);
        if (!raw) return null;
        return JSON.parse(raw) as unknown[];
    } catch { return null; }
}

export function setCachedComments(slug: string, comments: unknown[]): void {
    try {
        // Don't cache if any reply has a pending ID
        const hasPending = (comments as Array<{ replies: Array<{ id: string }> }>)
            .some(c => c.replies?.some(r => r.id === '__pending__'));
        if (hasPending) return;

        // Serialize timestamps for JSON round-trip
        const serialized = JSON.parse(JSON.stringify(comments, (_key, val) => {
            if (val && typeof val === 'object' && typeof val.toDate === 'function') {
                return serializeTimestamp(val);
            }
            return val;
        }));
        sessionStorage.setItem(CACHE_PREFIX + slug, JSON.stringify(serialized));
    } catch { /* quota exceeded or unavailable */ }
}
