"""Tests for the bounded LRU cache used by the server's in-memory caches."""
import pytest

from latentscope.util.lru import LRUCache


class TestLRUCache:
    def test_basic_set_get(self):
        cache = LRUCache(maxsize=2)
        cache["a"] = 1
        assert cache["a"] == 1
        assert cache.get("a") == 1
        assert "a" in cache
        assert len(cache) == 1

    def test_get_missing_returns_default(self):
        cache = LRUCache(maxsize=2)
        assert cache.get("missing") is None
        assert cache.get("missing", 42) == 42
        with pytest.raises(KeyError):
            cache["missing"]

    def test_maxsize_enforced(self):
        cache = LRUCache(maxsize=3)
        for i in range(10):
            cache[i] = i
        assert len(cache) == 3
        assert list(cache.keys()) == [7, 8, 9]

    def test_eviction_order_is_least_recently_used(self):
        cache = LRUCache(maxsize=2)
        cache["a"] = 1
        cache["b"] = 2
        cache["c"] = 3  # evicts "a" (oldest)
        assert "a" not in cache
        assert "b" in cache
        assert "c" in cache

    def test_get_refreshes_recency(self):
        cache = LRUCache(maxsize=2)
        cache["a"] = 1
        cache["b"] = 2
        cache.get("a")  # refresh "a"; now "b" is the LRU entry
        cache["c"] = 3
        assert "a" in cache
        assert "b" not in cache

    def test_getitem_refreshes_recency(self):
        cache = LRUCache(maxsize=2)
        cache["a"] = 1
        cache["b"] = 2
        _ = cache["a"]
        cache["c"] = 3
        assert "a" in cache
        assert "b" not in cache

    def test_on_evict_called_with_evicted_value(self):
        evicted = []
        cache = LRUCache(maxsize=2, on_evict=evicted.append)
        cache["a"] = "value-a"
        cache["b"] = "value-b"
        cache["c"] = "value-c"
        assert evicted == ["value-a"]
        cache["d"] = "value-d"
        assert evicted == ["value-a", "value-b"]

    def test_overwrite_existing_key_does_not_evict(self):
        evicted = []
        cache = LRUCache(maxsize=2, on_evict=evicted.append)
        cache["a"] = 1
        cache["b"] = 2
        cache["a"] = 10  # update, not insert
        assert evicted == []
        assert len(cache) == 2
        assert cache["a"] == 10
        # the update also refreshed "a", so "b" is evicted next
        cache["c"] = 3
        assert evicted == [2]

    def test_pop_and_clear(self):
        cache = LRUCache(maxsize=2)
        cache["a"] = 1
        assert cache.pop("a") == 1
        assert cache.pop("a", "gone") == "gone"
        cache["b"] = 2
        cache.clear()
        assert len(cache) == 0

    def test_maxsize_must_be_positive(self):
        with pytest.raises(ValueError):
            LRUCache(maxsize=0)
