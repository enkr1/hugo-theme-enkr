// themes/stack/assets/ts/auth/one-tap.ts

/**
 * Google Identity Services (GIS) One Tap integration.
 *
 * GIS is NOT an ES module — loaded via <script> injection.
 * Credentials are queued if Firebase Auth SDK hasn't loaded yet.
 */
import { signInWithGISCredential } from './firebase-auth';

// GIS type declarations (minimal — only what we use)
interface GISCredentialResponse {
    credential: string;  // JWT id_token
    select_by: string;
}

interface GISPromptNotification {
    getMomentType: () => string;
    getDismissedReason?: () => string;
    getSkippedReason?: () => string;
}

declare global {
    interface Window {
        googleClientId?: string;
        google?: {
            accounts: {
                id: {
                    initialize: (config: Record<string, unknown>) => void;
                    prompt: (callback?: (notification: GISPromptNotification) => void) => void;
                    cancel: () => void;
                    revoke: (hint: string, callback: () => void) => void;
                };
            };
        };
    }
}

let gisLoaded = false;
let oneTapAttempted = false;

/** Inject the GIS script tag. Resolves when loaded. */
function loadGIS(): Promise<void> {
    return new Promise((resolve, reject) => {
        if (window.google?.accounts?.id) {
            gisLoaded = true;
            resolve();
            return;
        }
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.onload = () => {
            gisLoaded = true;
            resolve();
        };
        script.onerror = () => reject(new Error('GIS script failed to load'));
        document.head.appendChild(script);
    });
}

/** Handle the JWT credential from GIS. */
async function handleCredential(response: GISCredentialResponse): Promise<void> {
    await signInWithGISCredential(response.credential);
}

/** Whether One Tap has already been attempted this page load. */
export function wasOneTapAttempted(): boolean {
    return oneTapAttempted;
}

/**
 * Initialize and trigger One Tap prompt.
 * Returns a promise that resolves when the prompt has been shown (or skipped).
 */
export async function initOneTap(): Promise<'prompted' | 'skipped' | 'dismissed'> {
    const clientId = window.googleClientId;
    if (!clientId) {
        console.warn('[auth] No googleClientId found on window. One Tap disabled.');
        return 'skipped';
    }

    if (oneTapAttempted) return 'skipped';
    oneTapAttempted = true;

    try {
        await loadGIS();
    } catch (err) {
        console.warn('[auth] GIS script failed to load:', err);
        return 'skipped';
    }

    return new Promise((resolve) => {
        window.google!.accounts.id.initialize({
            client_id: clientId,
            callback: handleCredential,
            auto_select: true,
            use_fedcm_for_prompt: true,
            cancel_on_tap_outside: true,
        });

        window.google!.accounts.id.prompt((notification: GISPromptNotification) => {
            const moment = notification.getMomentType();
            if (moment === 'display') {
                resolve('prompted');
            } else if (moment === 'skipped') {
                resolve('skipped');
            } else if (moment === 'dismissed') {
                resolve('dismissed');
            } else {
                resolve('skipped');
            }
        });
    });
}

/** Cancel One Tap prompt if showing. */
export function cancelOneTap(): void {
    if (gisLoaded && window.google?.accounts?.id) {
        window.google.accounts.id.cancel();
    }
}
