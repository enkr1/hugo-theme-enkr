// themes/stack/assets/ts/auth/firebase-auth.ts

/**
 * Lazy-loads Firebase Auth SDK and provides all auth operations.
 * Only downloads ~100KB SDK when actually needed.
 */
import type { AuthUser, AuthStateCallback } from './types';

const FIREBASE_CDN = 'https://www.gstatic.com/firebasejs/10.11.1';
const AUTH_STORAGE_KEY = 'auth-active';
const OLD_AUTH_STORAGE_KEY = 'inline-comments-auth-active';

let authInstance: unknown = null;
let cachedAuthFns: Awaited<ReturnType<typeof loadAuthFns>> | null = null;
let currentUser: AuthUser | null = null;
const listeners: AuthStateCallback[] = [];
let firebaseInitialized = false;

// ─── localStorage helpers ────────────────────────────────────────

function migrateStorageKey(): void {
    try {
        if (localStorage.getItem(OLD_AUTH_STORAGE_KEY) === '1') {
            localStorage.setItem(AUTH_STORAGE_KEY, '1');
            localStorage.removeItem(OLD_AUTH_STORAGE_KEY);
        }
    } catch { /* noop */ }
}

export function hasAuthHistory(): boolean {
    migrateStorageKey();
    try { return localStorage.getItem(AUTH_STORAGE_KEY) === '1'; } catch { return false; }
}

function setAuthHistory(): void {
    try { localStorage.setItem(AUTH_STORAGE_KEY, '1'); } catch { /* noop */ }
}

function clearAuthHistory(): void {
    try { localStorage.removeItem(AUTH_STORAGE_KEY); } catch { /* noop */ }
}

// ─── SDK Lazy Loading ────────────────────────────────────────────

async function loadAuthFns() {
    // Import both from CDN so they share the same internal app registry
    const [authMod, appMod] = await Promise.all([
        import(`${FIREBASE_CDN}/firebase-auth.js`),
        import(`${FIREBASE_CDN}/firebase-app.js`),
    ]);
    return {
        getAuth: authMod.getAuth,
        getApp: appMod.getApp,
        signInWithPopup: authMod.signInWithPopup,
        signInWithRedirect: authMod.signInWithRedirect,
        signInWithCredential: authMod.signInWithCredential,
        getRedirectResult: authMod.getRedirectResult,
        GoogleAuthProvider: authMod.GoogleAuthProvider,
        signOut: authMod.signOut,
        onAuthStateChanged: authMod.onAuthStateChanged,
    };
}

async function getAuthFns() {
    if (!cachedAuthFns) cachedAuthFns = await loadAuthFns();
    return cachedAuthFns;
}

export async function ensureAuth() {
    if (authInstance) return authInstance;
    const fns = await getAuthFns();
    // Use CDN's getApp() — same registry as head/custom.html's initializeApp()
    authInstance = fns.getAuth(fns.getApp());
    return authInstance;
}

// ─── User mapping ────────────────────────────────────────────────

function toAuthUser(firebaseUser: { uid: string; displayName: string | null; photoURL: string | null }): AuthUser {
    const displayName = firebaseUser.displayName ?? 'Anonymous';
    return {
        uid: firebaseUser.uid,
        displayName,
        photoURL: firebaseUser.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&size=96`,
    };
}

function notifyListeners(user: AuthUser | null): void {
    currentUser = user;
    for (const cb of listeners) cb(user);
}

// ─── Public API ──────────────────────────────────────────────────

/**
 * Initialize auth — only if user has previously signed in (localStorage flag).
 * Avoids loading ~100KB Auth SDK for anonymous readers.
 */
export async function initFirebaseAuth(): Promise<void> {
    if (firebaseInitialized) return;
    firebaseInitialized = true;
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

        authFns.onAuthStateChanged(auth, (user: { uid: string; displayName: string | null; photoURL: string | null } | null) => {
            notifyListeners(user ? toAuthUser(user) : null);
        });
    } catch (err) {
        console.error('[auth] Firebase Auth init failed:', err);
    }
}

/** Sign in with Google popup. Loads Auth SDK on first call. */
export async function signInWithPopup(): Promise<AuthUser | null> {
    try {
        const authFns = await getAuthFns();
        const auth = await ensureAuth();
        const provider = new authFns.GoogleAuthProvider();

        try {
            const result = await authFns.signInWithPopup(auth, provider);
            setAuthHistory();
            const user = toAuthUser(result.user);
            notifyListeners(user);
            return user;
        } catch (popupErr: unknown) {
            const err = popupErr as { code?: string };
            if (err.code === 'auth/popup-blocked' || err.code === 'auth/popup-closed-by-user') {
                await authFns.signInWithRedirect(auth, provider);
                return null;
            }
            throw popupErr;
        }
    } catch (err) {
        console.error('[auth] Sign-in with popup failed:', err);
        return null;
    }
}

/** Bridge a GIS JWT credential into Firebase Auth session. */
export async function signInWithGISCredential(idToken: string): Promise<AuthUser | null> {
    try {
        const authFns = await getAuthFns();
        const auth = await ensureAuth();
        const credential = authFns.GoogleAuthProvider.credential(idToken);
        const result = await authFns.signInWithCredential(auth, credential);
        setAuthHistory();
        const user = toAuthUser(result.user);
        notifyListeners(user);
        return user;
    } catch (err) {
        console.error('[auth] GIS credential sign-in failed:', err);
        return null;
    }
}

/** Sign out and clear state. */
export async function firebaseSignOut(): Promise<void> {
    try {
        const authFns = await getAuthFns();
        const auth = await ensureAuth();
        await authFns.signOut(auth);
        clearAuthHistory();
        notifyListeners(null);
    } catch (err) {
        console.error('[auth] Sign-out failed:', err);
    }
}

/** Subscribe to auth state changes. Returns unsubscribe function. */
export function onAuthStateChange(callback: AuthStateCallback): () => void {
    listeners.push(callback);
    callback(currentUser);
    return () => {
        const idx = listeners.indexOf(callback);
        if (idx >= 0) listeners.splice(idx, 1);
    };
}

/** Get the current user (synchronous). */
export function getCurrentUser(): AuthUser | null {
    return currentUser;
}
