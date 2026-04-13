/**
 * Selection Detection + Popup
 *
 * Listens for text selection on .article-content, shows an "Add comment"
 * popup above the selection. Captures anchor data at selection time
 * (not click time) to avoid losing the selection.
 */

import { isInsideExcluded } from './utils';
import type { Anchor } from './types';

export interface CapturedSelection {
    quotedText: string;
    anchor: Anchor;
    selectionTop: number; // viewport-relative Y for positioning composer beside selection
}

type SelectionCallback = (captured: CapturedSelection) => void;

let popup: HTMLElement | null = null;
let onAddComment: SelectionCallback | null = null;
let pendingCapture: CapturedSelection | null = null;

const CONTEXT_LENGTH = 30;

/** Create the popup element (once) */
function createPopup(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'inline-comment-popup';
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', 'Add comment');

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '14');
    svg.setAttribute('height', '14');
    svg.setAttribute('fill', 'currentColor');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z');
    svg.appendChild(path);
    el.appendChild(svg);

    const text = document.createElement('span');
    text.textContent = 'Add comment';
    el.appendChild(text);

    el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
    });

    // Prevent touch from dismissing popup or losing selection
    el.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
    }, { passive: false } as AddEventListenerOptions);

    el.addEventListener('touchend', (e) => {
        e.preventDefault();
        e.stopPropagation();
        hidePopup();
        if (pendingCapture && onAddComment) {
            onAddComment(pendingCapture);
        }
        pendingCapture = null;
    }, { passive: false } as AddEventListenerOptions);

    el.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        hidePopup();
        // Use the pre-captured selection data (captured when popup appeared)
        if (pendingCapture && onAddComment) {
            onAddComment(pendingCapture);
        }
        pendingCapture = null;
    });

    el.style.display = 'none';
    document.body.appendChild(el);
    return el;
}

/** Show the popup near the current selection */
function showPopup(rect: DOMRect): void {
    if (!popup) popup = createPopup();

    // Measure dimensions while invisible (no flash)
    popup.style.position = 'fixed';
    popup.style.visibility = 'hidden';
    popup.style.display = 'flex';
    popup.style.zIndex = '1000';

    const popupRect = popup.getBoundingClientRect();
    const left = rect.left + rect.width / 2 - popupRect.width / 2;

    // On mobile, position ABOVE selection to avoid OS selection handles
    const isMobile = window.innerWidth <= 1023;
    const top = isMobile
        ? rect.top - popupRect.height - 8
        : rect.bottom + 8;

    popup.style.left = `${Math.max(8, left)}px`;
    popup.style.top = `${Math.max(8, top)}px`;
    popup.style.visibility = 'visible';
}

function hidePopup(): void {
    if (popup) popup.style.display = 'none';
}

/** Capture selection data from the current browser selection */
function captureFromSelection(articleEl: HTMLElement): CapturedSelection | null {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return null;

    const quotedText = sel.toString().trim();
    if (!quotedText) return null;

    const fullText = articleEl.textContent ?? '';
    const idx = fullText.indexOf(quotedText);
    const prefix = idx > 0 ? fullText.substring(Math.max(0, idx - CONTEXT_LENGTH), idx) : '';
    const suffix = idx >= 0
        ? fullText.substring(idx + quotedText.length, idx + quotedText.length + CONTEXT_LENGTH)
        : '';

    return {
        quotedText,
        anchor: { prefix, suffix },
        selectionTop: 0, // placeholder — set by handleMouseUp after capture
    };
}

/**
 * Initialize selection detection on the article content area.
 * The callback receives pre-captured selection data (captured when popup appears,
 * not when button is clicked — avoids losing selection to click events or sign-in popups).
 */
export function initSelection(
    articleEl: HTMLElement,
    onSelect: SelectionCallback,
): () => void {
    onAddComment = onSelect;

    function handleMouseUp(): void {
        setTimeout(() => {
            const sel = window.getSelection();
            if (!sel || sel.isCollapsed || !sel.toString().trim()) {
                hidePopup();
                pendingCapture = null;
                return;
            }

            const range = sel.getRangeAt(0);

            if (!articleEl.contains(range.commonAncestorContainer)) {
                hidePopup();
                pendingCapture = null;
                return;
            }

            if (isInsideExcluded(range.startContainer) || isInsideExcluded(range.endContainer)) {
                hidePopup();
                pendingCapture = null;
                return;
            }

            // Capture selection data NOW while selection is guaranteed valid
            pendingCapture = captureFromSelection(articleEl);
            if (!pendingCapture) {
                hidePopup();
                return;
            }

            const rect = range.getBoundingClientRect();
            pendingCapture.selectionTop = rect.top;
            showPopup(rect);
        }, 10);
    }

    function handleMouseDown(e: MouseEvent): void {
        if (popup && popup.contains(e.target as Node)) return;
        if ((e.target as HTMLElement).closest?.('#inline-comments-root')) return;
        hidePopup();
        pendingCapture = null;
    }

    // Touch: detect selection after long-press on mobile
    function handleTouchEnd(): void {
        // Same logic as handleMouseUp — delay to let selection settle
        setTimeout(() => {
            const sel = window.getSelection();
            if (!sel || sel.isCollapsed || !sel.toString().trim()) {
                hidePopup();
                pendingCapture = null;
                return;
            }

            const range = sel.getRangeAt(0);
            if (!articleEl.contains(range.commonAncestorContainer)) {
                hidePopup();
                pendingCapture = null;
                return;
            }

            if (isInsideExcluded(range.startContainer) || isInsideExcluded(range.endContainer)) {
                hidePopup();
                pendingCapture = null;
                return;
            }

            pendingCapture = captureFromSelection(articleEl);
            if (!pendingCapture) { hidePopup(); return; }

            const rect = range.getBoundingClientRect();
            pendingCapture.selectionTop = rect.top;
            showPopup(rect);
        }, 10);
    }

    function handleTouchStart(e: TouchEvent): void {
        if (popup && popup.contains(e.target as Node)) return;
        if ((e.target as HTMLElement).closest?.('#inline-comments-root')) return;
        if ((e.target as HTMLElement).closest?.('.ic-mobile-overlay')) return;
        hidePopup();
        pendingCapture = null;
    }

    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('touchend', handleTouchEnd, { passive: true } as AddEventListenerOptions);
    document.addEventListener('touchstart', handleTouchStart, { passive: true } as AddEventListenerOptions);

    return () => {
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('mousedown', handleMouseDown);
        document.removeEventListener('touchend', handleTouchEnd);
        document.removeEventListener('touchstart', handleTouchStart);
        hidePopup();
        if (popup) {
            popup.remove();
            popup = null;
        }
        onAddComment = null;
        pendingCapture = null;
    };
}
