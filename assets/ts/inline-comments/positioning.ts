/**
 * Scroll-Synced Absolute Positioning
 *
 * Positions comment cards at the same Y-offset as their highlighted text.
 * Uses requestAnimationFrame for smooth scroll tracking, caches highlight
 * positions, and resolves collisions when cards overlap.
 */

import { HIGHLIGHT_CLASS, CARD_CLASS, CARD_FOCUSED_CLASS } from './utils';

const MIN_GAP = 10;
const TRANSITION = 'top 0.4s cubic-bezier(0.25, 0.1, 0.25, 1)';

/** Cached highlight Y-positions (invalidated on resize/content change) */
const highlightCache = new Map<string, number>();
let cacheValid = false;

let panelBody: HTMLElement | null = null;
let articleArea: HTMLElement | null = null;
let rafId: number | null = null;
let resizeTimer: number | null = null;
let observers: ResizeObserver | null = null;
let lerpTarget = 0;
let lerpCurrent = 0;
let isLerping = false;

/**
 * Initialize positioning system.
 * @param panel - The .ic-panel-body element (scrollable, position: relative)
 * @param article - The scrollable article area
 */
export function initPositioning(panel: HTMLElement, article: HTMLElement): () => void {
    panelBody = panel;
    articleArea = article;

    // Set up scroll listener on article
    article.addEventListener('scroll', onArticleScroll);

    // Debounced resize handler
    window.addEventListener('resize', onResize);

    // ResizeObserver for dynamic card height changes — deduplicated
    let resizeDirty = false;
    observers = new ResizeObserver(() => {
        if (!resizeDirty) {
            resizeDirty = true;
            requestAnimationFrame(() => { resizeDirty = false; positionCards(); });
        }
    });

    // Initial positioning
    requestAnimationFrame(() => {
        requestAnimationFrame(positionCards);
    });

    // Cleanup
    return () => {
        article.removeEventListener('scroll', onArticleScroll);
        window.removeEventListener('resize', onResize);
        if (rafId !== null) cancelAnimationFrame(rafId);
        if (resizeTimer !== null) clearTimeout(resizeTimer);
        observers?.disconnect();
        observers = null;
        panelBody = null;
        articleArea = null;
    };
}

/** Call after comments are re-rendered to reposition and observe new cards */
export function repositionCards(): void {
    invalidateCache();
    requestAnimationFrame(() => {
        positionCards();
        observeCards();
    });
}

/** Invalidate the highlight position cache */
export function invalidateCache(): void {
    cacheValid = false;
    highlightCache.clear();
}

// ─── Core Positioning ────────────────────────────────────────────

function positionCards(): void {
    if (!panelBody || !articleArea) return;

    const panelRect = panelBody.getBoundingClientRect();
    const cards = panelBody.querySelectorAll<HTMLElement>(`.${CARD_CLASS}`);
    if (cards.length === 0) return;

    // Refresh cache if invalid
    if (!cacheValid) {
        refreshHighlightCache();
    }

    // Build position list: { element, targetTop }
    type CardPos = { el: HTMLElement; targetTop: number; height: number };
    const positions: CardPos[] = [];

    // Sort cards by their highlight Y-position (top of page = first)
    const sortedCards = Array.from(cards).sort((a, b) => {
        const aTop = getHighlightTop(a.dataset.commentId ?? '');
        const bTop = getHighlightTop(b.dataset.commentId ?? '');
        return aTop - bTop;
    });

    for (const card of sortedCards) {
        const commentId = card.dataset.commentId ?? '';
        let targetTop = getHighlightTop(commentId);

        // Convert from viewport-relative to panel-relative
        targetTop = targetTop - panelRect.top + panelBody.scrollTop;

        // Collision resolution: push down if overlapping previous card
        if (positions.length > 0) {
            const prev = positions[positions.length - 1]!;
            const prevBottom = prev.targetTop + prev.height;
            if (targetTop < prevBottom + MIN_GAP) {
                targetTop = prevBottom + MIN_GAP;
            }
        }

        targetTop = Math.max(0, targetTop);

        // Apply position with transition
        card.style.position = 'absolute';
        card.style.left = '0';
        card.style.right = '0';
        card.style.transition = TRANSITION;
        card.style.top = `${targetTop}px`;

        positions.push({
            el: card,
            targetTop,
            height: card.offsetHeight,
        });
    }

    // Set panel min-height to contain all cards
    if (positions.length > 0) {
        const last = positions[positions.length - 1]!;
        panelBody.style.minHeight = `${last.targetTop + last.height + 20}px`;
    }

    // Also position the composer if visible
    positionComposer();
}

