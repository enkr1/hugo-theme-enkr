// themes/stack/assets/ts/auth-ui/index.ts

/**
 * Auth UI — renders the profile icon in the menu / toolbar.
 *
 * Clicking always navigates to /profile/, which handles both states:
 * signed-in (view profile, sign out) and signed-out (Google sign-in).
 * The old in-place dropdown is gone — one icon, one destination.
 *
 * Supports three contexts (can be mounted multiple times per page):
 * - Floating toolbar: icon-only <div class="toolbar-icon">, tooltip via aria-label
 * - Traditional sidebar: <li> with <a><svg/><span></span></a>
 * - Mobile bottom nav: the <a class="mobile-nav__item"> itself is the container
 */
import { onAuthStateChange } from '../auth';
import type { AuthUser } from '../auth';

const PROFILE_URL = '/profile/';

const USER_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-user" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z"/><circle cx="12" cy="7" r="4" /><path d="M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" /></svg>`;

// ─── Toolbar Render (icon-only, no text) ────────────────────────

function renderToolbar(container: HTMLElement, user: AuthUser | null): void {
    container.innerHTML = '';

    if (user) {
        const avatar = document.createElement('img');
        avatar.src = user.photoURL;
        avatar.alt = user.displayName;
        avatar.className = 'auth-toolbar-avatar';
        avatar.width = 20;
        avatar.height = 20;
        avatar.referrerPolicy = 'no-referrer';
        avatar.onerror = () => { container.innerHTML = USER_ICON_SVG; };
        container.appendChild(avatar);

        container.setAttribute('aria-label', user.displayName);
    } else {
        container.innerHTML = USER_ICON_SVG;
        container.setAttribute('aria-label', 'Sign in');
    }

    container.onclick = (e) => {
        e.preventDefault();
        window.location.href = PROFILE_URL;
    };
}

// ─── Link Render (sidebar <li><a> or mobile nav <a>) ────────────

function renderLink(container: HTMLElement, user: AuthUser | null): void {
    // If the container is itself an anchor (mobile bottom nav),
    // render into it directly; otherwise find/create a child <a> (sidebar <li>).
    let link = container instanceof HTMLAnchorElement
        ? container
        : container.querySelector('a');
    if (!link) {
        link = document.createElement('a');
        container.appendChild(link);
    }
    link.innerHTML = '';
    link.href = PROFILE_URL;
    link.onclick = null;

    if (user) {
        const avatar = document.createElement('img');
        avatar.src = user.photoURL;
        avatar.alt = user.displayName;
        avatar.className = 'auth-sidebar-avatar';
        avatar.width = 24;
        avatar.height = 24;
        avatar.referrerPolicy = 'no-referrer';
        avatar.onerror = () => {
            avatar.replaceWith(createIconEl());
        };
        link.appendChild(avatar);

        const label = document.createElement('span');
        label.textContent = 'Profile';
        link.appendChild(label);
    } else {
        link.innerHTML = USER_ICON_SVG;
        const label = document.createElement('span');
        label.textContent = 'Sign in';
        link.appendChild(label);
    }
}

function createIconEl(): Element {
    const tpl = document.createElement('template');
    tpl.innerHTML = USER_ICON_SVG;
    return tpl.content.firstElementChild!;
}

// ─── Mount ──────────────────────────────────────────────────────

/**
 * Mount auth UI into a container. Safe to call multiple times with
 * different containers — each mount keeps its own closure state and
 * registers its own auth listener.
 */
export function mountAuthUI(container: HTMLElement): void {
    const isToolbar = container.classList.contains('toolbar-icon');

    onAuthStateChange((user) => {
        if (isToolbar) renderToolbar(container, user);
        else renderLink(container, user);
    });
}
