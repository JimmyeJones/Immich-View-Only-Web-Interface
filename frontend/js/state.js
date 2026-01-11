/**
 * Immich Read-Only Display - State Management
 * Centralized state with URL synchronization
 */

const State = {
    // Current state
    _state: {
        // Search & Filters
        query: '',
        personIds: [],
        dateFrom: null,
        dateTo: null,
        mediaType: 'ALL',
        cameraMake: '',
        cameraModel: '',
        country: '',
        city: '',
        
        // Pagination
        page: 1,
        size: 50,
        hasMore: true,
        total: 0,
        
        // Assets
        assets: [],
        
        // UI State
        isLoading: false,
        isLoadingMore: false,
        error: null,
        
        // Lightbox
        lightboxAssetId: null,
        lightboxIndex: -1,
        
        // Cached data
        people: [],
        suggestions: null
    },

    // Subscribers for state changes
    _subscribers: [],

    /**
     * Get current state (read-only copy)
     */
    get() {
        return { ...this._state };
    },

    /**
     * Get specific property
     */
    getProperty(key) {
        return this._state[key];
    },

    /**
     * Update state and notify subscribers
     */
    set(updates) {
        const oldState = { ...this._state };
        this._state = { ...this._state, ...updates };
        
        // Notify subscribers
        this._subscribers.forEach(callback => {
            callback(this._state, oldState);
        });
    },

    /**
     * Subscribe to state changes
     */
    subscribe(callback) {
        this._subscribers.push(callback);
        return () => {
            this._subscribers = this._subscribers.filter(cb => cb !== callback);
        };
    },

    // ========================================================================
    // URL State Synchronization
    // ========================================================================

    /**
     * Get current filters as URL search params
     */
    toURLParams() {
        const params = new URLSearchParams();
        
        if (this._state.query) {
            params.set('q', this._state.query);
        }
        
        if (this._state.personIds.length > 0) {
            params.set('people', this._state.personIds.join(','));
        }
        
        if (this._state.dateFrom) {
            params.set('from', this._state.dateFrom);
        }
        
        if (this._state.dateTo) {
            params.set('to', this._state.dateTo);
        }
        
        if (this._state.mediaType !== 'ALL') {
            params.set('type', this._state.mediaType);
        }
        
        if (this._state.cameraMake) {
            params.set('make', this._state.cameraMake);
        }
        
        if (this._state.cameraModel) {
            params.set('model', this._state.cameraModel);
        }
        
        if (this._state.country) {
            params.set('country', this._state.country);
        }
        
        if (this._state.city) {
            params.set('city', this._state.city);
        }
        
        return params;
    },

    /**
     * Update URL with current state (without page reload)
     */
    syncToURL() {
        const params = this.toURLParams();
        const newUrl = params.toString() 
            ? `${window.location.pathname}?${params.toString()}`
            : window.location.pathname;
        
        window.history.replaceState({}, '', newUrl);
    },

    /**
     * Load state from URL parameters
     */
    loadFromURL() {
        const params = new URLSearchParams(window.location.search);
        
        const updates = {};
        
        if (params.has('q')) {
            updates.query = params.get('q');
        }
        
        if (params.has('people')) {
            updates.personIds = params.get('people').split(',').filter(Boolean);
        }
        
        if (params.has('from')) {
            updates.dateFrom = params.get('from');
        }
        
        if (params.has('to')) {
            updates.dateTo = params.get('to');
        }
        
        if (params.has('type')) {
            updates.mediaType = params.get('type');
        }
        
        if (params.has('make')) {
            updates.cameraMake = params.get('make');
        }
        
        if (params.has('model')) {
            updates.cameraModel = params.get('model');
        }
        
        if (params.has('country')) {
            updates.country = params.get('country');
        }
        
        if (params.has('city')) {
            updates.city = params.get('city');
        }
        
        if (Object.keys(updates).length > 0) {
            this.set(updates);
        }
    },

    // ========================================================================
    // Filter Helpers
    // ========================================================================

    /**
     * Check if any filters are active
     */
    hasActiveFilters() {
        const s = this._state;
        return !!(
            s.query ||
            s.personIds.length > 0 ||
            s.dateFrom ||
            s.dateTo ||
            s.mediaType !== 'ALL' ||
            s.cameraMake ||
            s.cameraModel ||
            s.country ||
            s.city
        );
    },

    /**
     * Get count of active filters
     */
    getActiveFilterCount() {
        const s = this._state;
        let count = 0;
        
        if (s.query) count++;
        if (s.personIds.length > 0) count++;
        if (s.dateFrom || s.dateTo) count++;
        if (s.mediaType !== 'ALL') count++;
        if (s.cameraMake) count++;
        if (s.cameraModel) count++;
        if (s.country || s.city) count++;
        
        return count;
    },

    /**
     * Clear all filters
     */
    clearFilters() {
        this.set({
            query: '',
            personIds: [],
            dateFrom: null,
            dateTo: null,
            mediaType: 'ALL',
            cameraMake: '',
            cameraModel: '',
            country: '',
            city: '',
            page: 1,
            assets: [],
            hasMore: true
        });
        this.syncToURL();
    },

    /**
     * Build search payload for API
     */
    buildSearchPayload(loadMore = false) {
        const s = this._state;
        
        return {
            query: s.query || null,
            personIds: s.personIds.length > 0 ? s.personIds : null,
            takenAfter: s.dateFrom || null,
            takenBefore: s.dateTo || null,
            type: s.mediaType !== 'ALL' ? s.mediaType : null,
            make: s.cameraMake || null,
            model: s.cameraModel || null,
            country: s.country || null,
            city: s.city || null,
            page: loadMore ? s.page + 1 : 1,
            size: s.size
        };
    },

    // ========================================================================
    // Lightbox Navigation
    // ========================================================================

    /**
     * Get previous asset for lightbox
     */
    getPreviousAsset() {
        if (this._state.lightboxIndex <= 0) {
            return null;
        }
        return this._state.assets[this._state.lightboxIndex - 1];
    },

    /**
     * Get next asset for lightbox
     */
    getNextAsset() {
        if (this._state.lightboxIndex >= this._state.assets.length - 1) {
            return null;
        }
        return this._state.assets[this._state.lightboxIndex + 1];
    },

    /**
     * Find asset index by ID
     */
    findAssetIndex(assetId) {
        return this._state.assets.findIndex(a => a.id === assetId);
    }
};

// Export for use in other modules
window.State = State;
