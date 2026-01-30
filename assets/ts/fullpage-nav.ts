/**
 * Full-page navigation overlay
 * Modern minimal navigation with Ba Zi aesthetics
 */

class FullpageNav {
    private overlay: HTMLElement;
    private hamburger: HTMLElement;
    private isOpen: boolean = false;

    constructor() {
        this.overlay = document.getElementById('fullpage-nav');
        this.hamburger = document.getElementById('nav-toggle');

        if (!this.overlay || !this.hamburger) return;

        this.bindEvents();
    }

    private bindEvents() {
        // Hamburger click - toggle overlay (open/close)
        this.hamburger.addEventListener('click', () => {
            if (this.isOpen) {
                this.close();
            } else {
                this.open();
            }
        });

        // Click outside (on backdrop) - close overlay
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) {
                this.close();
            }
        });

        // Escape key - close overlay
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.close();
            }
        });

        // Close overlay when clicking any navigation link
        const navLinks = this.overlay.querySelectorAll('.fullpage-nav__menu a');
        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                this.close();
            });
        });
    }

    private open() {
        this.isOpen = true;
        this.overlay.classList.add('active');
        this.hamburger.classList.add('active');
        document.body.style.overflow = 'hidden'; // Prevent background scroll
    }

    private close() {
        this.isOpen = false;
        this.overlay.classList.remove('active');
        this.hamburger.classList.remove('active');
        document.body.style.overflow = ''; // Restore scroll
    }
}

export default function initFullpageNav() {
    new FullpageNav();
}
