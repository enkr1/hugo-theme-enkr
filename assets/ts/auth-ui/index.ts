// themes/stack/assets/ts/auth-ui/index.ts

/**
 * Auth UI — renders sign-in / profile into the auth menu item.
 *
 * Supports two contexts:
 * - Floating toolbar: icon-only <div class="toolbar-icon">, tooltip via aria-label
 * - Traditional sidebar: <li> with <a><svg/><span></span></a>
 */
import { signIn, signOut, onAuthStateChange, initAuth, renderGoogleButton, isGISReady } from '../auth';
import type { AuthUser } from '../auth';

let menuItemEl: HTMLElement | null = null;
let dropdownVisible = false;
let currentUser: AuthUser | null = null;
let isToolbarContext = false;

const USER_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-user" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z"/><circle cx="12" cy="7" r="4" /><path d="M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" /></svg>`;

// ─── Toolbar Render (icon-only, no text) ────────────────────────

function renderToolbar(): void {
    if (!menuItemEl) return;
    menuItemEl.innerHTML = '';

    if (currentUser) {
        const avatar = document.createElement('img');
        avatar.src = currentUser.photoURL;
        avatar.alt = currentUser.displayName;
        avatar.className = 'auth-toolbar-avatar';
        avatar.width = 20;
        avatar.height = 20;
        avatar.referrerPolicy = 'no-referrer';
        avatar.onerror = () => { menuItemEl!.innerHTML = USER_ICON_SVG; };
        menuItemEl.appendChild(avatar);

        menuItemEl.setAttribute('aria-label', currentUser.displayName);
        menuItemEl.onclick = (e) => { e.preventDefault(); e.stopPropagation(); toggleDropdown(); };
    } else {
        menuItemEl.innerHTML = USER_ICON_SVG;
        menuItemEl.setAttribute('aria-label', 'Sign in');
        menuItemEl.onclick = (e) => { e.preventDefault(); e.stopPropagation(); toggleDropdown(); };
    }

    if (dropdownVisible && currentUser) renderDropdown();
    if (dropdownVisible && !currentUser) renderAnonymousDropdown();
}

// ─── Sidebar Render (legacy <li> with <a>) ──────────────────────

function renderSidebar(): void {
    if (!menuItemEl) return;

    let link = menuItemEl.querySelector('a');
    if (!link) {
        link = document.createElement('a');
        menuItemEl.appendChild(link);
    }
    link.innerHTML = '';

    if (currentUser) {
        const avatar = document.createElement('img');
        avatar.src = currentUser.photoURL;
        avatar.alt = currentUser.displayName;
        avatar.className = 'auth-sidebar-avatar';
        avatar.width = 24;
        avatar.height = 24;
        avatar.referrerPolicy = 'no-referrer';
        link.appendChild(avatar);

        link.onclick = (e) => { e.preventDefault(); toggleDropdown(); };
    } else {
        link.innerHTML = USER_ICON_SVG;
        const label = document.createElement('span');
        label.textContent = 'Sign in';
        link.appendChild(label);

        link.onclick = (e) => { e.preventDefault(); toggleDropdown(); };
    }

    const existingDropdown = menuItemEl.querySelector('.auth-dropdown');
    if (existingDropdown) existingDropdown.remove();

    if (dropdownVisible && currentUser) renderDropdown();
    if (dropdownVisible && !currentUser) renderAnonymousDropdown();
}

// ─── Shared ─────────────────────────────────────────────────────

function render(): void {
    if (isToolbarContext) renderToolbar();
    else renderSidebar();
}

function renderDropdown(): void {
    if (!menuItemEl || !currentUser) return;

    const dropdown = document.createElement('div');
    dropdown.className = 'auth-dropdown';

    const signOutBtn = document.createElement('button');
    signOutBtn.className = 'auth-dropdown-item';
    signOutBtn.textContent = 'Sign out';
    signOutBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        dropdownVisible = false;
        await signOut();
    });
    dropdown.appendChild(signOutBtn);

    menuItemEl.appendChild(dropdown);
}

function renderAnonymousDropdown(): void {
    if (!menuItemEl) return;

    // Remove any existing dropdown
    const existing = menuItemEl.querySelector('.auth-dropdown');
    if (existing) existing.remove();

    const dropdown = document.createElement('div');
    dropdown.className = 'auth-dropdown auth-dropdown--anonymous';

    const container = document.createElement('div');
    container.className = 'auth-google-btn-container';
    dropdown.appendChild(container);

    menuItemEl.appendChild(dropdown);

    // Try to render Google button immediately
    if (renderGoogleButton(container)) return;

    // GIS not ready — show spinner, eagerly trigger load
    container.innerHTML = '<div class="auth-spinner"></div>';

    // Eagerly trigger GIS load if not yet attempted
    initAuth().then(() => {
        // Retry after GIS loads
        const retryInterval = setInterval(() => {
            if (isGISReady()) {
                clearInterval(retryInterval);
                container.innerHTML = '';
                renderGoogleButton(container);
            }
        }, 200);

        // 5s timeout — show fallback text link
        setTimeout(() => {
            clearInterval(retryInterval);
            if (!isGISReady()) {
                container.innerHTML = '';
                const fallback = document.createElement('button');
                fallback.className = 'auth-dropdown-item';
                fallback.textContent = 'Sign in with Google';
                fallback.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    dropdownVisible = false;
                    render();
                    await signIn();
                });
                container.appendChild(fallback);
            }
        }, 5000);
    });
}

function toggleDropdown(): void {
    dropdownVisible = !dropdownVisible;
    render();
}

function handleClickOutside(e: MouseEvent): void {
    if (dropdownVisible && menuItemEl && !menuItemEl.contains(e.target as Node)) {
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

/** Mount auth UI into the menu item container. */
export function mountAuthUI(container: HTMLElement): void {
    menuItemEl = container;
    isToolbarContext = container.classList.contains('toolbar-icon');

    onAuthStateChange((user) => {
        currentUser = user;
        dropdownVisible = false;
        render();
    });

    document.addEventListener('click', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
}
