"""
Immich Read-Only Display - FastAPI Backend
A thin proxy API for read-only access to Immich assets.
"""

from fastapi import FastAPI, HTTPException, Query, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from contextlib import asynccontextmanager
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field, field_validator
import httpx
import re
from functools import lru_cache
from io import BytesIO

try:
    from PIL import Image
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False

from .config import settings
from .cache import cache_manager


# UUID validation pattern to prevent path traversal attacks
UUID_PATTERN = re.compile(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
    re.IGNORECASE
)


def validate_uuid(value: str, field_name: str = "id") -> str:
    """Validate that a string is a valid UUID to prevent path traversal."""
    if not value or not UUID_PATTERN.match(value):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid {field_name}: must be a valid UUID"
        )
    return value


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    # Validate configuration on startup
    if not settings.immich_api_key:
        print("ERROR: IMMICH_API_KEY is not configured!")
        print(f"Current IMMICH_URL: {settings.immich_url}")
        print("Please set IMMICH_API_KEY environment variable")
    
    # Startup: Initialize HTTP client with proper timeout config
    timeout = httpx.Timeout(30.0, read=120.0)  # Longer read timeout for large files
    app.state.http_client = httpx.AsyncClient(
        base_url=settings.immich_url,
        headers={"x-api-key": settings.immich_api_key},
        timeout=timeout,
        follow_redirects=True
    )
    
    # Test connection to Immich
    try:
        response = await app.state.http_client.get("/api/server/ping")
        if response.status_code == 200:
            print(f"✓ Connected to Immich at {settings.immich_url}")
        else:
            print(f"✗ Immich returned status {response.status_code}")
    except Exception as e:
        print(f"✗ Cannot connect to Immich: {e}")
    
    yield
    # Shutdown: Close HTTP client
    await app.state.http_client.aclose()


app = FastAPI(
    title="Immich Read-Only Display",
    description="A lightweight read-only interface for browsing Immich assets",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/api/docs" if settings.debug else None,  # Disable docs in production
    redoc_url=None
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


def get_client(request: Request) -> httpx.AsyncClient:
    """Dependency to get the HTTP client."""
    return request.app.state.http_client


# ============================================================================
# Pydantic Models
# ============================================================================

class SearchFilters(BaseModel):
    """Search filters model matching Immich's search API."""
    query: Optional[str] = Field(None, max_length=500)
    personIds: Optional[List[str]] = None
    make: Optional[str] = Field(None, max_length=100)
    model: Optional[str] = Field(None, max_length=100)
    country: Optional[str] = Field(None, max_length=100)
    city: Optional[str] = Field(None, max_length=100)
    state: Optional[str] = Field(None, max_length=100)
    takenAfter: Optional[str] = Field(None, pattern=r'^\d{4}-\d{2}-\d{2}')
    takenBefore: Optional[str] = Field(None, pattern=r'^\d{4}-\d{2}-\d{2}')
    type: Optional[str] = Field(None, pattern=r'^(IMAGE|VIDEO|ALL)$')
    page: int = Field(1, ge=1, le=1000)
    size: int = Field(50, ge=1, le=100)
    
    @field_validator('personIds')
    @classmethod
    def validate_person_ids(cls, v):
        if v:
            for pid in v:
                if not UUID_PATTERN.match(pid):
                    raise ValueError(f"Invalid person ID: {pid}")
        return v


class PaginatedResponse(BaseModel):
    """Paginated response wrapper."""
    items: list
    total: int
    page: int
    size: int
    hasMore: bool


# ============================================================================
# Health & Info Endpoints
# ============================================================================

@app.get("/api/health")
async def health_check(client: httpx.AsyncClient = Depends(get_client)):
    """Check backend and Immich connectivity."""
    try:
        response = await client.get("/api/server/ping")
        immich_status = "connected" if response.status_code == 200 else "error"
    except Exception as e:
        immich_status = f"error: {str(e)}"
    
    return {
        "status": "healthy",
        "immich": immich_status,
        "timestamp": datetime.utcnow().isoformat()
    }


@app.get("/api/server-info")
async def get_server_info(client: httpx.AsyncClient = Depends(get_client)):
    """Get Immich server information."""
    try:
        response = await client.get("/api/server/about")
        response.raise_for_status()
        return response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail="Failed to get server info")


# ============================================================================
# People Endpoints
# ============================================================================

