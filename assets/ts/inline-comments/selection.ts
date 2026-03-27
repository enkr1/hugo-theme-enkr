/**
 * Selection Detection + Popup
 *
 * Listens for text selection on .article-content, shows an "Add comment"
 * popup above the selection. Excludes code blocks from commentable regions.
 */

import { isInsideExcluded } from './utils';

type SelectionCallback = () => void;

let popup: HTMLElement | null = null;
let onAddComment: SelectionCallback | null = null;

/** Create the popup element (once) */
function createPopup(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'inline-comment-popup';
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', 'Add comment');

    // Comment icon
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
        e.preventDefault(); // Prevent selection from clearing
        e.stopPropagation();
    });

    el.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        hidePopup();
        onAddComment?.();
    });

    // Hidden by default
    el.style.display = 'none';
    document.body.appendChild(el);
    return el;
}

/** Show the popup above the current selection */
function showPopup(rect: DOMRect): void {
    if (!popup) popup = createPopup();

    popup.style.display = 'flex';

    // Position above the selection, centered horizontally
    const popupWidth = popup.offsetWidth;
    const left = rect.left + rect.width / 2 - popupWidth / 2;
    const top = rect.top - 40 + window.scrollY;

    popup.style.position = 'absolute';
    popup.style.left = `${Math.max(8, left)}px`;
    popup.style.top = `${Math.max(8, top)}px`;
    popup.style.zIndex = '1000';
}

/** Hide the popup */
function hidePopup(): void {
    if (popup) popup.style.display = 'none';
}

/**
 * Initialize selection detection on the article content area.
 *
 * @param articleEl - The .article-content element to watch
 * @param onSelect - Called when user clicks "Add comment" on a valid selection
 * @returns Cleanup function to remove listeners
 */
export function initSelection(
    articleEl: HTMLElement,
    onSelect: SelectionCallback,
): () => void {
    onAddComment = onSelect;

    function handleMouseUp(): void {
        // Small delay so browser finalizes the selection
        setTimeout(() => {
            const sel = window.getSelection();
            if (!sel || sel.isCollapsed || !sel.toString().trim()) {
                hidePopup();
                return;
            }

            const range = sel.getRangeAt(0);

            // Selection must be within the article
            if (!articleEl.contains(range.commonAncestorContainer)) {
                hidePopup();
                return;
            }

            // Selection must not be inside excluded elements
            if (isInsideExcluded(range.startContainer) || isInsideExcluded(range.endContainer)) {
                hidePopup();
                return;
            }

            const rect = range.getBoundingClientRect();
            showPopup(rect);
        }, 10);
    }

    function handleMouseDown(e: MouseEvent): void {
        // Don't hide if clicking the popup itself
        if (popup && popup.contains(e.target as Node)) return;
        // Don't hide if clicking inside the comment panel
        if ((e.target as HTMLElement).closest?.('#inline-comments-root')) return;
        hidePopup();
    }

    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mousedown', handleMouseDown);

    // Cleanup
    return () => {
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('mousedown', handleMouseDown);
        hidePopup();
        if (popup) {
            popup.remove();
            popup = null;
        }
        onAddComment = null;
    };
}
