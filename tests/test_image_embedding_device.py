from latentscope.models.providers.image_embedding import _select_device


def test_explicit_cpu_policy_does_not_probe_cuda(monkeypatch):
    class CudaThatMustNotBeCalled:
        @staticmethod
        def is_available():
            raise AssertionError("CUDA should not be probed in forced CPU mode")

    class FakeTorch:
        cuda = CudaThatMustNotBeCalled()

    monkeypatch.setenv("LATENT_SCOPE_DEVICE", "cpu")

    assert _select_device(FakeTorch()) == "cpu"