@app.get("/api/people")
async def get_people(
    client: httpx.AsyncClient = Depends(get_client),
    withHidden: bool = False
):
    """Get list of all people (cached)."""
    cache_key = f"people_{withHidden}"
    cached = cache_manager.get(cache_key)
    if cached:
        return cached
    
    try:
        response = await client.get("/api/people", params={"withHidden": withHidden})
        response.raise_for_status()
        data = response.json()
        
        # Normalize response - extract people array
        people = data.get("people", data) if isinstance(data, dict) else data
        
        # Sort by name and filter those with names
        named_people = [p for p in people if p.get("name")]
        named_people.sort(key=lambda x: x.get("name", "").lower())
        
        result = {"people": named_people, "total": len(named_people)}
        cache_manager.set(cache_key, result, ttl=300)  # Cache for 5 minutes
        return result
    except httpx.HTTPStatusError as e:
        # Return an empty list instead of failing the whole page
        return {"people": [], "total": 0, "error": f"Failed to get people: {e.response.status_code}"}
    except Exception as e:
        return {"people": [], "total": 0, "error": f"Failed to get people: {str(e)}"}


@app.get("/api/people/{person_id}")
async def get_person(
    person_id: str,
    client: httpx.AsyncClient = Depends(get_client)
):
    """Get a specific person's details."""
    validate_uuid(person_id, "person_id")
    
    try:
        response = await client.get(f"/api/people/{person_id}")
        response.raise_for_status()
        return response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail="Person not found")


@app.get("/api/people/{person_id}/thumbnail")
async def get_person_thumbnail(
    person_id: str,
    client: httpx.AsyncClient = Depends(get_client)
):
    """Get a person's face thumbnail."""
    validate_uuid(person_id, "person_id")
    
    try:
        response = await client.get(f"/api/people/{person_id}/thumbnail")
        response.raise_for_status()
        return StreamingResponse(
            iter([response.content]),
            media_type=response.headers.get("content-type", "image/jpeg"),
            headers={"Cache-Control": "public, max-age=3600"}
        )
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail="Thumbnail not found")


# ============================================================================
# Search Endpoints
# ============================================================================

@app.post("/api/search")
async def search_assets(
    filters: SearchFilters,
    client: httpx.AsyncClient = Depends(get_client)
):
    """
    Search assets using Immich's metadata search API.
    NOTE: Text/filename search is NOT supported by Immich's /api/search/metadata endpoint.
    Only metadata filters (people, camera, location, date, media type) are supported.
    """
    
    # Build the search payload for Immich's /api/search/metadata endpoint
    search_payload = {
        "page": filters.page,
        "size": filters.size,
    }
    
    # NOTE: The 'query' field is intentionally NOT sent to Immich
    # because /api/search/metadata doesn't support text search.
    # Only send actual metadata filter fields that Immich understands.
    
    if filters.personIds and len(filters.personIds) > 0:
        search_payload["personIds"] = filters.personIds
    
    if filters.make:
        search_payload["make"] = filters.make
    
    if filters.model:
        search_payload["model"] = filters.model
    
    if filters.country:
        search_payload["country"] = filters.country
    
    if filters.city:
        search_payload["city"] = filters.city
    
    if filters.state:
        search_payload["state"] = filters.state
    
    if filters.takenAfter:
        search_payload["takenAfter"] = filters.takenAfter
    
    if filters.takenBefore:
        search_payload["takenBefore"] = filters.takenBefore
    
    if filters.type and filters.type != "ALL":
        search_payload["type"] = filters.type
    
    try:
        print(f"DEBUG: Search request - Payload: {search_payload}")
        response = await client.post("/api/search/metadata", json=search_payload)
        response.raise_for_status()
        data = response.json()
        
        print(f"DEBUG: Search response status: {response.status_code}")
        
        # Normalize response based on Immich's actual response structure
        assets = data.get("assets", {})
        items = assets.get("items", [])
        total = assets.get("count", len(items))
        
        # If user entered a text query, filter results client-side
        # This is a fallback since Immich's metadata search doesn't support text search
        if filters.query and items:
            query_lower = filters.query.lower()
            filtered_items = [
                item for item in items
                if (
                    query_lower in str(item.get("originalFileName", "")).lower()
                    or query_lower in str(item.get("exifInfo", {}).get("description", "")).lower()
                    or query_lower in str(item.get("exifInfo", {}).get("model", "")).lower()
                    or query_lower in str(item.get("exifInfo", {}).get("make", "")).lower()
                )
            ]
            total = len(filtered_items)
            items = filtered_items[:filters.size]  # Re-apply pagination on filtered results
        
        print(f"DEBUG: Extracted {len(items)} items, total count: {total}")
        
        # Calculate pagination info
        has_more = len(items) >= filters.size
        
        return PaginatedResponse(
            items=items,
            total=total,
            page=filters.page,
            size=filters.size,
            hasMore=has_more
        )
    except httpx.HTTPStatusError as e:
        error_detail = f"HTTP {e.response.status_code}"
        try:
            error_data = e.response.json()
            error_detail = error_data.get("message", error_data.get("detail", str(error_data)))
        except:
            try:
                error_detail = e.response.text
            except:
                pass
        
        print(f"DEBUG: Search error - Status: {e.response.status_code}, Detail: {error_detail}")
        raise HTTPException(status_code=e.response.status_code, detail=error_detail)
    except Exception as e:
        print(f"DEBUG: Unexpected search error: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=f"Search error: {str(e)}")


@app.get("/api/search/suggestions")
async def get_search_suggestions(
    client: httpx.AsyncClient = Depends(get_client)
):
    """Get search suggestions (camera makes, models, locations) for filter dropdowns."""
    cache_key = "search_suggestions"
    cached = cache_manager.get(cache_key)
    if cached:
        return cached
    
    try:
        response = await client.get("/api/search/suggestions")
        response.raise_for_status()
        data = response.json()
        cache_manager.set(cache_key, data, ttl=600)  # Cache for 10 minutes
        return data
    except httpx.HTTPStatusError:
        # Return empty suggestions if endpoint not available
        return {
            "cameraMake": [],
            "cameraModel": [],
            "country": [],
            "city": [],
            "state": []
        }


# ============================================================================
# Asset Endpoints
# ============================================================================

@app.get("/api/assets")
async def get_assets(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=100),
    client: httpx.AsyncClient = Depends(get_client)
):
    """Get paginated list of all assets (for initial gallery load)."""
    try:
        # Use search with no filters to get all assets
        response = await client.post("/api/search/metadata", json={
            "page": page,
            "size": size
        })
        response.raise_for_status()
        data = response.json()
        
        assets = data.get("assets", {})
        items = assets.get("items", [])
        total = assets.get("count", len(items))
        
        return PaginatedResponse(
            items=items,
            total=total,
            page=page,
            size=size,
            hasMore=len(items) >= size
        )
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail="Failed to get assets")


