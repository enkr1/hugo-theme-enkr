/**
 * Inline Comments — Entry Point
 *
 * Loaded as a separate Hugo js.Build bundle on article pages with comments enabled.
 * Initializes auth (if returning user), subscribes to Firestore, and renders the UI.
 *
 * This file is bundled by Hugo's esbuild. All imports within inline-comments/
 * are resolved at build time into a single bundle.
 */
import { initAuth } from './auth';
import { subscribeComments } from './store';
import { initUI, updateComments, destroyUI } from './ui';
import { initPositioning } from './positioning';
import type { Comment } from './types';

/** Extract article slug from the root element's data attribute */
function getArticleSlug(): string | null {
    const root = document.getElementById('inline-comments-root');
    return root?.dataset.articleSlug ?? null;
}

/** Main initialization */
async function init(): Promise<void> {
    const slug = getArticleSlug();
    if (!slug) {
        console.warn('[inline-comments] No article slug found. Skipping.');
        return;
    }

    const rootEl = document.getElementById('inline-comments-root');
    const articleEl = document.querySelector('.article-content') as HTMLElement | null;
    if (!rootEl || !articleEl) {
        console.warn('[inline-comments] Missing root or article element. Skipping.');
        return;
    }

    // Initialize UI (builds panel, sets up selection detection)
    initUI(rootEl, articleEl);

    // Initialize scroll-synced positioning
    // The panel body is created by initUI, find it
    const panelBody = rootEl.querySelector('.ic-panel-body') as HTMLElement | null;
    // Article area is the scrollable parent of .article-content
    const scrollableArticle = articleEl.closest('.article-area') as HTMLElement
        ?? articleEl.parentElement as HTMLElement;
    let cleanupPositioning: (() => void) | null = null;
    if (panelBody && scrollableArticle) {
        cleanupPositioning = initPositioning(panelBody, scrollableArticle);
    }

    // Initialize auth for returning users (lazy — skips Auth SDK for anonymous readers)
    await initAuth();

    // Subscribe to comments in real-time
    const unsubscribe = await subscribeComments(
        slug,
        (comments: Comment[]) => {
            updateComments(comments);
        },
        (err: Error) => {
            console.error('[inline-comments] Failed to load comments:', err);
        },
    );

    // Cleanup on page navigation (SPA-like themes)
    window.addEventListener('beforeunload', () => {
        unsubscribe();
        cleanupPositioning?.();
        destroyUI();
    });
}

init();
