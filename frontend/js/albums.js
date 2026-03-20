/**
 * Immich Read-Only Display - Albums Component
 * Handles browsing and viewing albums
 */

const Albums = {
    // DOM Elements
    elements: {
        view: null,
        grid: null,
        loading: null,
        emptyState: null,
        errorState: null,
        errorMessage: null,
        retryBtn: null,
        albumDetail: null,
        albumDetailTitle: null,
        albumDetailCount: null,
        albumDetailGallery: null,
        albumDetailLoading: null,
        albumDetailEmpty: null,
        albumDetailError: null,
        albumDetailErrorMsg: null,
        backBtn: null,
        albumLoadMore: null,
        albumLoadMoreBtn: null
    },

    // Currently open album (null = showing grid)
    currentAlbum: null,
    // All assets of the open album (for lightbox navigation)
    currentAlbumAssets: [],

    /**
     * Initialize the Albums component
     */
    init() {
        this.elements.view = document.getElementById('albums-view');
        this.elements.grid = document.getElementById('albums-grid');
        this.elements.loading = document.getElementById('albums-loading');
        this.elements.emptyState = document.getElementById('albums-empty');
        this.elements.errorState = document.getElementById('albums-error');
        this.elements.errorMessage = document.getElementById('albums-error-message');
        this.elements.retryBtn = document.getElementById('albums-retry-btn');
        this.elements.albumDetail = document.getElementById('album-detail');
        this.elements.albumDetailTitle = document.getElementById('album-detail-title');
        this.elements.albumDetailCount = document.getElementById('album-detail-count');
        this.elements.albumDetailGallery = document.getElementById('album-detail-gallery');
        this.elements.albumDetailLoading = document.getElementById('album-detail-loading');
        this.elements.albumDetailEmpty = document.getElementById('album-detail-empty');
        this.elements.albumDetailError = document.getElementById('album-detail-error');
        this.elements.albumDetailErrorMsg = document.getElementById('album-detail-error-message');
        this.elements.backBtn = document.getElementById('album-back-btn');
        this.elements.albumLoadMore = document.getElementById('album-load-more-container');
        this.elements.albumLoadMoreBtn = document.getElementById('album-load-more-btn');

        this.elements.retryBtn?.addEventListener('click', () => this.loadAlbums());
        this.elements.backBtn?.addEventListener('click', () => this.showGrid());
        this.elements.albumLoadMoreBtn?.addEventListener('click', () => this.loadMoreAlbumAssets());
    },

    /**
     * Show the albums view (called when switching to Albums tab)
     */
    show() {
        if (this.elements.view) this.elements.view.hidden = false;
        // If we haven't loaded yet, load now
        if (!this.elements.grid.hasChildNodes() ||
            this.elements.grid.querySelector('.album-card') === null) {
            this.loadAlbums();
        }
    },

    /**
     * Hide the albums view
     */
    hide() {
        if (this.elements.view) this.elements.view.hidden = true;
    },

    /**
     * Load and display all albums
     */
    async loadAlbums() {
        this.showLoading();
        try {
            const data = await API.getAlbums();
            const albums = data.albums || [];

            this.hideLoading();

            if (albums.length === 0) {
                this.showEmpty();
                return;
            }

            this.renderAlbumGrid(albums);
        } catch (error) {
            console.error('Failed to load albums:', error);
            this.showError(error.message);
        }
    },

    /**
     * Render album cards grid
     */
    renderAlbumGrid(albums) {
        this.elements.grid.innerHTML = '';
        this.elements.emptyState.hidden = true;
        this.elements.errorState.hidden = true;
        this.elements.albumDetail.hidden = true;
        this.elements.grid.hidden = false;

        const fragment = document.createDocumentFragment();
        albums.forEach(album => {
            fragment.appendChild(this.createAlbumCard(album));
        });
        this.elements.grid.appendChild(fragment);
    },

    /**
     * Create an album card element
     */
    createAlbumCard(album) {
        const card = document.createElement('div');
        card.className = 'album-card';
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.setAttribute('data-album-id', album.id);

        const assetCount = album.assetCount ?? (album.assets?.length ?? 0);

        // Thumbnail
        const thumbWrapper = document.createElement('div');
        thumbWrapper.className = 'album-thumb';

        if (album.albumThumbnailAssetId || (album.assets && album.assets.length > 0)) {
            const img = document.createElement('img');
            img.alt = album.albumName || 'Album';
            img.loading = 'lazy';
            img.src = API.getAlbumThumbnailUrl(album.id);
            img.onload = () => img.classList.remove('loading');
            img.onerror = () => {
                thumbWrapper.classList.add('album-thumb-fallback');
                img.remove();
                thumbWrapper.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                        <circle cx="8.5" cy="8.5" r="1.5"></circle>
                        <polyline points="21 15 16 10 5 21"></polyline>
                    </svg>`;
            };
            img.className = 'loading';
            thumbWrapper.appendChild(img);
        } else {
            thumbWrapper.classList.add('album-thumb-fallback');
            thumbWrapper.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <circle cx="8.5" cy="8.5" r="1.5"></circle>
                    <polyline points="21 15 16 10 5 21"></polyline>
                </svg>`;
        }

        card.appendChild(thumbWrapper);

        // Info
        const info = document.createElement('div');
        info.className = 'album-info';
        info.innerHTML = `
            <span class="album-name">${this._escapeHtml(album.albumName || 'Unnamed Album')}</span>
            <span class="album-count">${assetCount} ${assetCount === 1 ? 'item' : 'items'}</span>
        `;
        card.appendChild(info);

        card.addEventListener('click', () => this.openAlbum(album));
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.openAlbum(album);
            }
        });

        return card;
    },

    /**
     * Pagination state for album detail
     */
    _albumPage: 1,
    _albumPageSize: 50,
    _albumAllAssets: [],
    _albumHasMore: false,

    /**
     * Open an album and show its assets
     */
    async openAlbum(album) {
        this.currentAlbum = album;
        this._albumPage = 1;
        this._albumAllAssets = [];
        this._albumHasMore = false;

        this.elements.grid.hidden = true;
        this.elements.albumDetail.hidden = false;
        this.elements.albumDetailTitle.textContent = album.albumName || 'Album';
        this.elements.albumDetailCount.textContent = '';
        this.elements.albumDetailGallery.innerHTML = '';
        this.elements.albumDetailLoading.hidden = false;
        this.elements.albumDetailEmpty.hidden = true;
        this.elements.albumDetailError.hidden = true;
        this.elements.albumLoadMore.hidden = true;

        try {
            const data = await API.getAlbum(album.id);
            const assets = data.assets || [];

            this._albumAllAssets = assets;
            this.currentAlbumAssets = assets;

            // Paginate locally
            const pageAssets = assets.slice(0, this._albumPageSize);
            this._albumHasMore = assets.length > this._albumPageSize;

            this.elements.albumDetailLoading.hidden = true;
            this.elements.albumDetailCount.textContent =
                `${assets.length} ${assets.length === 1 ? 'item' : 'items'}`;

            if (assets.length === 0) {
                this.elements.albumDetailEmpty.hidden = false;
                return;
            }

            this._renderAlbumAssets(pageAssets, 0);
            this.elements.albumLoadMore.hidden = !this._albumHasMore;
        } catch (error) {
            console.error('Failed to open album:', error);
            this.elements.albumDetailLoading.hidden = true;
            this.elements.albumDetailError.hidden = false;
            this.elements.albumDetailErrorMsg.textContent =
                error.message || 'Unable to load album.';
        }
    },

    /**
     * Load the next page of album assets
     */
    loadMoreAlbumAssets() {
        const start = this._albumPage * this._albumPageSize;
        const nextAssets = this._albumAllAssets.slice(start, start + this._albumPageSize);
        if (nextAssets.length === 0) {
            this.elements.albumLoadMore.hidden = true;
            return;
        }

        this._albumPage++;
        this._renderAlbumAssets(nextAssets, start);
        this._albumHasMore =
            this._albumAllAssets.length > this._albumPage * this._albumPageSize;
        this.elements.albumLoadMore.hidden = !this._albumHasMore;
    },

    /**
     * Render album asset thumbnails into the detail gallery
     */
    _renderAlbumAssets(assets, startIndex) {
        const fragment = document.createDocumentFragment();
        assets.forEach((asset, i) => {
            fragment.appendChild(this._createAssetItem(asset, startIndex + i));
        });
        this.elements.albumDetailGallery.appendChild(fragment);
    },

    /**
     * Create a single asset thumbnail item for the album detail view
     */
    _createAssetItem(asset, index) {
        const item = document.createElement('div');
        item.className = 'gallery-item';
        item.setAttribute('role', 'button');
        item.setAttribute('tabindex', '0');
        item.setAttribute('data-asset-id', asset.id);
        item.setAttribute('data-index', index);

        const img = document.createElement('img');
        img.className = 'loading';
        img.alt = asset.originalFileName || 'Photo';
        img.loading = 'lazy';
        img.src = API.getThumbnailUrl(asset.id, 'thumbnail');
        img.onload = () => img.classList.remove('loading');
        img.onerror = () => {
            img.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23ccc" width="100" height="100"/><text x="50" y="55" text-anchor="middle" fill="%23999" font-size="12">Error</text></svg>';
        };
        item.appendChild(img);

        if (asset.type === 'VIDEO') {
            const indicator = document.createElement('div');
            indicator.className = 'video-indicator';
            indicator.innerHTML = `
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>`;
            item.appendChild(indicator);
        }

        const overlay = document.createElement('div');
        overlay.className = 'gallery-item-overlay';
        overlay.textContent = this._formatDate(asset.localDateTime || asset.fileCreatedAt);
        item.appendChild(overlay);

        item.addEventListener('click', () => {
            // Use album assets for lightbox navigation
            State.set({
                assets: this.currentAlbumAssets,
                lightboxAssetId: asset.id,
                lightboxIndex: index
            });
            Lightbox.open(asset, index);
        });

        item.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                State.set({
                    assets: this.currentAlbumAssets,
                    lightboxAssetId: asset.id,
                    lightboxIndex: index
                });
                Lightbox.open(asset, index);
            }
        });

        return item;
    },

    /**
     * Return to the album grid from an album detail view
     */
    showGrid() {
        this.currentAlbum = null;
        this.currentAlbumAssets = [];
        this.elements.albumDetail.hidden = true;
        this.elements.grid.hidden = false;
        this.elements.emptyState.hidden = true;
        this.elements.errorState.hidden = true;
    },

    // ========================================================================
    // State helpers
    // ========================================================================

    showLoading() {
        this.elements.loading.hidden = false;
        this.elements.grid.hidden = true;
        this.elements.emptyState.hidden = true;
        this.elements.errorState.hidden = true;
        this.elements.albumDetail.hidden = true;
    },

    hideLoading() {
        this.elements.loading.hidden = true;
    },

    showEmpty() {
        this.elements.loading.hidden = true;
        this.elements.grid.hidden = true;
        this.elements.emptyState.hidden = false;
        this.elements.errorState.hidden = true;
    },

    showError(message) {
        this.elements.loading.hidden = true;
        this.elements.grid.hidden = true;
        this.elements.emptyState.hidden = true;
        this.elements.errorState.hidden = false;
        this.elements.errorMessage.textContent =
            message || 'Unable to load albums. Please try again.';
    },

    // ========================================================================
    // Utility helpers
    // ========================================================================

    _formatDate(dateString) {
        if (!dateString) return '';
        try {
            return new Date(dateString).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        } catch {
            return '';
        }
    },

    _escapeHtml(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
};

// Export for use in other modules
window.Albums = Albums;
