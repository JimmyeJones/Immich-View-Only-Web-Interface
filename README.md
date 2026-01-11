# Immich Read-Only Display

A lightweight, read-only web interface for browsing photos and videos from your Immich server. This project acts as a search-and-display shell over Immich, not a replacement for its management features.

## Features

✅ **Read-Only Access** - Browse without risk of modifications  
✅ **Full Search Capabilities** - People, cameras, locations, dates, media types  
✅ **Responsive Gallery** - Grid layout with lazy loading and infinite scroll  
✅ **Full-Screen Viewer** - Image zoom, video playback, metadata sidebar  
✅ **URL State** - Shareable and bookmarkable search URLs  
✅ **Dark Mode** - System preference detection with manual toggle  
✅ **Keyboard Navigation** - Arrow keys, escape, info toggle  

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│    Frontend     │────▶│  Backend Proxy  │────▶│     Immich      │
│   (HTML/JS)     │     │    (FastAPI)    │     │      API        │
│                 │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

- **Frontend**: Lightweight SPA with vanilla JavaScript
- **Backend**: Thin FastAPI proxy that secures your Immich API key
- **Immich**: Your photo library remains the single source of truth

## Quick Start

### Prerequisites

- Python 3.10+
- Immich server with API access
- Immich API key (generate in User Settings → API Keys)

### Installation

1. **Clone or download this project**

2. **Set up the backend**

```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate it
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

3. **Configure environment**

```bash
# Copy example config
cp ../.env.example .env

# Edit .env with your settings
# Required: IMMICH_URL and IMMICH_API_KEY
```

4. **Run the backend**

```bash
python run.py
```

5. **Serve the frontend**

For development, you can use Python's built-in server:

```bash
cd ../frontend
python -m http.server 3000
```

Or use any static file server (nginx, Apache, etc.)

6. **Open in browser**

Navigate to `http://localhost:3000`

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `IMMICH_URL` | Yes | `http://localhost:2283` | Your Immich server URL |
| `IMMICH_API_KEY` | Yes | - | Your Immich API key |
| `HOST` | No | `0.0.0.0` | Backend host to bind |
| `PORT` | No | `8000` | Backend port |
| `DEBUG` | No | `false` | Enable debug mode |
| `CORS_ORIGINS` | No | `localhost` | Allowed CORS origins |

### API Key Security

The API key is **never** exposed to the browser. It's stored only on the backend server and used to authenticate requests to Immich.

## API Endpoints

### Assets

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/assets` | GET | Get paginated assets |
| `/api/assets/{id}` | GET | Get asset details |
| `/api/assets/{id}/thumbnail` | GET | Get asset thumbnail |
| `/api/assets/{id}/original` | GET | Get original asset |
| `/api/assets/{id}/video/playback` | GET | Get video for playback |

### Search

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/search` | POST | Search assets with filters |
| `/api/search/suggestions` | GET | Get filter dropdown options |

### People

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/people` | GET | Get list of named people |
| `/api/people/{id}` | GET | Get person details |
| `/api/people/{id}/thumbnail` | GET | Get person face thumbnail |

### System

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Check backend and Immich status |
| `/api/server-info` | GET | Get Immich server info |
| `/api/statistics` | GET | Get asset statistics |

## Search Filters

All search is delegated to Immich's API. The following filters are supported:

- **Text Query**: Searches file names
- **People**: Multi-select person filter
- **Date Range**: Taken date from/to
- **Media Type**: Photos, Videos, or All
- **Camera**: Make and Model
- **Location**: Country and City

Filters are reflected in the URL for sharing and bookmarking:

```
/search?q=vacation&people=abc123,def456&from=2024-01-01&type=IMAGE&country=France
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `←` `→` | Navigate between photos in lightbox |
| `Escape` | Close lightbox |
| `i` | Toggle info sidebar in lightbox |

## Production Deployment

### Using Gunicorn

```bash
cd backend
gunicorn app.main:app -w 4 -k uvicorn.workers.UvicornWorker -b 0.0.0.0:8000
```

### Using Docker (example Dockerfile)

```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Nginx Configuration

```nginx
server {
    listen 80;
    server_name gallery.example.com;

    # Frontend static files
    location / {
        root /var/www/immich-gallery/frontend;
        try_files $uri $uri/ /index.html;
    }

    # Backend API proxy
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Design Principles

This project follows strict design principles:

1. **Immich is the database** - No local storage of assets or metadata
2. **Search is delegated** - All filtering uses Immich's search API
3. **Stateless frontend** - All state derived from API queries
4. **Read-only** - No mutations except session/auth

## Non-Goals

This project intentionally does NOT:

- Upload assets
- Edit metadata
- Tag or recognize people
- Modify albums
- Replace the Immich UI

This is a **viewer**, not a manager.

## License

MIT License - See LICENSE file for details.

## Acknowledgments

- [Immich](https://immich.app/) - The amazing self-hosted photo platform
- [FastAPI](https://fastapi.tiangolo.com/) - Modern Python web framework
