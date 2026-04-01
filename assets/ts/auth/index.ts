// themes/stack/assets/ts/auth/index.ts

/**
 * Site-wide auth — public API.
 *
 * Orchestrates: One Tap (auto-prompt) → popup fallback.
 * Consumers import from here, never from sub-modules.
 */
export type { AuthUser, AuthStateCallback } from './types';

import {
    initFirebaseAuth,
    signInWithPopup,
    firebaseSignOut,
    onAuthStateChange as firebaseOnAuthStateChange,
    getCurrentUser as firebaseGetCurrentUser,
    hasAuthHistory,
} from './firebase-auth';

import {
    initOneTap,
    cancelOneTap,
    wasOneTapAttempted,
} from './one-tap';

let authInitialized = false;

/**
 * Initialize auth on page load.
 *
 * - Returning users (localStorage flag): lazy-load Firebase Auth, restore session.
 * - Anonymous users: schedule One Tap after page idle (~3s).
 */
export async function initAuth(): Promise<void> {
    if (authInitialized) return;
    authInitialized = true;

    if (hasAuthHistory()) {
        // Returning user — restore Firebase session
        await initFirebaseAuth();
        return;
    }

    // Anonymous user — schedule One Tap
    const scheduleOneTap = () => {
        setTimeout(async () => {
            const result = await initOneTap();
            if (result === 'prompted') {
                // One Tap is showing or auto-selected — Firebase Auth will
                // load when credential arrives via handleCredential → signInWithGISCredential
            }
            // If skipped/dismissed, the icon click will use popup fallback
        }, 3000);
    };

    if ('requestIdleCallback' in window) {
        requestIdleCallback(scheduleOneTap);
    } else {
        scheduleOneTap();
    }
}

/**
 * Sign in — called when user clicks the auth icon.
 *
 * Tries One Tap first (if not attempted), falls back to popup.
 */
export async function signIn(): Promise<void> {
    if (!wasOneTapAttempted()) {
        const result = await initOneTap();
        if (result === 'prompted') {
            // One Tap is showing — wait for credential
            return;
        }
    }

    // One Tap unavailable or already attempted — use popup
    await signInWithPopup();
}

/** Sign out. */
export async function signOut(): Promise<void> {
    cancelOneTap();
    await firebaseSignOut();
}

/** Subscribe to auth state changes. Returns unsubscribe function. */
export function onAuthStateChange(callback: (user: import('./types').AuthUser | null) => void): () => void {
    return firebaseOnAuthStateChange(callback);
}

/** Get the current user (synchronous). */
export function getCurrentUser(): import('./types').AuthUser | null {
    return firebaseGetCurrentUser();
}
