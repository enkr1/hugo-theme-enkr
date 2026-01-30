/**
 * Visitor Count Display
 * Fetches and displays visitor counts from Firebase Firestore with caching
 * Cache: Total (20min), Article-specific (10min)
 */

import { VisitorCountCache } from './visitor-cache.js';

// Firebase SDK will be loaded dynamically
declare global {
    interface Window {
        firebaseApp?: any;
        firebaseDb?: any;
    }
}

class VisitorCounter {
    private sidebarElement: HTMLElement | null;
    private footerElement: HTMLElement | null;
    private articleSlug: string | null;

    constructor() {
        this.sidebarElement = document.getElementById('visitor-count-sidebar');
        this.footerElement = document.getElementById('visitor-count-footer');

        // Get article slug from meta tag (if on article page)
        const metaSlug = document.querySelector('meta[property="article:slug"]');
        this.articleSlug = metaSlug ? metaSlug.getAttribute('content') : null;
    }

    /**
     * Format number with comma separators
     */
    private formatCount(count: number): string {
        return count.toLocaleString();
    }

    /**
     * Update both sidebar and footer displays
     */
    private updateDisplay(count: string): void {
        if (this.sidebarElement) {
            this.sidebarElement.textContent = count;
        }
        if (this.footerElement) {
            this.footerElement.textContent = count;
        }
    }

    /**
     * Check if running in production
     */
    private isProduction(): boolean {
        return window.location.hostname !== "localhost" &&
               window.location.hostname !== "127.0.0.1";
    }

    /**
     * Initialize Firebase
     */
    private async initFirebase(): Promise<any> {
        // Dynamically import Firebase modules
        const { initializeApp, getApps, getApp } = await import('https://www.gstatic.com/firebasejs/10.11.1/firebase-app.js');
        const { getFirestore } = await import('https://www.gstatic.com/firebasejs/10.11.1/firebase-firestore.js');

        const firebaseConfig = {
            apiKey: "AIzaSyBxexVzGzOqDUGFzHVT_-oYxkqAetlFUSo",
            authDomain: "enkr1.com",
            projectId: "hexo-blog-9ccea",
            storageBucket: "hexo-blog-9ccea.appspot.com",
            messagingSenderId: "71411607593",
            appId: "1:71411607593:web:d0fb244020c34c5895d438",
            measurementId: "G-TJPENBTDNS"
        };

        // Initialize Firebase (singleton pattern)
        if (!window.firebaseApp) {
            window.firebaseApp = !getApps().length ? initializeApp(firebaseConfig) : getApp();
            window.firebaseDb = getFirestore(window.firebaseApp);
        }

        return window.firebaseDb;
    }

    /**
     * Fetch total visitor count from Firebase Firestore
     * Same logic as Hexo: sum all 'count' fields from 'articles' collection
     */
    private async fetchTotalViewCount(): Promise<number> {
        try {
            const db = await this.initFirebase();
            const { collection, getDocs } = await import('https://www.gstatic.com/firebasejs/10.11.1/firebase-firestore.js');

            const articlesCollection = collection(db, 'articles');
            const snapshot = await getDocs(articlesCollection);

            let totalVisitors = 0;
            console.group('[Hugo v2] Firestore visitor sum');
            console.debug('[DEBUG] totalVisitors - before:', totalVisitors);

            snapshot.forEach((doc: any) => {
                const visitorByDoc = doc.data().count || 0;
                totalVisitors += visitorByDoc;
            });

            console.debug('[DEBUG] totalVisitors - after:', totalVisitors);
            console.groupEnd();

            return totalVisitors;
        } catch (error) {
            console.error('[Hugo v2] Error fetching visitor count:', error);
            return 0;
        }
    }

    /**
     * Fetch article-specific visitor count from Firebase Firestore
     */
    private async fetchArticleViewCount(slug: string): Promise<number> {
        try {
            const db = await this.initFirebase();
            const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.11.1/firebase-firestore.js');

            const articleDoc = doc(db, 'articles', slug);
            const snapshot = await getDoc(articleDoc);

            if (snapshot.exists()) {
                const count = snapshot.data().count || 0;
                console.debug('[Hugo v2] Article view count:', slug, count);
                return count;
            }

            console.debug('[Hugo v2] Article not found in Firestore:', slug);
            return 0;
        } catch (error) {
            console.error('[Hugo v2] Error fetching article count:', error);
            return 0;
        }
    }

    /**
     * Get total visitor count (with caching)
     */
    private async getTotalCount(): Promise<number> {
        // Check cache first
        const cached = VisitorCountCache.getTotal();
        if (cached !== null) {
            console.debug('[Cache] Using cached total count:', cached);
            return cached;
        }

        // Cache miss - fetch from Firebase
        console.debug('[Cache] Total count cache miss, fetching from Firebase');
        const count = await this.fetchTotalViewCount();

        // Store in cache
        VisitorCountCache.setTotal(count);

        return count;
    }

    /**
     * Get article-specific visitor count (with caching)
     */
    private async getArticleCount(slug: string): Promise<number> {
        // Check cache first
        const cached = VisitorCountCache.getArticle(slug);
        if (cached !== null) {
            console.debug('[Cache] Using cached article count:', slug, cached);
            return cached;
        }

        // Cache miss - fetch from Firebase
        console.debug('[Cache] Article count cache miss, fetching from Firebase:', slug);
        const count = await this.fetchArticleViewCount(slug);

        // Store in cache
        VisitorCountCache.setArticle(slug, count);

        return count;
    }

    /**
     * Initialize and fetch count
     */
    public async init(): Promise<void> {
        console.group('[Hugo v2] Visitor Count Initialization');

        // Show loading state immediately
        this.updateDisplay('...');

        // Check if running in production
        if (!this.isProduction()) {
            console.debug('[DEBUG] Skipping Firestore requests in local development');
            console.groupEnd();
            return;
        }

        // Fetch count (total or article-specific)
        try {
            let count: number;

            // If on article page and slug is available, could show article-specific count
            // For now, always show total count (article-specific can be added to UI later)
            count = await this.getTotalCount();

            const formattedCount = this.formatCount(count);
            this.updateDisplay(formattedCount);

            console.debug('[DEBUG] Visitor count updated:', formattedCount);
        } catch (error) {
            console.error('[DEBUG] Failed to update visitor count:', error);
            this.updateDisplay('...');
        }

        console.groupEnd();
    }

    /**
     * Public method to get article count (for future use in article metadata)
     */
    public async getArticleViewCount(slug: string): Promise<number> {
        if (!this.isProduction()) {
            return 0;
        }
        return await this.getArticleCount(slug);
    }
}

// Initialize when DOM is ready (same pattern as Hexo)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        const counter = new VisitorCounter();
        counter.init();
    });
} else {
    const counter = new VisitorCounter();
    counter.init();
}

// Export for potential use in other modules
export default VisitorCounter;
