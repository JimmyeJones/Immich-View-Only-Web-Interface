/**
 * Immich Read-Only Display - API Client
 * Handles all communication with the backend proxy
 */

const API = {
    baseUrl: '/api',

    /**
     * Generic fetch wrapper with error handling
     */
    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        
        const config = {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        };

        try {
            const response = await fetch(url, config);
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new APIError(
                    errorData.detail || `HTTP ${response.status}`,
                    response.status
                );
            }

            // Handle streaming responses (images, videos)
            if (options.blob) {
                return response.blob();
            }

            return response.json();
        } catch (error) {
            if (error instanceof APIError) {
                throw error;
            }
            throw new APIError(`Network error: ${error.message}`, 0);
        }
    },

    /**
     * GET request
     */
    async get(endpoint, params = {}) {
        const searchParams = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
            if (value !== null && value !== undefined && value !== '') {
                searchParams.append(key, value);
            }
        });
        
        const queryString = searchParams.toString();
        const url = queryString ? `${endpoint}?${queryString}` : endpoint;
        
        return this.request(url);
    },

    /**
     * POST request
     */
    async post(endpoint, data = {}) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    // ========================================================================
    // Health & Info
    // ========================================================================

    async getHealth() {
        return this.get('/health');
    },

    async getServerInfo() {
        return this.get('/server-info');
    },

    // ========================================================================
    // Assets
    // ========================================================================

    async getAssets(page = 1, size = 50) {
        return this.get('/assets', { page, size });
    },

    async getAsset(assetId) {
        return this.get(`/assets/${assetId}`);
    },

    getThumbnailUrl(assetId, size = 'thumbnail') {
        return `${this.baseUrl}/assets/${assetId}/thumbnail?size=${size}`;
    },

    getOriginalUrl(assetId) {
        return `${this.baseUrl}/assets/${assetId}/original`;
    },

    getDownloadUrl(assetId) {
        return `${this.baseUrl}/assets/${assetId}/download`;
    },

    getVideoPlaybackUrl(assetId) {
        return `${this.baseUrl}/assets/${assetId}/video/playback`;
    },

    // ========================================================================
    // Search
    // ========================================================================

    async search(filters) {
        return this.post('/search', filters);
    },

    async getSearchSuggestions() {
        return this.get('/search/suggestions');
    },

    // ========================================================================
    // People
    // ========================================================================

    async getPeople(withHidden = false) {
        return this.get('/people', { withHidden });
    },

    async getPerson(personId) {
        return this.get(`/people/${personId}`);
    },

    getPersonThumbnailUrl(personId) {
        return `${this.baseUrl}/people/${personId}/thumbnail`;
    },

    // ========================================================================
    // Statistics
    // ========================================================================

    async getStatistics() {
        return this.get('/statistics');
    }
};

/**
 * Custom API Error class
 */
class APIError extends Error {
    constructor(message, status) {
        super(message);
        this.name = 'APIError';
        this.status = status;
    }
}

// Export for use in other modules
window.API = API;
window.APIError = APIError;
