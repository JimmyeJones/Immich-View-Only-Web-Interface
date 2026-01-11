"""
Simple in-memory cache for Immich Read-Only Display.
Caches people list, search suggestions, and other semi-static data.
"""

from datetime import datetime, timedelta
from typing import Any, Optional, Dict
from threading import Lock


class CacheEntry:
    """A single cache entry with expiration."""
    
    def __init__(self, value: Any, ttl: int):
        self.value = value
        self.expires_at = datetime.utcnow() + timedelta(seconds=ttl)
    
    def is_expired(self) -> bool:
        return datetime.utcnow() > self.expires_at


class CacheManager:
    """Thread-safe in-memory cache manager."""
    
    def __init__(self):
        self._cache: Dict[str, CacheEntry] = {}
        self._lock = Lock()
    
    def get(self, key: str) -> Optional[Any]:
        """Get a value from cache if it exists and hasn't expired."""
        with self._lock:
            entry = self._cache.get(key)
            if entry is None:
                return None
            if entry.is_expired():
                del self._cache[key]
                return None
            return entry.value
    
    def set(self, key: str, value: Any, ttl: int = 300) -> None:
        """Set a value in cache with TTL in seconds."""
        with self._lock:
            self._cache[key] = CacheEntry(value, ttl)
    
    def delete(self, key: str) -> bool:
        """Delete a key from cache."""
        with self._lock:
            if key in self._cache:
                del self._cache[key]
                return True
            return False
    
    def clear(self) -> None:
        """Clear all cache entries."""
        with self._lock:
            self._cache.clear()
    
    def cleanup_expired(self) -> int:
        """Remove all expired entries. Returns count of removed entries."""
        with self._lock:
            expired_keys = [
                key for key, entry in self._cache.items() 
                if entry.is_expired()
            ]
            for key in expired_keys:
                del self._cache[key]
            return len(expired_keys)
    
    def stats(self) -> dict:
        """Get cache statistics."""
        with self._lock:
            valid = sum(1 for e in self._cache.values() if not e.is_expired())
            expired = len(self._cache) - valid
            return {
                "total_entries": len(self._cache),
                "valid_entries": valid,
                "expired_entries": expired
            }


# Global cache instance
cache_manager = CacheManager()
