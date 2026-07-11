"""Unit tests for the transient-error retry decorator (issue #3).

Pure unit tests: no network, no SDKs, no model downloads. time.sleep and
random jitter are monkeypatched so the backoff sequence is deterministic.
"""

import pytest

import latentscope.util.retry as retry_mod
from latentscope.util.retry import is_transient_error, retry_transient


class FakeAPIError(Exception):
    """Fake SDK error carrying an HTTP status code."""

    def __init__(self, status_code, message=None):
        super().__init__(message or f"http {status_code}")
        self.status_code = status_code


class FakeResponse:
    def __init__(self, status_code):
        self.status_code = status_code


class FakeResponseError(Exception):
    """Fake SDK error carrying the status on a nested response object."""

    def __init__(self, status_code):
        super().__init__(f"http {status_code}")
        self.response = FakeResponse(status_code)


@pytest.fixture
def sleeps(monkeypatch):
    """Patch out real sleeping/jitter; return the recorded delay list."""
    recorded = []
    monkeypatch.setattr(retry_mod.time, "sleep", recorded.append)
    monkeypatch.setattr(retry_mod.random, "uniform", lambda a, b: 0.0)
    return recorded


def make_flaky(exc_factory, failures):
    """Return a function that raises exc_factory() `failures` times, then succeeds."""
    calls = {"n": 0}

    def fn():
        calls["n"] += 1
        if calls["n"] <= failures:
            raise exc_factory()
        return "ok"

    return fn, calls


def test_retries_429_then_succeeds(sleeps):
    fn, calls = make_flaky(lambda: FakeAPIError(429), failures=2)
    result = retry_transient(tries=4, base=1.0)(fn)()
    assert result == "ok"
    assert calls["n"] == 3
    assert sleeps == [1.0, 2.0]  # base * 2**attempt


def test_retries_connection_error(sleeps):
    fn, calls = make_flaky(lambda: ConnectionError("connection reset"), failures=1)
    result = retry_transient(tries=4, base=1.0)(fn)()
    assert result == "ok"
    assert calls["n"] == 2
    assert sleeps == [1.0]


def test_non_transient_401_reraises_immediately(sleeps):
    fn, calls = make_flaky(lambda: FakeAPIError(401), failures=5)
    with pytest.raises(FakeAPIError):
        retry_transient(tries=4, base=1.0)(fn)()
    assert calls["n"] == 1
    assert sleeps == []


def test_exhaustion_reraises_last_error(sleeps):
    fn, calls = make_flaky(lambda: FakeAPIError(503), failures=10)
    with pytest.raises(FakeAPIError) as excinfo:
        retry_transient(tries=4, base=1.0)(fn)()
    assert excinfo.value.status_code == 503
    assert calls["n"] == 4
    assert sleeps == [1.0, 2.0, 4.0]  # no sleep after the final attempt


def test_delay_capped_at_max_delay(sleeps):
    fn, calls = make_flaky(lambda: FakeAPIError(429), failures=3)
    result = retry_transient(tries=4, base=10.0, max_delay=15.0)(fn)()
    assert result == "ok"
    assert sleeps == [10.0, 15.0, 15.0]


def test_retry_line_printed(sleeps, capsys):
    fn, _ = make_flaky(lambda: FakeAPIError(429), failures=1)
    retry_transient(tries=4, base=1.0)(fn)()
    out = capsys.readouterr().out
    assert "retrying after" in out
    assert "attempt 1/4" in out
    assert "sleeping 1.0s" in out


def test_success_passes_args_and_result_through(sleeps):
    @retry_transient(tries=4)
    def add(a, b=0):
        return a + b

    assert add(2, b=3) == 5
    assert sleeps == []


def test_custom_predicate(sleeps):
    fn, calls = make_flaky(lambda: ValueError("flaky"), failures=1)
    result = retry_transient(tries=4, base=1.0, is_transient=lambda e: isinstance(e, ValueError))(
        fn
    )()
    assert result == "ok"
    assert calls["n"] == 2


class TestIsTransientError:
    def test_status_codes(self):
        assert is_transient_error(FakeAPIError(429))
        assert is_transient_error(FakeAPIError(408))
        assert is_transient_error(FakeAPIError(500))
        assert is_transient_error(FakeAPIError(503))
        assert not is_transient_error(FakeAPIError(400))
        assert not is_transient_error(FakeAPIError(401))
        assert not is_transient_error(FakeAPIError(403))
        assert not is_transient_error(FakeAPIError(404))

    def test_status_on_nested_response(self):
        assert is_transient_error(FakeResponseError(502))
        assert not is_transient_error(FakeResponseError(403))

    def test_alternate_status_attribute_spellings(self):
        class HttpStatusError(Exception):
            http_status = 429

        class CodeError(Exception):
            code = 500

        assert is_transient_error(HttpStatusError())
        assert is_transient_error(CodeError())

    def test_non_numeric_code_is_not_a_status(self):
        class SdkError(Exception):
            code = "invalid_api_key"

        assert not is_transient_error(SdkError())

    def test_builtin_network_errors(self):
        assert is_transient_error(ConnectionError("reset"))
        assert is_transient_error(TimeoutError("timed out"))
        assert is_transient_error(OSError("network unreachable"))

    def test_duck_typed_timeout_class_name(self):
        class ReadTimeout(Exception):
            pass

        class APIConnectionError(Exception):
            pass

        assert is_transient_error(ReadTimeout())
        assert is_transient_error(APIConnectionError())

    def test_duck_typed_httpx_style_network_errors(self):
        # httpx raises ConnectError/NetworkError (not builtin OSError, and not
        # named "connectionerror") for DNS failures, refused connections, and
        # proxy resets — all transient at the provider boundary
        class NetworkError(Exception):
            pass

        class ConnectError(NetworkError):
            pass

        class RemoteProtocolError(NetworkError):
            pass

        assert is_transient_error(ConnectError("dns failure"))
        assert is_transient_error(NetworkError("proxy reset"))
        assert is_transient_error(RemoteProtocolError("server disconnected"))

    def test_status_beats_class_name(self):
        # a 4xx carried on a connection-ish class name is still non-transient
        class ConnectError(Exception):
            def __init__(self, status_code):
                self.status_code = status_code

        assert not is_transient_error(ConnectError(401))

    def test_plain_exception_not_transient(self):
        assert not is_transient_error(ValueError("bad input"))
        assert not is_transient_error(KeyError("missing"))


def test_openai_embed_provider_retries(sleeps):
    """Integration-flavored: OpenAIEmbedProvider.embed retries a 429 then succeeds."""
    from latentscope.models.providers.openai import OpenAIEmbedProvider

    class FakeEmbeddingsAPI:
        def __init__(self):
            self.calls = 0

        def create(self, input, model, **kwargs):
            self.calls += 1
            if self.calls == 1:
                raise FakeAPIError(429)

            class Item:
                def __init__(self, embedding):
                    self.embedding = embedding

            class Response:
                data = [Item([0.1, 0.2]) for _ in input]

            return Response()

    class FakeClient:
        embeddings = FakeEmbeddingsAPI()

    provider = OpenAIEmbedProvider("fake-model", {})
    provider.client = FakeClient()
    provider.encoder = None

    embeddings = provider.embed(["hello", "world"])
    assert embeddings == [[0.1, 0.2], [0.1, 0.2]]
    assert provider.client.embeddings.calls == 2
    assert sleeps == [1.0]
