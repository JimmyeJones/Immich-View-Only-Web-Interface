/**
 * Immich Read-Only Display - Lightbox Component
 * Full-screen viewer with metadata sidebar
 */

const Lightbox = {
    // DOM Elements
    elements: {
        lightbox: null,
        overlay: null,
        close: null,
        prev: null,
        next: null,
        media: null,
        image: null,
        video: null,
        loading: null,
        download: null,
        infoToggle: null,
        sidebar: null,
        sidebarClose: null,
        sidebarContent: null
    },

    // Current state
    currentAsset: null,
    currentIndex: -1,

    /**
     * Initialize lightbox
     */
    init() {
        // Cache DOM elements
        this.elements.lightbox = document.getElementById('lightbox');
        this.elements.overlay = document.getElementById('lightbox-overlay');
        this.elements.close = document.getElementById('lightbox-close');
        this.elements.prev = document.getElementById('lightbox-prev');
        this.elements.next = document.getElementById('lightbox-next');
        this.elements.media = document.getElementById('lightbox-media');
        this.elements.image = document.getElementById('lightbox-image');
        this.elements.video = document.getElementById('lightbox-video');
        this.elements.loading = document.getElementById('lightbox-loading');
        this.elements.download = document.getElementById('lightbox-download');
        this.elements.infoToggle = document.getElementById('lightbox-info-toggle');
        this.elements.sidebar = document.getElementById('lightbox-sidebar');
        this.elements.sidebarClose = document.getElementById('sidebar-close');
        this.elements.sidebarContent = document.getElementById('sidebar-content');

        // Setup event listeners
        this.elements.overlay.addEventListener('click', () => this.close());
        this.elements.close.addEventListener('click', () => this.close());
        this.elements.prev.addEventListener('click', () => this.previous());
        this.elements.next.addEventListener('click', () => this.next());
        this.elements.infoToggle.addEventListener('click', () => this.toggleSidebar());
        this.elements.sidebarClose?.addEventListener('click', () => this.toggleSidebar());
        this.elements.download?.addEventListener('click', (e) => {
            // If href is missing, prevent navigation
            if (!this.elements.download.href) {
                e.preventDefault();
            }
        });

        // Keyboard navigation
        document.addEventListener('keydown', (e) => this.handleKeyboard(e));

        // Prevent scroll when lightbox is open
        this.elements.lightbox.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
    },

    /**
     * Open lightbox with asset
     */
    async open(asset, index) {
        this.currentAsset = asset;
        this.currentIndex = index;

        // Update state
        State.set({
            lightboxAssetId: asset.id,
            lightboxIndex: index
        });

        // Show lightbox
        this.elements.lightbox.hidden = false;
        document.body.style.overflow = 'hidden';

        // Show loading
        this.showLoading();

        // Load full asset data if needed
        if (!asset.exifInfo) {
            try {
                const fullAsset = await API.getAsset(asset.id);
                this.currentAsset = fullAsset;
            } catch (error) {
                console.error('Failed to load asset details:', error);
            }
        }

        // Display media
        this.displayMedia(this.currentAsset);

        // Update download link
        this.updateDownloadLink(this.currentAsset);

        // Update navigation state
        this.updateNavigation();

        // Update metadata sidebar
        this.updateMetadata(this.currentAsset);
    },

    /**
     * Close lightbox
     */
    close() {
        this.elements.lightbox.hidden = true;
        document.body.style.overflow = '';

        // Stop video playback
        this.elements.video.pause();
        this.elements.video.src = '';

        // Clear state
        this.currentAsset = null;
        this.currentIndex = -1;

        State.set({
            lightboxAssetId: null,
            lightboxIndex: -1
        });
    },

    /**
     * Navigate to previous asset
     */
    async previous() {
        if (this.currentIndex <= 0) return;

        const assets = State.getProperty('assets');
        const prevAsset = assets[this.currentIndex - 1];
        
        if (prevAsset) {
            await this.open(prevAsset, this.currentIndex - 1);
        }
    },

    /**
     * Navigate to next asset
     */
    async next() {
        const assets = State.getProperty('assets');
        
        if (this.currentIndex >= assets.length - 1) {
            // Try to load more if available
            if (State.getProperty('hasMore')) {
                await Gallery.loadMore();
            }
            return;
        }

        const nextAsset = assets[this.currentIndex + 1];
        
        if (nextAsset) {
            await this.open(nextAsset, this.currentIndex + 1);
        }
    },

    /**
     * Display media (image or video)
     */
    displayMedia(asset) {
        const isVideo = asset.type === 'VIDEO';

        // Hide both initially
        this.elements.image.hidden = true;
        this.elements.video.hidden = true;

        if (isVideo) {
            // Display video
            this.elements.video.preload = 'metadata';
            this.elements.video.poster = API.getThumbnailUrl(asset.id, 'preview');
            this.elements.video.src = API.getVideoPlaybackUrl(asset.id);
            this.elements.video.hidden = false;
            this.elements.video.onloadeddata = () => this.hideLoading();
            this.elements.video.onerror = () => {
                this.hideLoading();
                console.error('Failed to load video');
            };
        } else {
            // Display image
            const img = this.elements.image;
            img.alt = asset.originalFileName || 'Photo';
            img.hidden = false;

            // Load a fast preview first, then swap to full-res once ready
            const previewUrl = API.getThumbnailUrl(asset.id, 'preview');
            const originalUrl = API.getOriginalUrl(asset.id);

            img.onload = () => this.hideLoading();
            img.onerror = () => {
                this.hideLoading();
            };

            img.src = previewUrl;

            // Preload full resolution in the background
            const hiRes = new Image();
            hiRes.onload = () => {
                img.src = originalUrl;
            };
            hiRes.onerror = () => {
                // Keep preview if original fails
            };
            hiRes.src = originalUrl;
        }
    },

    /**
     * Toggle sidebar visibility
     */
    toggleSidebar() {
        const isHidden = this.elements.sidebar.hidden;
        this.elements.sidebar.hidden = !isHidden;
    },

    /**
     * Update navigation buttons state
     */
    updateNavigation() {
        const assets = State.getProperty('assets');
        
        this.elements.prev.disabled = this.currentIndex <= 0;
        this.elements.prev.style.opacity = this.currentIndex <= 0 ? '0.3' : '1';
        
        this.elements.next.disabled = this.currentIndex >= assets.length - 1 && !State.getProperty('hasMore');
        this.elements.next.style.opacity = this.elements.next.disabled ? '0.3' : '1';
    },

    /**
     * Update metadata sidebar
     */
    updateMetadata(asset) {
        // Date & Time
        const datetime = asset.localDateTime || asset.fileCreatedAt;
        document.getElementById('meta-datetime').textContent = datetime 
            ? new Date(datetime).toLocaleString()
            : '-';

        // Camera info
        const exif = asset.exifInfo || {};
        const camera = [exif.make, exif.model].filter(Boolean).join(' ');
        document.getElementById('meta-camera').textContent = camera || '-';
        document.getElementById('meta-lens').textContent = exif.lensModel || '-';

        // EXIF settings
        document.getElementById('meta-focal').textContent = exif.focalLength 
            ? `${exif.focalLength}mm`
            : '-';
        document.getElementById('meta-aperture').textContent = exif.fNumber 
            ? `f/${exif.fNumber}`
            : '-';
        document.getElementById('meta-shutter').textContent = exif.exposureTime 
            ? this.formatShutterSpeed(exif.exposureTime)
            : '-';
        document.getElementById('meta-iso').textContent = exif.iso || '-';

        // Location
        const locationSection = document.getElementById('meta-location-section');
        const location = [exif.city, exif.state, exif.country].filter(Boolean).join(', ');
        if (location) {
            document.getElementById('meta-location').textContent = location;
            locationSection.hidden = false;
        } else {
            locationSection.hidden = true;
        }

        // People
        const peopleSection = document.getElementById('meta-people-section');
        const peopleContainer = document.getElementById('meta-people');
        peopleContainer.innerHTML = '';

        if (asset.people && asset.people.length > 0) {
            asset.people.forEach(person => {
                const chip = document.createElement('span');
                chip.className = 'person-chip';
                chip.innerHTML = `
                    <img src="${API.getPersonThumbnailUrl(person.id)}" alt="${person.name}">
                    <span>${person.name}</span>
                `;
                chip.addEventListener('click', () => {
                    this.close();
                    // Add person filter and search
                    const currentPersonIds = State.getProperty('personIds');
                    if (!currentPersonIds.includes(person.id)) {
                        State.set({ personIds: [...currentPersonIds, person.id], page: 1, assets: [] });
                        Filters.updatePeopleChips([...currentPersonIds, person.id]);
                        Gallery.load();
                    }
                });
                peopleContainer.appendChild(chip);
            });
            peopleSection.hidden = false;
        } else {
            peopleSection.hidden = true;
        }

        // File info
        document.getElementById('meta-filename').textContent = asset.originalFileName || '-';
        
        const dimensions = asset.exifInfo?.exifImageWidth && asset.exifInfo?.exifImageHeight
            ? `${asset.exifInfo.exifImageWidth} × ${asset.exifInfo.exifImageHeight}`
            : '-';
        document.getElementById('meta-dimensions').textContent = dimensions;
        
        document.getElementById('meta-filesize').textContent = asset.exifInfo?.fileSizeInByte
            ? this.formatFileSize(asset.exifInfo.fileSizeInByte)
            : '-';
    },

    /**
     * Format shutter speed
     */
    formatShutterSpeed(seconds) {
        // Handle string fractions like "1/250" or numeric seconds
        let value = seconds;

        if (typeof seconds === 'string') {
            if (seconds.includes('/')) {
                const [num, den] = seconds.split('/').map(parseFloat);
                if (Number.isFinite(num) && Number.isFinite(den) && den !== 0) {
                    value = num / den;
                }
            } else {
                const parsed = parseFloat(seconds);
                if (Number.isFinite(parsed)) {
                    value = parsed;
                }
            }
        }

        if (!Number.isFinite(value) || value <= 0) {
            return '-';
        }

        if (value >= 1) {
            const rounded = value >= 10 ? value.toFixed(0) : value.toFixed(1);
            return `${rounded}s`;
        }
        const fraction = Math.round(1 / value);
        return `1/${fraction}s`;
    },

    /**
     * Format file size
     */
    formatFileSize(bytes) {
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;
        
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }
        
        return `${size.toFixed(1)} ${units[unitIndex]}`;
    },

    /**
     * Update download link for the current asset
     */
    updateDownloadLink(asset) {
        if (!this.elements.download) return;
        const url = API.getOriginalUrl(asset.id);
        this.elements.download.href = url;
        this.elements.download.download = asset.originalFileName || 'asset';
    },

    /**
     * Handle keyboard navigation
     */
    handleKeyboard(e) {
        if (this.elements.lightbox.hidden) return;

        switch (e.key) {
            case 'Escape':
                this.close();
                break;
            case 'ArrowLeft':
                e.preventDefault();
                this.previous();
                break;
            case 'ArrowRight':
                e.preventDefault();
                this.next();
                break;
            case 'i':
                this.toggleSidebar();
                break;
        }
    },

    /**
     * Show loading indicator
     */
    showLoading() {
        this.elements.loading.hidden = false;
    },

    /**
     * Hide loading indicator
     */
    hideLoading() {
        this.elements.loading.hidden = true;
    }
};

// Export for use in other modules
window.Lightbox = Lightbox;
