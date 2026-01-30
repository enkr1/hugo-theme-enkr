/**
 * Full-page navigation overlay
 * Modern minimal navigation with Ba Zi aesthetics
 */

class FullpageNav {
    private overlay: HTMLElement;
    private hamburger: HTMLElement;
    private isOpen: boolean = false;
    private lastScrollY: number = 0;
    private scrollTimeout: number | null = null;

    constructor() {
        this.overlay = document.getElementById('fullpage-nav');
        this.hamburger = document.getElementById('nav-toggle');

        if (!this.overlay || !this.hamburger) return;

        this.bindEvents();
        this.initScrollBehavior();
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

    private initScrollBehavior() {
        // Only apply scroll behavior on >= iPad (769px+)
        if (window.innerWidth < 769) return;

        window.addEventListener('scroll', () => {
            const currentScrollY = window.scrollY;

            // Scrolling down - hide hamburger
            if (currentScrollY > this.lastScrollY && currentScrollY > 50) {
                this.hamburger.classList.add('hidden');
            }
            // Scrolling up - show hamburger
            else if (currentScrollY < this.lastScrollY) {
                this.hamburger.classList.remove('hidden');
            }

            this.lastScrollY = currentScrollY;

            // Clear existing timeout
            if (this.scrollTimeout) {
                clearTimeout(this.scrollTimeout);
            }

            // Show hamburger when scrolling stops
            this.scrollTimeout = window.setTimeout(() => {
                this.hamburger.classList.remove('hidden');
            }, 150);
        }, { passive: true });

        // Re-initialize on window resize
        window.addEventListener('resize', () => {
            if (window.innerWidth < 769) {
                this.hamburger.classList.remove('hidden');
            }
        });
    }
}

export default function initFullpageNav() {
    new FullpageNav();
}
