"""
Run the Immich Read-Only Display backend server.
"""

import uvicorn
from app.config import settings, validate_settings


def main():
    """Run the FastAPI application."""
    # Validate configuration
    try:
        validate_settings()
    except ValueError as e:
        print(f"Configuration error: {e}")
        print("Please check your .env file or environment variables.")
        return

    print(f"Starting Immich Read-Only Display...")
    print(f"Connecting to Immich at: {settings.immich_url}")
    print(f"Server running at: http://{settings.host}:{settings.port}")

    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
        log_level="debug" if settings.debug else "info"
    )


if __name__ == "__main__":
    main()
