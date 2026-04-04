/**
 * Inline Comments — Entry Point
 *
 * Flow: subscribe to comments immediately (guests can read) → prompt sign-in only for writes.
 */
import { subscribeComments } from './store';
import { initUI, updateComments, destroyUI, focusComment } from './ui';
import { getCachedComments, setCachedComments } from './utils';
import type { Comment } from './types';

declare global {
    interface Window {
        __siteAuth?: {
            initAuth: () => Promise<void>;
            signIn: () => Promise<void>;
            signOut: () => Promise<void>;
            onAuthStateChange: (cb: (user: { uid: string; displayName: string; photoURL: string } | null) => void) => () => void;
            getCurrentUser: () => { uid: string; displayName: string; photoURL: string } | null;
        };
    }
}

// Auth is loaded via auth-entry.ts (separate bundle shares state via window)
function getAuth() {
    if (!window.__siteAuth) throw new Error('Auth not initialized. Check auth/init.html.');
    return window.__siteAuth;
}

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

    // Build UI (panel, selection detection)
    initUI(rootEl, articleEl);

    // Show cached comments instantly (stale-while-revalidate)
    const cached = getCachedComments(slug);
    if (cached) {
        updateComments(cached as Comment[]);
    }

    // Init auth (lazy — only loads SDK if user signed in before)
    getAuth().initAuth().catch(() => {});

    // Subscribe to comments — Firestore updates replace cached data
    let unsubscribe: (() => void) | null = null;
    try {
        unsubscribe = await subscribeComments(
            slug,
            (comments: Comment[]) => {
                updateComments(comments);
                setCachedComments(slug, comments as unknown[]);
                // Deep-link: scroll to comment if ?comment=ID is in URL
                const targetId = new URLSearchParams(window.location.search).get('comment');
                if (targetId && comments.some(c => c.id === targetId)) {
                    setTimeout(() => focusComment(targetId), 300);
                }
            },
            (err: Error) => console.error('[inline-comments] subscription error:', err.message),
        );
    } catch (err) {
        console.error('[inline-comments] subscribe failed:', err);
        if (!cached) updateComments([]);
    }

    window.addEventListener('beforeunload', () => {
        unsubscribe?.();
        destroyUI();
    });
}

init().catch(err => console.error('[inline-comments] init failed:', err));