@app.get("/api/assets/{asset_id}")
async def get_asset(
    asset_id: str,
    client: httpx.AsyncClient = Depends(get_client)
):
    """Get a single asset's full metadata."""
    validate_uuid(asset_id, "asset_id")
    
    try:
        response = await client.get(f"/api/assets/{asset_id}")
        response.raise_for_status()
        return response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail="Asset not found")


@app.get("/api/assets/{asset_id}/thumbnail")
async def get_asset_thumbnail(
    asset_id: str,
    size: str = Query("thumbnail", pattern=r"^(thumbnail|preview)$"),
    client: httpx.AsyncClient = Depends(get_client)
):
    """Get asset thumbnail for grid display with optional size limiting."""
    validate_uuid(asset_id, "asset_id")
    
    try:
        response = await client.get(
            f"/api/assets/{asset_id}/thumbnail",
            params={"size": size}
        )
        response.raise_for_status()
        
        content = response.content
        content_type = response.headers.get("content-type", "image/jpeg")
        
        # Compress image if it exceeds 5MB and PIL is available
        if PIL_AVAILABLE and len(content) > 5 * 1024 * 1024:  # 5MB
            try:
                img = Image.open(BytesIO(content))
                # Convert RGBA to RGB if needed (for JPEG)
                if img.mode == 'RGBA' and 'jpeg' in content_type.lower():
                    rgb_img = Image.new('RGB', img.size, (255, 255, 255))
                    rgb_img.paste(img, mask=img.split()[3])
                    img = rgb_img
                
                # Compress with quality reduction
                output = BytesIO()
                # Start with high quality and reduce if needed
                for quality in [85, 75, 65, 55]:
                    output.seek(0)
                    output.truncate(0)
                    img.save(output, format='JPEG', quality=quality, optimize=True)
                    if output.tell() <= 5 * 1024 * 1024:
                        break
                
                content = output.getvalue()
                content_type = "image/jpeg"
            except Exception as e:
                # If compression fails, return original
                print(f"Warning: Failed to compress image {asset_id}: {e}")
        
        return StreamingResponse(
            iter([content]),
            media_type=content_type,
            headers={
                "Cache-Control": "public, max-age=86400",  # Cache for 24 hours
            }
        )
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail="Thumbnail not found")


