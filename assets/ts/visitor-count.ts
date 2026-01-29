/**
 * Visitor Count Display
 * Fetches and displays total visitor count from analytics
 */

interface VisitorCountConfig {
    apiEndpoint?: string;
    fallbackCount?: string;
}

class VisitorCounter {
    private sidebarElement: HTMLElement | null;
    private footerElement: HTMLElement | null;
    private config: VisitorCountConfig;

    constructor(config: VisitorCountConfig = {}) {
        this.sidebarElement = document.getElementById('visitor-count-sidebar');
        this.footerElement = document.getElementById('visitor-count-footer');
        this.config = {
            fallbackCount: '0',
            ...config
        };
    }

    /**
     * Format number with K/M suffix
     */
    private formatCount(count: number): string {
        if (count >= 1000000) {
            return (count / 1000000).toFixed(1) + 'M';
        }
        if (count >= 1000) {
            return (count / 1000).toFixed(1) + 'K';
        }
        return count.toString();
    }

    /**
     * Fetch visitor count from analytics API
     */
    private async fetchCount(): Promise<string> {
        if (!this.config.apiEndpoint) {
            return this.config.fallbackCount || '...';
        }

        try {
            const response = await fetch(this.config.apiEndpoint);
            if (!response.ok) {
                throw new Error('Failed to fetch visitor count');
            }

            const data = await response.json();
            const count = data.totalVisitors || data.count || 0;
            return this.formatCount(count);
        } catch (error) {
            console.warn('Failed to load visitor count:', error);
            return this.config.fallbackCount || '...';
        }
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
     * Initialize and fetch count
     */
    public async init(): Promise<void> {
        // Show fallback immediately
        this.updateDisplay(this.config.fallbackCount || '...');

        // Fetch real count if API configured
        if (this.config.apiEndpoint) {
            const count = await this.fetchCount();
            this.updateDisplay(count);
        }
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        const counter = new VisitorCounter({
            // TODO: Add your analytics API endpoint here
            // apiEndpoint: '/api/visitor-count',
            fallbackCount: '0'  // Placeholder until API is configured
        });
        counter.init();
    });
} else {
    const counter = new VisitorCounter({
        fallbackCount: '0'
    });
    counter.init();
}
