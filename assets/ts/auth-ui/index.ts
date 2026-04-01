// themes/stack/assets/ts/auth-ui/index.ts

/**
 * Auth UI — sidebar menu item.
 *
 * Renders inside a <li> in the main menu, matching other menu items' structure.
 * Anonymous: user icon + "Sign in". Signed in: avatar + name + dropdown.
 */
import { signIn, signOut, onAuthStateChange } from '../auth';
import type { AuthUser } from '../auth';

let menuItemEl: HTMLElement | null = null;
let dropdownVisible = false;
let currentUser: AuthUser | null = null;

function render(): void {
    if (!menuItemEl) return;

    // Get or create the <a> wrapper (matches other menu items' structure)
    let link = menuItemEl.querySelector('a');
    if (!link) {
        link = document.createElement('a');
        menuItemEl.appendChild(link);
    }
    link.innerHTML = '';

    if (currentUser) {
        // Signed in — show avatar + name
        const avatar = document.createElement('img');
        avatar.src = currentUser.photoURL;
        avatar.alt = currentUser.displayName;
        avatar.className = 'auth-sidebar-avatar';
        avatar.width = 24;
        avatar.height = 24;
        avatar.referrerPolicy = 'no-referrer';
        link.appendChild(avatar);

        const name = document.createElement('span');
        name.textContent = currentUser.displayName;
        link.appendChild(name);

        link.onclick = (e) => { e.preventDefault(); toggleDropdown(); };
    } else {
        // Anonymous — user icon + "Sign in"
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

        link.appendChild(svg);

        const label = document.createElement('span');
        label.textContent = 'Sign in';
        link.appendChild(label);

        link.onclick = (e) => { e.preventDefault(); signIn(); };
    }

    // Render dropdown if visible
    const existingDropdown = menuItemEl.querySelector('.auth-dropdown');
    if (existingDropdown) existingDropdown.remove();

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
