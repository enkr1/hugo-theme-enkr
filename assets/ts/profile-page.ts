// themes/stack/assets/ts/profile-page.ts

/**
 * Profile page (/profile/) — client-side profile card.
 *
 * Mounted by auth-entry.ts when #profile-card exists, so it lives in the
 * same bundle scope as the auth modules (shared Firebase state).
 *
 * Signed in  → avatar, display name, sign-out button
 * Signed out → placeholder icon + Google sign-in button
 */
import { signOut, onAuthStateChange, initAuth, renderGoogleButton, isGISReady } from './auth';
import type { AuthUser } from './auth';

const USER_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-user" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z"/><circle cx="12" cy="7" r="4" /><path d="M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" /></svg>`;

export function mountProfilePage(card: HTMLElement): void {
    const avatarEl = card.querySelector('.profile-card__avatar') as HTMLElement | null;
    const nameEl = card.querySelector('.profile-card__name') as HTMLElement | null;
    const hintEl = card.querySelector('.profile-card__hint') as HTMLElement | null;
    const actionEl = card.querySelector('.profile-card__action') as HTMLElement | null;
    if (!avatarEl || !nameEl || !hintEl || !actionEl) return;
    // Sign-out lives outside the card, at the very bottom of the page
    // (settings-app convention). Falls back to the card slot if absent.
    const signoutEl = document.getElementById('profile-signout') ?? actionEl;

    function renderSignedIn(user: AuthUser): void {
        avatarEl.innerHTML = '';
        const img = document.createElement('img');
        img.src = user.photoURL;
        img.alt = user.displayName;
        img.referrerPolicy = 'no-referrer';
        img.onerror = () => { avatarEl.innerHTML = USER_ICON_SVG; };
        avatarEl.appendChild(img);

        nameEl.textContent = user.displayName;
        // The avatar and the sign-out flow already say "Google" — the hint was noise.
        hintEl.textContent = '';
        hintEl.hidden = true;

        actionEl.innerHTML = ''; // card action stays empty when signed in — :empty hides the row
        signoutEl.innerHTML = '';
        const btn = document.createElement('button');
        btn.className = 'profile-btn profile-btn--signout';
        btn.type = 'button';
        btn.textContent = 'Sign out';
        btn.addEventListener('click', () => { signOut(); });
        signoutEl.appendChild(btn);
    }

    function renderSignedOut(): void {
        avatarEl.innerHTML = USER_ICON_SVG;
        nameEl.textContent = 'Not signed in';
        hintEl.hidden = false;
        hintEl.textContent = 'Sign in with Google to comment';

        signoutEl.innerHTML = '';
        actionEl.innerHTML = '';
        const container = document.createElement('div');
        container.className = 'auth-google-btn-container';
        actionEl.appendChild(container);

        // Same GIS-not-ready fallback pattern as the old dropdown
        if (renderGoogleButton(container)) return;

        container.innerHTML = '<div class="auth-spinner"></div>';
        initAuth().then(() => {
            const retry = setInterval(() => {
                if (isGISReady()) {
                    clearInterval(retry);
                    container.innerHTML = '';
                    renderGoogleButton(container);
                }
            }, 200);
            setTimeout(() => clearInterval(retry), 5000);
        });
    }

    onAuthStateChange((user) => {
        if (user) renderSignedIn(user);
        else renderSignedOut();
    });
}
