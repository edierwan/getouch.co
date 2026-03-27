import importlib.util
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "getouch_orchestrator_pipeline.py"


def _load_module():
    spec = importlib.util.spec_from_file_location("getouch_orchestrator_pipeline", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


def test_mode_classification_text_only():
    m = _load_module()
    p = m.Pipeline()
    mode = p._classify_mode("hello there", [], [])
    assert mode == "text_only"


def test_mode_classification_documents():
    m = _load_module()
    p = m.Pipeline()
    fake_doc = m.NormalizedFile(
        file_id="1",
        name="contract.pdf",
        mime="application/pdf",
        size=123,
        content=b"abc",
        source_hint="test",
    )
    mode = p._classify_mode("summarize this", [fake_doc], [])
    assert mode == "text_with_documents"


def test_mode_classification_images():
    m = _load_module()
    p = m.Pipeline()
    mode = p._classify_mode("what is this", [], ["data:image/png;base64,AAA"])
    assert mode == "image_understanding"


def test_chunking_non_empty():
    m = _load_module()
    p = m.Pipeline()
    chunks = p._chunk_text("A " * 5000, 800, 100)
    assert len(chunks) > 1
    assert all(isinstance(c, str) and c for c in chunks)
