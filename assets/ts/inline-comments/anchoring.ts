/**
 * Text Anchoring — Fuzzy match + cross-element highlight wrapping.
 *
 * Finds quoted text in the article DOM and wraps it in <mark> elements.
 * Handles selections that span multiple DOM elements (the #1 bug source
 * in annotation systems) by walking text nodes individually.
 *
 * Excludes code blocks (pre, code, .highlight) from commentable regions.
 */
import type { Comment, Anchor } from './types';

const HIGHLIGHT_CLASS = 'inline-comment-hl';
const CONTEXT_LENGTH = 30;

/** Elements whose descendants should never be highlighted */
const EXCLUDED_SELECTORS = 'pre, code, .highlight, .code-block';

/**
 * Capture anchor data from the current browser Selection.
 * Call this when the user clicks "Add comment" after selecting text.
 */
export function captureAnchor(articleEl: HTMLElement): { quotedText: string; anchor: Anchor } | null {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return null;

    const range = sel.getRangeAt(0);
    if (!articleEl.contains(range.commonAncestorContainer)) return null;

    // Reject if selection is inside an excluded element
    if (isInsideExcluded(range.commonAncestorContainer)) return null;

    const quotedText = sel.toString().trim();
    if (!quotedText) return null;

    // Extract prefix/suffix context from the full article text
    const fullText = articleEl.textContent ?? '';
    const idx = fullText.indexOf(quotedText);
    const prefix = idx > 0 ? fullText.substring(Math.max(0, idx - CONTEXT_LENGTH), idx) : '';
    const suffix = idx >= 0
        ? fullText.substring(idx + quotedText.length, idx + quotedText.length + CONTEXT_LENGTH)
        : '';

    return {
        quotedText,
        anchor: { prefix, suffix },
    };
}

/**
 * Find and highlight the quoted text for a comment in the article DOM.
 * Returns true if the text was found and highlighted, false if orphaned.
 */
export function anchorComment(articleEl: HTMLElement, comment: Comment): boolean {
    // Skip if already highlighted
    if (document.querySelector(`mark.${HIGHLIGHT_CLASS}[data-comment-id="${comment.id}"]`)) {
        return true;
    }

    const range = findTextRange(articleEl, comment.quotedText, comment.anchor);
    if (!range) return false;

    highlightRange(range, comment.id);
    return true;
}

/**
 * Remove all highlights for a specific comment.
 */
export function removeHighlight(commentId: string): void {
    const marks = document.querySelectorAll(`mark.${HIGHLIGHT_CLASS}[data-comment-id="${commentId}"]`);
    for (const mark of marks) {
        const parent = mark.parentNode;
        if (!parent) continue;
        // Replace <mark> with its text content
        while (mark.firstChild) {
            parent.insertBefore(mark.firstChild, mark);
        }
        parent.removeChild(mark);
        // Normalize to merge adjacent text nodes
        parent.normalize();
    }
}

/**
 * Find the Range in the DOM that matches the quoted text.
 *
 * Strategy:
 * 1. Exact substring match in article text content
 * 2. If multiple matches, use prefix/suffix context to disambiguate
 * 3. If no match, return null (comment becomes orphaned)
 */
function findTextRange(articleEl: HTMLElement, quotedText: string, anchor: Anchor): Range | null {
    const fullText = articleEl.textContent ?? '';

    // Find all occurrences of the quoted text
    const indices: number[] = [];
    let searchFrom = 0;
    while (true) {
        const idx = fullText.indexOf(quotedText, searchFrom);
        if (idx === -1) break;
        indices.push(idx);
        searchFrom = idx + 1;
    }

    if (indices.length === 0) return null;

    // Pick the best match using prefix/suffix context
    let bestIdx = indices[0]!;
    if (indices.length > 1 && (anchor.prefix || anchor.suffix)) {
        let bestScore = -1;
        for (const idx of indices) {
            let score = 0;
            if (anchor.prefix) {
                const actualPrefix = fullText.substring(Math.max(0, idx - anchor.prefix.length), idx);
                score += commonSuffixLength(anchor.prefix, actualPrefix);
            }
            if (anchor.suffix) {
                const actualSuffix = fullText.substring(idx + quotedText.length, idx + quotedText.length + anchor.suffix.length);
                score += commonPrefixLength(anchor.suffix, actualSuffix);
            }
            if (score > bestScore) {
                bestScore = score;
                bestIdx = idx;
            }
        }
    }

    // Convert text offset to DOM Range
    return textOffsetToRange(articleEl, bestIdx, bestIdx + quotedText.length);
}