@app.get("/api/assets/{asset_id}/original")
async def get_asset_original(
    asset_id: str,
    client: httpx.AsyncClient = Depends(get_client)
):
    """Get original asset for full-screen viewing with proper streaming."""
    validate_uuid(asset_id, "asset_id")
    
    try:
        # Stream the response to avoid loading entire file into memory
        req = client.build_request("GET", f"/api/assets/{asset_id}/original")
        response = await client.send(req, stream=True)
        response.raise_for_status()
        
        async def stream_content():
            async for chunk in response.aiter_bytes(chunk_size=65536):
                yield chunk
            await response.aclose()
        
        return StreamingResponse(
            stream_content(),
            media_type=response.headers.get("content-type", "application/octet-stream"),
            headers={
                "Cache-Control": "public, max-age=3600",
                "Content-Length": response.headers.get("content-length", ""),
            }
        )
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail="Asset not found")


@app.get("/api/assets/{asset_id}/download")
async def download_asset(
    asset_id: str,
    client: httpx.AsyncClient = Depends(get_client)
):
    """Download original asset with attachment headers (keeps streaming)."""
    validate_uuid(asset_id, "asset_id")
    
    try:
        # Block video downloads while allowing photos
        meta_resp = await client.get(f"/api/assets/{asset_id}")
        meta_resp.raise_for_status()
        asset_meta = meta_resp.json()
        if asset_meta.get("type") == "VIDEO":
            raise HTTPException(status_code=403, detail="Video downloads are disabled")

        req = client.build_request("GET", f"/api/assets/{asset_id}/original")
        response = await client.send(req, stream=True)
        response.raise_for_status()

        filename = None
        cd = response.headers.get("content-disposition")
        if cd and "filename=" in cd:
            filename = cd.split("filename=")[-1].strip('"')
        if not filename:
            filename = f"{asset_id}.bin"

        async def stream_content():
            async for chunk in response.aiter_bytes(chunk_size=65536):
                yield chunk
            await response.aclose()
        
        headers = {
            "Content-Disposition": f"attachment; filename=\"{filename}\"",
            "Cache-Control": "public, max-age=3600",
        }
        if "content-length" in response.headers:
            headers["Content-Length"] = response.headers["content-length"]
        if "content-type" in response.headers:
            headers["Content-Type"] = response.headers["content-type"]
        
        return StreamingResponse(
            stream_content(),
            media_type=response.headers.get("content-type", "application/octet-stream"),
            headers=headers
        )
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail="Asset not found")


@app.get("/api/assets/{asset_id}/video/playback")
async def get_video_playback(
    asset_id: str,
    request: Request,
    client: httpx.AsyncClient = Depends(get_client)
):
    """Get video for playback with proper streaming and range support."""
    validate_uuid(asset_id, "asset_id")
    
    # Always send a Range header to encourage partial responses; forward the client's Range if present
    client_range = request.headers.get("range")
    range_header = client_range if client_range else "bytes=0-"
    forward_headers = {"Range": range_header}
    
    try:
        req = client.build_request(
            "GET",
            f"/api/assets/{asset_id}/video/playback",
            headers=forward_headers
        )
        response = await client.send(req, stream=True)
        response.raise_for_status()
        
        async def stream_content():
            async for chunk in response.aiter_bytes(chunk_size=65536):
                yield chunk
            await response.aclose()
        
        # Propagate relevant streaming headers
        headers = {
            "Accept-Ranges": response.headers.get("accept-ranges", "bytes"),
        }
        if "content-length" in response.headers:
            headers["Content-Length"] = response.headers["content-length"]
        if "content-range" in response.headers:
            headers["Content-Range"] = response.headers["content-range"]

        # Respect upstream status (200 for full, 206 for partial)
        return StreamingResponse(
            stream_content(),
            status_code=response.status_code,
            media_type=response.headers.get("content-type", "video/mp4"),
            headers=headers
        )
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail="Video not found")


# ============================================================================
# Statistics & Metadata
# ============================================================================

@app.get("/api/statistics")
async def get_statistics(
    client: httpx.AsyncClient = Depends(get_client)
):
    """Get asset statistics."""
    try:
        response = await client.get("/api/assets/statistics")
        response.raise_for_status()
        return response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail="Failed to get statistics")


# Note: Cache management endpoints removed for security.
# Cache automatically expires based on TTL settings.
