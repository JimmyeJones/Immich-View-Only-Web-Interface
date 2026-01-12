/**
 * Immich Read-Only Display - Filters Component
 * Handles all filter UI and interactions
 */

const Filters = {
    // DOM Elements
    elements: {
        filterPanel: null,
        filterToggle: null,
        filterBadge: null,
        clearFilters: null,
        applyFilters: null,
        searchInput: null,
        searchBtn: null,
        dateFrom: null,
        dateTo: null,
        mediaTypeRadios: null,
        cameraMake: null,
        cameraModel: null,
        locationCountry: null,
        locationCity: null,
        peopleChips: null
    },

    // Debounce timer
    searchDebounce: null,

    /**
     * Initialize filters
     */
    init() {
        // Cache DOM elements
        this.elements.filterPanel = document.getElementById('filter-panel');
        this.elements.filterToggle = document.getElementById('filter-toggle');
        this.elements.filterBadge = document.getElementById('filter-badge');
        this.elements.clearFilters = document.getElementById('clear-filters');
        this.elements.applyFilters = document.getElementById('apply-filters');
        this.elements.searchInput = document.getElementById('search-input');
        this.elements.searchBtn = document.getElementById('search-btn');
        this.elements.dateFrom = document.getElementById('date-from');
        this.elements.dateTo = document.getElementById('date-to');
        this.elements.cameraMake = document.getElementById('camera-make');
        this.elements.cameraModel = document.getElementById('camera-model');
        this.elements.locationCountry = document.getElementById('location-country');
        this.elements.locationCity = document.getElementById('location-city');
        this.elements.peopleChips = document.getElementById('people-chips');

        // Setup event listeners
        this.setupEventListeners();

        // Load filter options
        this.loadPeople();
        this.loadSuggestions();

        // Initialize from URL
        this.initFromState();

        // Subscribe to state changes
        State.subscribe((newState, oldState) => {
            this.onStateChange(newState, oldState);
        });
    },

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Filter panel toggle
        this.elements.filterToggle.addEventListener('click', () => this.togglePanel());

        // Clear filters
        this.elements.clearFilters.addEventListener('click', () => this.clearAll());

        // Apply filters button
        this.elements.applyFilters.addEventListener('click', () => this.apply());

        // Search input with debounce
        this.elements.searchInput.addEventListener('input', (e) => {
            clearTimeout(this.searchDebounce);
            this.searchDebounce = setTimeout(() => {
                State.set({ query: e.target.value, page: 1, assets: [], hasMore: true });
                Gallery.load();
            }, 500);
        });

        this.elements.searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                clearTimeout(this.searchDebounce);
                State.set({ query: e.target.value, page: 1, assets: [], hasMore: true });
                Gallery.load();
            }
        });

        this.elements.searchBtn.addEventListener('click', () => {
            clearTimeout(this.searchDebounce);
            State.set({ query: this.elements.searchInput.value, page: 1, assets: [], hasMore: true });
            Gallery.load();
        });

        // Date filters
        this.elements.dateFrom.addEventListener('change', (e) => {
            State.set({ dateFrom: e.target.value || null, page: 1, assets: [] });
            Gallery.load();
        });

        this.elements.dateTo.addEventListener('change', (e) => {
            State.set({ dateTo: e.target.value || null, page: 1, assets: [] });
            Gallery.load();
        });

        // Media type radios
        document.querySelectorAll('input[name="media-type"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                State.set({ mediaType: e.target.value, page: 1, assets: [] });
                Gallery.load();
            });
        });

        // Camera selects
        this.elements.cameraMake.addEventListener('change', (e) => {
            State.set({ cameraMake: e.target.value, page: 1, assets: [] });
            Gallery.load();
        });

        this.elements.cameraModel.addEventListener('change', (e) => {
            State.set({ cameraModel: e.target.value, page: 1, assets: [] });
            Gallery.load();
        });

        // Location selects
        this.elements.locationCountry.addEventListener('change', (e) => {
            State.set({ country: e.target.value, page: 1, assets: [] });
            Gallery.load();
        });

        this.elements.locationCity.addEventListener('change', (e) => {
            State.set({ city: e.target.value, page: 1, assets: [] });
            Gallery.load();
        });
    },

    /**
     * Toggle filter panel visibility
     */
    togglePanel() {
        const isHidden = this.elements.filterPanel.hidden;
        this.elements.filterPanel.hidden = !isHidden;
    },

    /**
     * Show filter panel (open it)
     */
    showPanel() {
        this.elements.filterPanel.hidden = false;
    },

    /**
     * Apply current filters
     */
    apply() {
        State.set({ page: 1, assets: [], hasMore: true });
        Gallery.load();
        
        // Close panel on mobile
        if (window.innerWidth < 768) {
            this.elements.filterPanel.hidden = true;
        }
    },

    /**
     * Clear all filters
     */
    clearAll() {
        // Reset form elements
        this.elements.searchInput.value = '';
        this.elements.dateFrom.value = '';
        this.elements.dateTo.value = '';
        this.elements.cameraMake.value = '';
        this.elements.cameraModel.value = '';
        this.elements.locationCountry.value = '';
        this.elements.locationCity.value = '';
        document.querySelector('input[name="media-type"][value="ALL"]').checked = true;

        // Clear people selections
        this.elements.peopleChips.querySelectorAll('.person-chip').forEach(chip => {
            chip.classList.remove('selected');
        });

        // Clear state
        State.clearFilters();
        Gallery.load();
    },

    /**
     * Initialize filter UI from current state
     */
    initFromState() {
        const state = State.get();

        if (state.query) {
            this.elements.searchInput.value = state.query;
        }

        if (state.dateFrom) {
            this.elements.dateFrom.value = state.dateFrom;
        }

        if (state.dateTo) {
            this.elements.dateTo.value = state.dateTo;
        }

        if (state.mediaType) {
            const radio = document.querySelector(`input[name="media-type"][value="${state.mediaType}"]`);
            if (radio) radio.checked = true;
        }

        if (state.cameraMake) {
            this.elements.cameraMake.value = state.cameraMake;
        }

        if (state.cameraModel) {
            this.elements.cameraModel.value = state.cameraModel;
        }

        if (state.country) {
            this.elements.locationCountry.value = state.country;
        }

        if (state.city) {
            this.elements.locationCity.value = state.city;
        }
    },

    /**
     * Handle state changes
     */
    onStateChange(newState, oldState) {
        // Update filter badge
        const count = State.getActiveFilterCount();
        this.elements.filterBadge.textContent = count;
        this.elements.filterBadge.hidden = count === 0;
    },

    /**
     * Load people for filter chips
     */
    async loadPeople() {
        try {
            const response = await API.getPeople();
            const people = response.people || [];
            
            State.set({ people });
            this.renderPeopleChips(people);
        } catch (error) {
            console.error('Failed to load people:', error);
            this.elements.peopleChips.innerHTML = '<div class="loading-placeholder">Failed to load people</div>';
        }
    },

    /**
     * Render people filter chips
     */
    renderPeopleChips(people) {
        this.elements.peopleChips.innerHTML = '';

        if (people.length === 0) {
            this.elements.peopleChips.innerHTML = '<div class="loading-placeholder">No people found</div>';
            return;
        }

        const selectedIds = State.getProperty('personIds');

        people.forEach(person => {
            const chip = document.createElement('button');
            chip.className = 'person-chip';
            chip.setAttribute('data-person-id', person.id);
            
            if (selectedIds.includes(person.id)) {
                chip.classList.add('selected');
            }

            chip.innerHTML = `
                <img src="${API.getPersonThumbnailUrl(person.id)}" alt="${person.name}" onerror="this.style.display='none'">
                <span>${person.name}</span>
            `;

            chip.addEventListener('click', () => this.togglePerson(person.id));
            this.elements.peopleChips.appendChild(chip);
        });
    },

    /**
     * Toggle person selection
     */
    togglePerson(personId) {
        const currentIds = State.getProperty('personIds');
        let newIds;

        if (currentIds.includes(personId)) {
            newIds = currentIds.filter(id => id !== personId);
        } else {
            newIds = [...currentIds, personId];
        }

        State.set({ personIds: newIds, page: 1, assets: [] });
        this.updatePeopleChips(newIds);
        Gallery.load();
    },

    /**
     * Update people chips selection state
     */
    updatePeopleChips(selectedIds) {
        this.elements.peopleChips.querySelectorAll('.person-chip').forEach(chip => {
            const personId = chip.getAttribute('data-person-id');
            chip.classList.toggle('selected', selectedIds.includes(personId));
        });
        
        // Update unnamed person banners at the top
        this.updateUnnamedPersonBanners(selectedIds);
    },

    /**
     * Update banners for unnamed people filters
     */
    updateUnnamedPersonBanners(selectedIds) {
        const activeFiltersContainer = document.getElementById('active-filters');
        if (!activeFiltersContainer) return;
        
        // Get list of named people IDs
        const namedPeopleIds = State.getProperty('people').map(p => p.id);
        
        // Find unnamed selected people (those in selectedIds but not in namedPeopleIds)
        const unnamedSelectedIds = selectedIds.filter(id => !namedPeopleIds.includes(id));
        
        // Remove existing unnamed person banners
        activeFiltersContainer.querySelectorAll('.unnamed-person-banner').forEach(banner => banner.remove());
        
        // Add banners for each unnamed person
        unnamedSelectedIds.forEach(personId => {
            const banner = document.createElement('div');
            banner.className = 'filter-banner unnamed-person-banner';
            banner.setAttribute('data-person-id', personId);
            
            banner.innerHTML = `
                <span>Filtering by: Unnamed Person</span>
                <button class="banner-close" aria-label="Remove filter">
                    <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            `;
            
            banner.querySelector('.banner-close').addEventListener('click', () => {
                // Remove this person from filters
                const currentIds = State.getProperty('personIds');
                const newIds = currentIds.filter(id => id !== personId);
                State.set({ personIds: newIds, page: 1, assets: [] });
                this.updatePeopleChips(newIds);
                Gallery.load();
            });
            
            activeFiltersContainer.appendChild(banner);
        });
    },

    /**
     * Load search suggestions (cameras, locations)
     */
    async loadSuggestions() {
        try {
            const suggestions = await API.getSearchSuggestions();
            State.set({ suggestions });
            this.populateSuggestionDropdowns(suggestions);
        } catch (error) {
            console.error('Failed to load suggestions:', error);
        }
    },

    /**
     * Populate dropdown selects with suggestions
     */
    populateSuggestionDropdowns(suggestions) {
        // Camera makes
        if (suggestions.cameraMake) {
            this.populateSelect(this.elements.cameraMake, suggestions.cameraMake, 'Any make');
        }

        // Camera models
        if (suggestions.cameraModel) {
            this.populateSelect(this.elements.cameraModel, suggestions.cameraModel, 'Any model');
        }

        // Countries
        if (suggestions.country) {
            this.populateSelect(this.elements.locationCountry, suggestions.country, 'Any country');
        }

        // Cities
        if (suggestions.city) {
            this.populateSelect(this.elements.locationCity, suggestions.city, 'Any city');
        }

        // Re-apply state values after populating
        const state = State.get();
        if (state.cameraMake) this.elements.cameraMake.value = state.cameraMake;
        if (state.cameraModel) this.elements.cameraModel.value = state.cameraModel;
        if (state.country) this.elements.locationCountry.value = state.country;
        if (state.city) this.elements.locationCity.value = state.city;
    },

    /**
     * Populate a select element with options
     */
    populateSelect(select, options, placeholder) {
        select.innerHTML = `<option value="">${placeholder}</option>`;
        
        options.forEach(option => {
            if (option) {
                const opt = document.createElement('option');
                opt.value = option;
                opt.textContent = option;
                select.appendChild(opt);
            }
        });
    }
};

// Export for use in other modules
window.Filters = Filters;
