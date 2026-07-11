"""Retry helper for transient network/API errors (issue #3).

Providers occasionally time out or return rate-limit/server errors under load;
restarting the job resumes fine, so we simply retry the network call with
exponential backoff. Classification is duck-typed (attribute/status inspection)
so no SDK exception classes are imported at module import time, preserving the
lazy-import convention.
"""

import functools
import random
import time

# HTTP statuses considered transient: request timeout, rate limit, server errors
TRANSIENT_STATUSES = frozenset({408, 429}) | frozenset(range(500, 600))

# Attribute names that commonly carry an HTTP status across SDKs
_STATUS_ATTRS = ("status_code", "http_status", "status", "code")


def _extract_status(exc):
    """Best-effort extraction of an HTTP status code from an exception."""
    candidates = [exc, getattr(exc, "response", None)]
    for obj in candidates:
        if obj is None:
            continue
        for attr in _STATUS_ATTRS:
            value = getattr(obj, attr, None)
            if isinstance(value, bool):
                continue
            try:
                status = int(value)
            except (TypeError, ValueError):
                continue
            if 100 <= status <= 599:
                return status
    return None


def is_transient_error(exc):
    """Default predicate: True for network-level errors and 408/429/5xx responses."""
    status = _extract_status(exc)
    if status is not None:
        return status in TRANSIENT_STATUSES
    # Built-in network errors (requests.ConnectionError subclasses OSError too)
    if isinstance(exc, (ConnectionError, TimeoutError, OSError)):
        return True
    # Duck-typed match for SDK timeout/connection/network errors that don't
    # subclass the builtins (e.g. httpx.TimeoutException, httpx.ConnectError,
    # httpx.NetworkError, openai.APIConnectionError)
    for klass in type(exc).__mro__:
        name = klass.__name__.lower()
        if "timeout" in name or "connect" in name or "network" in name:
            return True
    return False


def retry_transient(tries=4, base=1.0, max_delay=30.0, is_transient=None):
    """Decorator retrying the wrapped call on transient errors with backoff.

    Makes up to `tries` attempts. On a transient error (per `is_transient`,
    default `is_transient_error`) it sleeps `base * 2**attempt` seconds plus a
    small jitter (capped at `max_delay`) and retries; non-transient errors and
    exhaustion re-raise immediately.
    """
    if is_transient is None:
        is_transient = is_transient_error

    def decorator(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            for attempt in range(tries):
                try:
                    return fn(*args, **kwargs)
                except Exception as err:
                    if attempt >= tries - 1 or not is_transient(err):
                        raise
                    delay = min(base * 2**attempt, max_delay)
                    delay = min(delay + random.uniform(0, 0.1 * delay), max_delay)
                    # print (not log) so jobs.py's subprocess capture surfaces
                    # it in the job's .log/progress stream
                    print(
                        f"retrying after {err!r} "
                        f"(attempt {attempt + 1}/{tries}, sleeping {delay:.1f}s)",
                        flush=True,
                    )
                    time.sleep(delay)

        return wrapper

    return decorator
