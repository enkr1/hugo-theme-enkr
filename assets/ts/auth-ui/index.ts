// themes/stack/assets/ts/auth-ui/index.ts

/**
 * Auth UI — fixed top-right icon with dropdown.
 *
 * States:
 * - Anonymous: person silhouette icon → click triggers signIn()
 * - Signed in: Google avatar → click opens dropdown (name, email, sign out)
 */
import { signIn, signOut, onAuthStateChange } from '../auth';
import type { AuthUser } from '../auth';

const PERSON_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;

let rootEl: HTMLElement | null = null;
let dropdownVisible = false;
let currentUser: AuthUser | null = null;

function render(): void {
    if (!rootEl) return;
    rootEl.innerHTML = '';

    const btn = document.createElement('button');
    btn.className = 'auth-icon-btn';
    btn.setAttribute('aria-label', currentUser ? 'Account menu' : 'Sign in');

    if (currentUser) {
        // Signed in — show avatar
        if (currentUser.photoURL) {
            const img = document.createElement('img');
            img.src = currentUser.photoURL;
            img.alt = currentUser.displayName;
            img.className = 'auth-icon-avatar';
            img.width = 32;
            img.height = 32;
            img.referrerPolicy = 'no-referrer';
            btn.appendChild(img);
        } else {
            // Fallback: initials
            const initialsEl = document.createElement('span');
            initialsEl.className = 'auth-icon-initials';
            initialsEl.textContent = currentUser.displayName.substring(0, 2).toUpperCase();
            btn.appendChild(initialsEl);
        }
        btn.addEventListener('click', toggleDropdown);
    } else {
        // Anonymous — show person icon
        btn.innerHTML = PERSON_SVG;
        btn.addEventListener('click', () => signIn());
    }

    rootEl.appendChild(btn);

    // Render dropdown if visible
    if (dropdownVisible && currentUser) {
        renderDropdown();
    }
}

function renderDropdown(): void {
    if (!rootEl || !currentUser) return;

    const dropdown = document.createElement('div');
    dropdown.className = 'auth-dropdown';

    // User info
    const info = document.createElement('div');
    info.className = 'auth-dropdown-info';

    const name = document.createElement('div');
    name.className = 'auth-dropdown-name';
    name.textContent = currentUser.displayName;
    info.appendChild(name);

    dropdown.appendChild(info);

    // Divider
    const divider = document.createElement('hr');
    divider.className = 'auth-dropdown-divider';
    dropdown.appendChild(divider);

    // Sign out
    const signOutBtn = document.createElement('button');
    signOutBtn.className = 'auth-dropdown-item';
    signOutBtn.textContent = 'Sign out';
    signOutBtn.addEventListener('click', async () => {
        dropdownVisible = false;
        await signOut();
    });
    dropdown.appendChild(signOutBtn);

    rootEl.appendChild(dropdown);
}

function toggleDropdown(): void {
    dropdownVisible = !dropdownVisible;
    render();
}

function handleClickOutside(e: MouseEvent): void {
    if (dropdownVisible && rootEl && !rootEl.contains(e.target as Node)) {
        dropdownVisible = false;
        render();
    }
}

function handleEscape(e: KeyboardEvent): void {
    if (dropdownVisible && e.key === 'Escape') {
        dropdownVisible = false;
        render();
    }
}

/** Mount the auth icon into the given container element. */
export function mountAuthUI(container: HTMLElement): void {
    rootEl = container;

    onAuthStateChange((user) => {
        currentUser = user;
        dropdownVisible = false;
        render();
    });

    document.addEventListener('click', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
}
