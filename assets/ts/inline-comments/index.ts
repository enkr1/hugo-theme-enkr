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

    // Initialize auth for returning users (lazy — skips Auth SDK for anonymous readers)
    await initAuth();

    // Subscribe to comments in real-time
    const unsubscribe = await subscribeComments(
        slug,
        (comments: Comment[]) => {
            // TODO(T7): render UI with comments
            console.log(`[inline-comments] ${comments.length} comments loaded for "${slug}"`);
        },
        (err: Error) => {
            console.error('[inline-comments] Failed to load comments:', err);
        },
    );

    // Cleanup on page navigation (SPA-like themes)
    window.addEventListener('beforeunload', () => {
        unsubscribe();
    });
}

init();
