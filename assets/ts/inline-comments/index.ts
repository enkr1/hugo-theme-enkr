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
    console.log('[inline-comments] init() starting...');

    const slug = getArticleSlug();
    if (!slug) {
        console.warn('[inline-comments] No article slug found. Skipping.');
        return;
    }
    console.log('[inline-comments] slug:', slug);

    const rootEl = document.getElementById('inline-comments-root');
    const articleEl = document.querySelector('.article-content') as HTMLElement | null;
    if (!rootEl || !articleEl) {
        console.warn('[inline-comments] Missing root or article element. Skipping.');
        return;
    }
    console.log('[inline-comments] rootEl + articleEl found');

    // Initialize UI (builds panel, sets up selection detection)
    initUI(rootEl, articleEl);
    console.log('[inline-comments] UI initialized');

    // Initialize scroll-synced positioning
    const panelBody = rootEl.querySelector('.ic-panel-body') as HTMLElement | null;
    const scrollableArticle = articleEl.closest('.article-area') as HTMLElement
        ?? articleEl.parentElement as HTMLElement;
    let cleanupPositioning: (() => void) | null = null;
    if (panelBody && scrollableArticle) {
        cleanupPositioning = initPositioning(panelBody, scrollableArticle);
        console.log('[inline-comments] positioning initialized');
    } else {
        console.warn('[inline-comments] panelBody or scrollableArticle not found', { panelBody, scrollableArticle });
    }

    // Initialize auth for returning users
    console.log('[inline-comments] initializing auth...');
    await initAuth();
    console.log('[inline-comments] auth initialized');

    // Check Firebase state
    const db = (window as unknown as Record<string, unknown>).firestoreDb;
    console.log('[inline-comments] firestoreDb:', db ? 'OK' : 'MISSING');

    // Subscribe to comments in real-time
    console.log('[inline-comments] subscribing to comments for slug:', slug);
    try {
        const unsubscribe = await subscribeComments(
            slug,
            (comments: Comment[]) => {
                console.log(`[inline-comments] onSnapshot: ${comments.length} comments received`);
                updateComments(comments);
            },
            (err: Error) => {
                console.error('[inline-comments] Firestore subscription error:', err);
            },
        );
        console.log('[inline-comments] subscription active');

        window.addEventListener('beforeunload', () => {
            unsubscribe();
            cleanupPositioning?.();
            destroyUI();
        });
    } catch (err) {
        console.error('[inline-comments] subscribeComments threw:', err);
    }
}

init().catch(err => console.error('[inline-comments] init() failed:', err));

init();
