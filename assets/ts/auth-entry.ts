// themes/stack/assets/ts/auth-entry.ts

/**
 * Auth entry point — single bundle for shared module scope.
 *
 * Hugo's js.Build creates isolated scopes per entry point.
 * This file ensures auth state is shared between auth-ui and auth modules.
 * Inline-comments (separate bundle) accesses auth via window.__siteAuth.
 */
import { initAuth, signIn, signOut, onAuthStateChange, getCurrentUser } from './auth';
import type { AuthUser } from './auth';
import { mountAuthUI } from './auth-ui';

// Expose auth API on window for cross-bundle access (inline-comments)
interface SiteAuth {
    initAuth: typeof initAuth;
    signIn: typeof signIn;
    signOut: typeof signOut;
    onAuthStateChange: typeof onAuthStateChange;
    getCurrentUser: typeof getCurrentUser;
}

declare global {
    interface Window {
        __siteAuth?: SiteAuth;
    }
}

window.__siteAuth = { initAuth, signIn, signOut, onAuthStateChange, getCurrentUser };

// Mount auth UI into sidebar menu item
const menuItem = document.getElementById('auth-menu-item');
if (menuItem) mountAuthUI(menuItem);

// Initialize auth
initAuth().catch(err => console.error('[auth] init failed:', err));
