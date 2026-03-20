/**
 * Immich Read-Only Display - Main Application
 * Initializes all components and handles app-level concerns
 */

const App = {
    /**
     * Initialize the application
     */
    async init() {
        console.log('Initializing Immich Read-Only Display...');

        // Setup theme
        this.initTheme();

        // Initialize components
        Gallery.init();
        Lightbox.init();
        Filters.init();
        Albums.init();

        // Setup view tab switching
        this.initViewTabs();

        // Load state from URL
        State.loadFromURL();

        // Check backend health
        await this.checkHealth();

        // Initial load
        await Gallery.load();

        console.log('Application initialized successfully');
    },

    /**
     * Initialize navigation tabs (Photos / Albums)
     */
    initViewTabs() {
        const tabPhotos = document.getElementById('tab-photos');
        const tabAlbums = document.getElementById('tab-albums');
        const photosView = document.getElementById('photos-view');
        const albumsView = document.getElementById('albums-view');
        const filterToggle = document.getElementById('filter-toggle');
        const searchContainer = document.querySelector('.search-container');
        const statusBar = document.getElementById('status-bar');

        tabPhotos.addEventListener('click', () => {
            tabPhotos.classList.add('active');
            tabPhotos.setAttribute('aria-selected', 'true');
            tabAlbums.classList.remove('active');
            tabAlbums.setAttribute('aria-selected', 'false');
            photosView.hidden = false;
            albumsView.hidden = true;
            // Show filters and search for photos view
            if (filterToggle) filterToggle.hidden = false;
            if (searchContainer) searchContainer.style.display = '';
            if (statusBar) statusBar.hidden = false;
        });

        tabAlbums.addEventListener('click', () => {
            tabAlbums.classList.add('active');
            tabAlbums.setAttribute('aria-selected', 'true');
            tabPhotos.classList.remove('active');
            tabPhotos.setAttribute('aria-selected', 'false');
            photosView.hidden = true;
            albumsView.hidden = false;
            // Hide filters and search for albums view
            if (filterToggle) filterToggle.hidden = true;
            if (searchContainer) searchContainer.style.display = 'none';
            if (statusBar) statusBar.hidden = true;
            Albums.show();
        });
    },

    /**
     * Initialize theme (dark/light mode)
     */
    initTheme() {
        const themeToggle = document.getElementById('theme-toggle');
        
        // Check for saved preference or system preference
        const savedTheme = localStorage.getItem('theme');
        const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        
        if (savedTheme) {
            document.documentElement.setAttribute('data-theme', savedTheme);
        } else if (systemPrefersDark) {
            document.documentElement.setAttribute('data-theme', 'dark');
        }

        // Theme toggle handler
        themeToggle.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
        });

        // Listen for system theme changes
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            if (!localStorage.getItem('theme')) {
                document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
            }
        });
    },

    /**
     * Check backend health
     */
    async checkHealth() {
        try {
            const health = await API.getHealth();
            console.log('Backend health:', health);
            
            if (health.immich !== 'connected') {
                console.warn('Immich connection issue:', health.immich);
            }
        } catch (error) {
            console.error('Backend health check failed:', error);
            // Show error but continue - let the gallery show the error
        }
    }
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    App.init().catch(error => {
        console.error('Failed to initialize application:', error);
    });
});

// Export for debugging
window.App = App;