/**
 * Convert a character offset in the article's text content to a DOM Range.
 * Walks text nodes in document order to find the start and end positions.
 */
function textOffsetToRange(root: HTMLElement, startOffset: number, endOffset: number): Range | null {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let currentOffset = 0;
    let startNode: Text | null = null;
    let startNodeOffset = 0;
    let endNode: Text | null = null;
    let endNodeOffset = 0;

    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
        const len = node.textContent?.length ?? 0;

        if (!startNode && currentOffset + len > startOffset) {
            startNode = node;
            startNodeOffset = startOffset - currentOffset;
        }

        if (currentOffset + len >= endOffset) {
            endNode = node;
            endNodeOffset = endOffset - currentOffset;
            break;
        }

        currentOffset += len;
    }

    if (!startNode || !endNode) return null;

    const range = document.createRange();
    range.setStart(startNode, startNodeOffset);
    range.setEnd(endNode, endNodeOffset);
    return range;
}

/**
 * Wrap a Range in <mark> elements. Handles cross-element selections by
 * walking text nodes within the range and wrapping each individually.
 *
 * This avoids the DOMException that Range.surroundContents() throws
 * when the selection crosses element boundaries.
 */
function highlightRange(range: Range, commentId: string): void {
    // Collect all text nodes within the range
    const textNodes = getTextNodesInRange(range);

    for (const { node, startOffset, endOffset } of textNodes) {
        // Skip text nodes inside excluded elements
        if (isInsideExcluded(node)) continue;

        // Split the text node if we only need part of it
        let targetNode = node;

        if (endOffset < targetNode.length) {
            targetNode.splitText(endOffset);
        }
        if (startOffset > 0) {
            targetNode = targetNode.splitText(startOffset);
        }

        // Wrap the target text node in a <mark>
        const mark = document.createElement('mark');
        mark.className = HIGHLIGHT_CLASS;
        mark.dataset.commentId = commentId;
        targetNode.parentNode?.insertBefore(mark, targetNode);
        mark.appendChild(targetNode);
    }
}

/**
 * Get all text nodes within a Range, with their start/end offsets
 * relative to each node.
 */
function getTextNodesInRange(range: Range): Array<{ node: Text; startOffset: number; endOffset: number }> {
    const result: Array<{ node: Text; startOffset: number; endOffset: number }> = [];
    const root = range.commonAncestorContainer;

    // If the range is entirely within one text node
    if (root.nodeType === Node.TEXT_NODE) {
        result.push({
            node: root as Text,
            startOffset: range.startOffset,
            endOffset: range.endOffset,
        });
        return result;
    }

    // Walk all text nodes under the common ancestor
    const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_TEXT,
    );

    let node: Text | null;
    let inRange = false;

    while ((node = walker.nextNode() as Text | null)) {
        if (node === range.startContainer) {
            inRange = true;
            result.push({
                node,
                startOffset: range.startOffset,
                endOffset: node === range.endContainer ? range.endOffset : node.length,
            });
            if (node === range.endContainer) break;
            continue;
        }

        if (node === range.endContainer) {
            result.push({
                node,
                startOffset: 0,
                endOffset: range.endOffset,
            });
            break;
        }

        if (inRange) {
            result.push({
                node,
                startOffset: 0,
                endOffset: node.length,
            });
        }
    }

    return result;
}

/** Check if a node is inside an excluded element (code blocks, etc.) */
function isInsideExcluded(node: Node): boolean {
    let current: Node | null = node;
    while (current) {
        if (current instanceof HTMLElement && current.matches(EXCLUDED_SELECTORS)) {
            return true;
        }
        current = current.parentNode;
    }
    return false;
}

/** Length of common suffix between two strings */
function commonSuffixLength(a: string, b: string): number {
    let i = 0;
    while (i < a.length && i < b.length && a[a.length - 1 - i] === b[b.length - 1 - i]) {
        i++;
    }
    return i;
}

/** Length of common prefix between two strings */
function commonPrefixLength(a: string, b: string): number {
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) {
        i++;
    }
    return i;
}
