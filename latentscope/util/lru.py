"""A small LRU cache used to bound the server's in-memory caches.

The server keeps DataFrames, embedding models and fitted nearest-neighbor
indexes in memory between requests. Unbounded dicts grow with every dataset
touched (and embedding models can pin GPU memory), so these caches are
capped: the least recently used entry is evicted when a new one would exceed
``maxsize``.
"""

from collections import OrderedDict


class LRUCache:
    """An OrderedDict-based LRU cache with a fixed maximum size.

    Parameters
    ----------
    maxsize : int
        Maximum number of entries to keep. Must be >= 1.
    on_evict : callable or None
        Called with the evicted *value* whenever an entry is dropped to make
        room (not on explicit ``pop``/``clear``). For cached models this can
        release resources; for GPU-backed models simply dropping the
        reference frees CUDA memory once the object is garbage collected.
    """

    def __init__(self, maxsize, on_evict=None):
        if maxsize < 1:
            raise ValueError("maxsize must be >= 1")
        self.maxsize = maxsize
        self.on_evict = on_evict
        self._data = OrderedDict()

    def get(self, key, default=None):
        """Return the cached value (refreshing its recency) or *default*."""
        if key not in self._data:
            return default
        self._data.move_to_end(key)
        return self._data[key]

    def __getitem__(self, key):
        if key not in self._data:
            raise KeyError(key)
        self._data.move_to_end(key)
        return self._data[key]

    def __setitem__(self, key, value):
        if key in self._data:
            self._data.move_to_end(key)
        self._data[key] = value
        while len(self._data) > self.maxsize:
            _, evicted = self._data.popitem(last=False)
            if self.on_evict is not None:
                self.on_evict(evicted)

    def __contains__(self, key):
        return key in self._data

    def __len__(self):
        return len(self._data)

    def pop(self, key, default=None):
        return self._data.pop(key, default)

    def clear(self):
        self._data.clear()

    def keys(self):
        return self._data.keys()