function positionComposer(): void {
    if (!panelBody) return;
    const composer = panelBody.querySelector<HTMLElement>('.ic-composer');
    if (!composer || composer.style.display === 'none') return;

    // Composer goes at the top (above all cards)
    composer.style.position = 'absolute';
    composer.style.left = '0';
    composer.style.right = '0';
    composer.style.top = '0';
    composer.style.zIndex = '10';
    composer.style.transition = TRANSITION;
}

// ─── Highlight Cache ─────────────────────────────────────────────

function refreshHighlightCache(): void {
    highlightCache.clear();
    const marks = document.querySelectorAll<HTMLElement>(`mark.${HIGHLIGHT_CLASS}`);
    for (const mark of marks) {
        const commentId = mark.dataset.commentId;
        if (!commentId || highlightCache.has(commentId)) continue;
        highlightCache.set(commentId, mark.getBoundingClientRect().top);
    }
    cacheValid = true;
}

function getHighlightTop(commentId: string): number {
    // Use cached value if available
    const cached = highlightCache.get(commentId);
    if (cached !== undefined) return cached;

    // Fallback: query the DOM (for orphaned comments, put at bottom)
    const mark = document.querySelector<HTMLElement>(`mark.${HIGHLIGHT_CLASS}[data-comment-id="${commentId}"]`);
    if (mark) {
        const top = mark.getBoundingClientRect().top;
        highlightCache.set(commentId, top);
        return top;
    }

    // Orphaned: position at the bottom of the panel
    return panelBody ? panelBody.scrollHeight : 9999;
}

// ─── Scroll Sync ─────────────────────────────────────────────────

function onArticleScroll(): void {
    // Invalidate cache on scroll (viewport-relative positions change)
    cacheValid = false;

    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
        positionCards();
        syncPanelScroll();
    });
}

/** Lerped panel scroll — smooth follow instead of snap */
function syncPanelScroll(): void {
    if (!panelBody || !articleArea) return;

    // Find the focused card or the card nearest to viewport center
    const focusedCard = panelBody.querySelector<HTMLElement>(`.${CARD_FOCUSED_CLASS}`);
    if (focusedCard) {
        const cardTop = parseFloat(focusedCard.style.top) || 0;
        const panelHeight = panelBody.clientHeight;
        // Scroll so focused card is roughly centered
        lerpTarget = Math.max(0, cardTop - panelHeight / 3);
    } else {
        // No focused card: sync proportionally
        const scrollRatio = articleArea.scrollTop / (articleArea.scrollHeight - articleArea.clientHeight || 1);
        const panelMaxScroll = panelBody.scrollHeight - panelBody.clientHeight;
        lerpTarget = scrollRatio * panelMaxScroll;
    }

    if (!isLerping) {
        isLerping = true;
        lerpCurrent = panelBody.scrollTop;
        requestAnimationFrame(lerpStep);
    }
}

function lerpStep(): void {
    if (!panelBody) { isLerping = false; return; }

    const diff = lerpTarget - lerpCurrent;
    if (Math.abs(diff) < 0.5) {
        lerpCurrent = lerpTarget;
        panelBody.scrollTop = lerpCurrent;
        isLerping = false;
        return;
    }

    // Ease factor: lower = smoother/slower
    lerpCurrent += diff * 0.12;
    panelBody.scrollTop = lerpCurrent;
    requestAnimationFrame(lerpStep);
}

// ─── Resize Handling ─────────────────────────────────────────────

function onResize(): void {
    if (resizeTimer !== null) clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
        invalidateCache();
        positionCards();
    }, 150) as unknown as number;
}

// ─── Card Observation ────────────────────────────────────────────

function observeCards(): void {
    if (!observers || !panelBody) return;
    observers.disconnect();

    const cards = panelBody.querySelectorAll<HTMLElement>(`.${CARD_CLASS}`);
    for (const card of cards) {
        observers.observe(card);
    }
}
