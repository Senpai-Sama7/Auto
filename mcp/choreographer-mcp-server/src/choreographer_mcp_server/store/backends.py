"""Storage backends for CRDT store.

Implements the hybrid storage strategy:
- Redis: For PNCounters and LWW Registers (fast, in-memory)
- RocksDB: For GSets (disk-based, large data)
"""

from __future__ import annotations

import json
from abc import ABC, abstractmethod
from typing import Any, Protocol

import redis.asyncio as redis
import structlog

logger = structlog.get_logger()


class StorageBackend(Protocol):
    """Protocol for storage backends."""

    async def get(self, key: str) -> bytes | None:
        """Get value by key."""
        ...

    async def set(self, key: str, value: bytes) -> None:
        """Set value by key."""
        ...

    async def delete(self, key: str) -> None:
        """Delete key."""
        ...

    async def close(self) -> None:
        """Close backend connection."""
        ...


class RedisBackend:
    """Redis backend for fast, in-memory CRDT operations."""

    def __init__(
        self,
        host: str = "localhost",
        port: int = 6379,
        db: int = 0,
        password: str | None = None,
    ) -> None:
        self.host = host
        self.port = port
        self.db = db
        self.password = password
        self._client: redis.Redis | None = None

    async def connect(self) -> None:
        """Connect to Redis."""
        self._client = redis.Redis(
            host=self.host,
            port=self.port,
            db=self.db,
            password=self.password,
            decode_responses=False,  # We handle encoding
        )
        await self._client.ping()
        logger.info(
            "redis_connected",
            host=self.host,
            port=self.port,
            db=self.db,
        )

    async def get(self, key: str) -> bytes | None:
        """Get value from Redis."""
        if self._client is None:
            raise RuntimeError("Redis not connected")
        value = await self._client.get(key)
        return value if value is None else bytes(value)

    async def set(self, key: str, value: bytes) -> None:
        """Set value in Redis."""
        if self._client is None:
            raise RuntimeError("Redis not connected")
        await self._client.set(key, value)

    async def delete(self, key: str) -> None:
        """Delete key from Redis."""
        if self._client is None:
            raise RuntimeError("Redis not connected")
        await self._client.delete(key)

    async def close(self) -> None:
        """Close Redis connection."""
        if self._client:
            await self._client.close()
            self._client = None

    # Redis-specific operations for CRDTs

    async def hget(self, key: str, field: str) -> bytes | None:
        """Get hash field."""
        if self._client is None:
            raise RuntimeError("Redis not connected")
        value = await self._client.hget(key, field)
        return value if value is None else bytes(value)

    async def hset(self, key: str, field: str, value: bytes) -> None:
        """Set hash field."""
        if self._client is None:
            raise RuntimeError("Redis not connected")
        await self._client.hset(key, field, value)

    async def hgetall(self, key: str) -> dict[str, bytes]:
        """Get all hash fields."""
        if self._client is None:
            raise RuntimeError("Redis not connected")
        result = await self._client.hgetall(key)
        return {k.decode(): bytes(v) for k, v in result.items()}

    async def sadd(self, key: str, *members: bytes) -> int:
        """Add to set."""
        if self._client is None:
            raise RuntimeError("Redis not connected")
        return await self._client.sadd(key, *members)

    async def smembers(self, key: str) -> set[bytes]:
        """Get set members."""
        if self._client is None:
            raise RuntimeError("Redis not connected")
        result = await self._client.smembers(key)
        return {bytes(m) for m in result}


