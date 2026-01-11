"""
Configuration settings for Immich Read-Only Display.
Uses environment variables for sensitive data.
"""

from pydantic_settings import BaseSettings
from pydantic import field_validator
from typing import List, Union
import os


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # Immich connection
    immich_url: str = "http://localhost:2283"
    immich_api_key: str = ""
    
    # Server settings
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = False
    
    # CORS settings - accepts comma-separated string or list
    cors_origins: List[str] = ["http://localhost:3000", "http://localhost:8000", "http://127.0.0.1:8000"]
    
    # Cache settings
    cache_ttl_people: int = 300  # 5 minutes
    cache_ttl_suggestions: int = 600  # 10 minutes
    
    @field_validator('cors_origins', mode='before')
    @classmethod
    def parse_cors_origins(cls, v):
        """Parse CORS origins from comma-separated string or list."""
        if isinstance(v, str):
            # Handle comma-separated string
            return [origin.strip() for origin in v.split(',') if origin.strip()]
        return v
    
    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "case_sensitive": False,
        "extra": "ignore"
    }


# Global settings instance
settings = Settings()


def validate_settings():
    """Validate that required settings are configured."""
    errors = []
    
    if not settings.immich_url:
        errors.append("IMMICH_URL is required")
    
    if not settings.immich_api_key:
        errors.append("IMMICH_API_KEY is required")
    
    if errors:
        raise ValueError(f"Configuration errors: {', '.join(errors)}")
    
    return True
