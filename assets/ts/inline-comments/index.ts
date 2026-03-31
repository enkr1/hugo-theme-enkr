/**
 * Inline Comments — Entry Point
 *
 * Flow: show sign-in prompt → user signs in → subscribe to comments → show them.
 * No Firestore queries for anonymous visitors.
 */
import { initAuth, onAuthStateChange } from './auth';
import { subscribeComments } from './store';
import { initUI, updateComments, destroyUI } from './ui';
import type { Comment } from './types';

function getArticleSlug(): string | null {
    const root = document.getElementById('inline-comments-root');
    return root?.dataset.articleSlug ?? null;
}

async function init(): Promise<void> {
    const slug = getArticleSlug();
    if (!slug) return;

    const rootEl = document.getElementById('inline-comments-root');
    const articleEl = document.querySelector('.article-content') as HTMLElement | null;
    if (!rootEl || !articleEl) return;

    // Build UI (panel with sign-in prompt, selection detection)
    initUI(rootEl, articleEl);

    // Init auth (lazy — only loads SDK if user signed in before)
    initAuth().catch(() => {});

    // Subscribe to comments ONLY after user signs in
    let unsubscribe: (() => void) | null = null;

    onAuthStateChange(async (user) => {
        if (user && !unsubscribe) {
            // User signed in — start loading comments
            try {
                unsubscribe = await subscribeComments(
                    slug,
                    (comments: Comment[]) => updateComments(comments),
                    (err: Error) => console.error('[inline-comments] subscription error:', err.message),
                );
            } catch (err) {
                console.error('[inline-comments] subscribe failed:', err);
            }
        }
    });

    window.addEventListener('beforeunload', () => {
        unsubscribe?.();
        destroyUI();
    });
}

init().catch(err => console.error('[inline-comments] init failed:', err));