class RocksDBBackend:
    """RocksDB backend for disk-based, large GSet storage."""

    def __init__(self, db_path: str) -> None:
        self.db_path = db_path
        self._db: Any = None

    async def connect(self) -> None:
        """Connect to RocksDB."""
        try:
            import rocksdb

            opts = rocksdb.Options()
            opts.create_if_missing = True
            opts.max_open_files = 300000
            opts.write_buffer_size = 67108864
            opts.max_write_buffer_number = 3
            opts.target_file_size_base = 67108864

            self._db = rocksdb.DB(self.db_path, opts)
            logger.info("rocksdb_connected", db_path=self.db_path)

        except ImportError:
            logger.warning(
                "rocksdb_not_available",
                message="RocksDB not installed, using memory fallback",
            )
            self._db = _MemoryFallback()

    async def get(self, key: str) -> bytes | None:
        """Get value from RocksDB."""
        if self._db is None:
            raise RuntimeError("RocksDB not connected")
        return await _run_in_thread(self._db.get, key.encode())

    async def set(self, key: str, value: bytes) -> None:
        """Set value in RocksDB."""
        if self._db is None:
            raise RuntimeError("RocksDB not connected")
        await _run_in_thread(self._db.put, key.encode(), value)

    async def delete(self, key: str) -> None:
        """Delete key from RocksDB."""
        if self._db is None:
            raise RuntimeError("RocksDB not connected")
        await _run_in_thread(self._db.delete, key.encode())

    async def close(self) -> None:
        """Close RocksDB."""
        if self._db and hasattr(self._db, 'close'):
            await _run_in_thread(self._db.close)
        self._db = None

    async def iterate_prefix(self, prefix: str) -> dict[str, bytes]:
        """Iterate over keys with prefix."""
        if self._db is None:
            raise RuntimeError("RocksDB not connected")

        def _iterate():
            result = {}
            it = self._db.iteritems()
            it.seek(prefix.encode())
            for key, value in it:
                key_str = key.decode()
                if not key_str.startswith(prefix):
                    break
                result[key_str] = bytes(value)
            return result

        return await _run_in_thread(_iterate)


class _MemoryFallback:
    """In-memory fallback when RocksDB is not available."""

    def __init__(self):
        self._data: dict[bytes, bytes] = {}

    def get(self, key: bytes) -> bytes | None:
        return self._data.get(key)

    def put(self, key: bytes, value: bytes) -> None:
        self._data[key] = value

    def delete(self, key: bytes) -> None:
        self._data.pop(key, None)

    def close(self) -> None:
        self._data.clear()


class _MemoryBackend:
    """Pure memory backend for standalone mode (no Redis/RocksDB)."""

    def __init__(self):
        self._data: dict[str, bytes] = {}
        self._hash_data: dict[str, dict[str, bytes]] = {}
        self._set_data: dict[str, set[bytes]] = {}

    async def connect(self) -> None:
        """Connect (no-op for memory backend)."""
        logger.info("memory_backend_connected")

    async def get(self, key: str) -> bytes | None:
        """Get value."""
        return self._data.get(key)

    async def set(self, key: str, value: bytes) -> None:
        """Set value."""
        self._data[key] = value

    async def delete(self, key: str) -> None:
        """Delete key."""
        self._data.pop(key, None)

    async def close(self) -> None:
        """Close and clear memory."""
        self._data.clear()
        self._hash_data.clear()
        self._set_data.clear()

    # Redis-compatible operations
    async def hget(self, key: str, field: str) -> bytes | None:
        """Get hash field."""
        return self._hash_data.get(key, {}).get(field)

    async def hset(self, key: str, field: str, value: bytes) -> None:
        """Set hash field."""
        if key not in self._hash_data:
            self._hash_data[key] = {}
        self._hash_data[key][field] = value

    async def hgetall(self, key: str) -> dict[str, bytes]:
        """Get all hash fields."""
        return dict(self._hash_data.get(key, {}))

    async def sadd(self, key: str, *members: bytes) -> int:
        """Add to set."""
        if key not in self._set_data:
            self._set_data[key] = set()
        initial_len = len(self._set_data[key])
        self._set_data[key].update(members)
        return len(self._set_data[key]) - initial_len

    async def smembers(self, key: str) -> set[bytes]:
        """Get set members."""
        return set(self._set_data.get(key, set()))

    def register_crdt_type(self, key_prefix: str, backend: str) -> None:
        """No-op for memory backend."""
        pass


