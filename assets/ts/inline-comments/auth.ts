/**
 * Google OAuth for inline comments.
 * Lazy-loads Firebase Auth SDK only when needed.
 * Uses localStorage flag to skip Auth SDK download for anonymous readers.
 */
import type { AuthUser } from './types';

const FIREBASE_CDN = 'https://www.gstatic.com/firebasejs/10.11.1';
const AUTH_STORAGE_KEY = 'inline-comments-auth-active';

type AuthStateCallback = (user: AuthUser | null) => void;

let authInstance: unknown = null;
let currentUser: AuthUser | null = null;
const listeners: AuthStateCallback[] = [];

function hasAuthHistory(): boolean {
    try { return localStorage.getItem(AUTH_STORAGE_KEY) === '1'; } catch { return false; }
}

function setAuthHistory(): void {
    try { localStorage.setItem(AUTH_STORAGE_KEY, '1'); } catch { /* noop */ }
}

function clearAuthHistory(): void {
    try { localStorage.removeItem(AUTH_STORAGE_KEY); } catch { /* noop */ }
}

function getApp(): unknown {
    const app = (window as unknown as Record<string, unknown>).firebaseApp;
    if (!app) throw new Error('Firebase app not initialized. Check head/custom.html.');
    return app;
}

/** Lazy-import Firebase Auth functions */
async function getAuthFns() {
    const mod = await import(`${FIREBASE_CDN}/firebase-auth.js`);
    return {
        getAuth: mod.getAuth,
        signInWithPopup: mod.signInWithPopup,
        signInWithRedirect: mod.signInWithRedirect,
        getRedirectResult: mod.getRedirectResult,
        GoogleAuthProvider: mod.GoogleAuthProvider,
        signOut: mod.signOut,
        onAuthStateChanged: mod.onAuthStateChanged,
    };
}

/** Ensure Auth SDK is loaded and auth instance exists */
async function ensureAuth() {
    if (authInstance) return authInstance;
    const auth = await getAuthFns();
    authInstance = auth.getAuth(getApp());
    return authInstance;
}

function toAuthUser(firebaseUser: { uid: string; displayName: string | null; photoURL: string | null }): AuthUser {
    return {
        uid: firebaseUser.uid,
        displayName: firebaseUser.displayName ?? 'Anonymous',
        photoURL: firebaseUser.photoURL ?? '',
    };
}

function notifyListeners(user: AuthUser | null): void {
    currentUser = user;
    for (const cb of listeners) cb(user);
}

/**
 * Initialize auth — only if user has previously signed in (localStorage flag).
 * This avoids loading the ~100KB Auth SDK for anonymous readers.
 */
export async function initAuth(): Promise<void> {
    if (!hasAuthHistory()) return;

    try {
        const authFns = await getAuthFns();
        const auth = await ensureAuth();

        // Check for redirect result (Safari fallback flow)
        try {
            const result = await authFns.getRedirectResult(auth);
            if (result?.user) {
                setAuthHistory();
                notifyListeners(toAuthUser(result.user));
            }
        } catch {
            // No redirect result — normal flow
        }

        // Listen for auth state changes
        authFns.onAuthStateChanged(auth, (user: { uid: string; displayName: string | null; photoURL: string | null } | null) => {
            if (user) {
                notifyListeners(toAuthUser(user));
            } else {
                notifyListeners(null);
            }
        });
    } catch (err) {
        console.error('[inline-comments] Auth init failed:', err);
    }
}

/** Sign in with Google. Loads Auth SDK on first call. */
export async function signIn(): Promise<AuthUser | null> {
    try {
        const authFns = await getAuthFns();
        const auth = await ensureAuth();
        const provider = new authFns.GoogleAuthProvider();

        try {
            // Try popup first (works on most browsers)
            const result = await authFns.signInWithPopup(auth, provider);
            setAuthHistory();
            const user = toAuthUser(result.user);
            notifyListeners(user);
            return user;
        } catch (popupErr: unknown) {
            // Popup blocked (Safari) — fall back to redirect
            const err = popupErr as { code?: string };
            if (err.code === 'auth/popup-blocked' || err.code === 'auth/popup-closed-by-user') {
                await authFns.signInWithRedirect(auth, provider);
                // Page will redirect — won't reach here
                return null;
            }
            throw popupErr;
        }
    } catch (err) {
        console.error('[inline-comments] Sign-in failed:', err);
        return null;
    }
}

/** Sign out. */
export async function signOut(): Promise<void> {
    try {
        const authFns = await getAuthFns();
        const auth = await ensureAuth();
        await authFns.signOut(auth);
        clearAuthHistory();
        notifyListeners(null);
    } catch (err) {
        console.error('[inline-comments] Sign-out failed:', err);
    }
}

/** Subscribe to auth state changes. Returns unsubscribe function. */
export function onAuthStateChange(callback: AuthStateCallback): () => void {
    listeners.push(callback);
    // Immediately notify with current state
    callback(currentUser);
    return () => {
        const idx = listeners.indexOf(callback);
        if (idx >= 0) listeners.splice(idx, 1);
    };
}

/** Get the current user (synchronous — may be null if auth not initialized). */
export function getCurrentUser(): AuthUser | null {
    return currentUser;
}
