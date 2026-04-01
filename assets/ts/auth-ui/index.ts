// themes/stack/assets/ts/auth-ui/index.ts

/**
 * Auth UI — sidebar menu item.
 *
 * States:
 * - Anonymous: user icon + "Sign in" (matches other menu items)
 * - Signed in: avatar + display name → click opens dropdown (sign out, future slots)
 */
import { signIn, signOut, onAuthStateChange } from '../auth';
import type { AuthUser } from '../auth';

let menuItemEl: HTMLElement | null = null;
let dropdownVisible = false;
let currentUser: AuthUser | null = null;

function render(): void {
    if (!menuItemEl) return;

    // Clear existing content
    menuItemEl.innerHTML = '';
    menuItemEl.className = currentUser ? 'auth-signed-in' : '';

    if (currentUser) {
        // Signed in — show avatar + name
        const avatar = document.createElement('img');
        avatar.src = currentUser.photoURL;
        avatar.alt = currentUser.displayName;
        avatar.className = 'auth-sidebar-avatar';
        avatar.width = 24;
        avatar.height = 24;
        avatar.referrerPolicy = 'no-referrer';
        menuItemEl.appendChild(avatar);

        const name = document.createElement('span');
        name.textContent = currentUser.displayName;
        menuItemEl.appendChild(name);

        menuItemEl.onclick = toggleDropdown;
    } else {
        // Anonymous — show user icon + "Sign in" (icon rendered by Hugo template)
        // Re-add the SVG icon that Hugo originally rendered
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'icon icon-tabler icon-tabler-user');
        svg.setAttribute('width', '24');
        svg.setAttribute('height', '24');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('stroke-width', '2');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');

        const pathBg = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        pathBg.setAttribute('stroke', 'none');
        pathBg.setAttribute('d', 'M0 0h24v24H0z');
        svg.appendChild(pathBg);

        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', '12');
        circle.setAttribute('cy', '7');
        circle.setAttribute('r', '4');
        svg.appendChild(circle);

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2');
        svg.appendChild(path);

        menuItemEl.appendChild(svg);

        const label = document.createElement('span');
        label.textContent = 'Sign in';
        menuItemEl.appendChild(label);

        menuItemEl.onclick = () => signIn();
    }

    // Render dropdown if visible
    if (dropdownVisible && currentUser) {
        renderDropdown();
    }
}

function renderDropdown(): void {
    if (!menuItemEl || !currentUser) return;

    const dropdown = document.createElement('div');
    dropdown.className = 'auth-dropdown';

    // Sign out
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

/** Mount auth UI into the sidebar menu item. */
export function mountAuthUI(container: HTMLElement): void {
    menuItemEl = container;

    onAuthStateChange((user) => {
        currentUser = user;
        dropdownVisible = false;
        render();
    });

    document.addEventListener('click', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
}