async def _run_in_thread(func, *args):
    """Run synchronous function in thread pool."""
    import asyncio

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, func, *args)


class HybridBackend:
    """Hybrid Redis + RocksDB backend.

    Uses Redis for:
    - PNCounters (fast increments)
    - LWW Registers (fast reads/writes)

    Uses RocksDB for:
    - GSets (large, grow-only data)
    """

    def __init__(
        self,
        redis_host: str = "localhost",
        redis_port: int = 6379,
        redis_db: int = 0,
        rocksdb_path: str = "./choreographer_rocksdb",
    ) -> None:
        self.redis = RedisBackend(redis_host, redis_port, redis_db)
        self.rocksdb = RocksDBBackend(rocksdb_path)
        self._crdt_type_prefixes: dict[str, str] = {}

    def register_crdt_type(self, key_prefix: str, backend: str) -> None:
        """Register which backend to use for CRDT type.

        Args:
            key_prefix: Key prefix (e.g., "guardrails.", "budget.")
            backend: "redis" or "rocksdb"
        """
        self._crdt_type_prefixes[key_prefix] = backend

    async def connect(self) -> None:
        """Connect both backends."""
        await self.redis.connect()
        await self.rocksdb.connect()

        # Default mappings
        self.register_crdt_type("budget.", "redis")
        self.register_crdt_type("tokens.", "redis")
        self.register_crdt_type("spec.", "redis")
        self.register_crdt_type("phase.", "redis")
        self.register_crdt_type("guardrails.", "rocksdb")
        self.register_crdt_type("test.", "rocksdb")
        self.register_crdt_type("proposals.", "rocksdb")

        logger.info("hybrid_backend_connected")

    async def get(self, key: str) -> bytes | None:
        """Get value from appropriate backend."""
        backend = self._resolve_backend(key)
        if backend == "redis":
            return await self.redis.get(key)
        return await self.rocksdb.get(key)

    async def set(self, key: str, value: bytes) -> None:
        """Set value in appropriate backend."""
        backend = self._resolve_backend(key)
        if backend == "redis":
            await self.redis.set(key, value)
        else:
            await self.rocksdb.set(key, value)

    async def delete(self, key: str) -> None:
        """Delete from appropriate backend."""
        backend = self._resolve_backend(key)
        if backend == "redis":
            await self.redis.delete(key)
        else:
            await self.rocksdb.delete(key)

    async def close(self) -> None:
        """Close both backends."""
        await self.redis.close()
        await self.rocksdb.close()

    def _resolve_backend(self, key: str) -> str:
        """Resolve which backend to use for key."""
        for prefix, backend in self._crdt_type_prefixes.items():
            if key.startswith(prefix):
                return backend
        return "rocksdb"  # Default to RocksDB

    # Backend-specific accessors

    async def redis_hget(self, key: str, field: str) -> bytes | None:
        """Access Redis hash operations."""
        return await self.redis.hget(key, field)

    async def redis_hset(self, key: str, field: str, value: bytes) -> None:
        """Access Redis hash operations."""
        await self.redis.hset(key, field, value)

    async def redis_hgetall(self, key: str) -> dict[str, bytes]:
        """Access Redis hash operations."""
        return await self.redis.hgetall(key)

    async def redis_sadd(self, key: str, *members: bytes) -> int:
        """Access Redis set operations."""
        return await self.redis.sadd(key, *members)

    async def redis_smembers(self, key: str) -> set[bytes]:
        """Access Redis set operations."""
        return await self.redis.smembers(key)

    async def rocksdb_iterate_prefix(self, prefix: str) -> dict[str, bytes]:
        """Access RocksDB iteration."""
        return await self.rocksdb.iterate_prefix(prefix)
