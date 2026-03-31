import importlib.util
import tempfile
import os
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "getouch_orchestrator_pipeline.py"


def _load_module():
    spec = importlib.util.spec_from_file_location("getouch_orchestrator_pipeline", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


def _make_pipeline():
    m = _load_module()
    # Temporarily disable _ensure_db so Pipeline() doesn't fail on missing /app/pipelines/
    orig_ensure = m.Pipeline._ensure_db
    m.Pipeline._ensure_db = lambda self: None
    p = m.Pipeline()
    m.Pipeline._ensure_db = orig_ensure
    # Point DB at a temp file and initialize
    p.db_path = os.path.join(tempfile.mkdtemp(), "test_orchestrator.db")
    p._ensure_db()
    return m, p


def test_mode_classification_text_only():
    m, p = _make_pipeline()
    mode = p._classify_mode("hello there", [], [])
    assert mode == "text_only"


def test_mode_classification_documents():
    m, p = _make_pipeline()
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
    m, p = _make_pipeline()
    mode = p._classify_mode("what is this", [], ["data:image/png;base64,AAA"])
    assert mode == "image_understanding"


def test_chunking_non_empty():
    m, p = _make_pipeline()
    chunks = p._chunk_text("A " * 5000, 800, 100)
    assert len(chunks) > 1
    assert all(isinstance(c, str) and c for c in chunks)


def test_should_search_place_images_travel():
    m, p = _make_pipeline()
    assert p._should_search_place_images("boleh buat itinerary ke kuala lumpur tuk 3 mlm", "text_only")
    assert p._should_search_place_images("recommend tempat makan sedap di Penang", "text_only")
    assert p._should_search_place_images("things to do in Langkawi", "text_only")
    assert p._should_search_place_images("suggest best place for holiday", "tool_required")
    assert p._should_search_place_images("top 5 destinasi pelancongan malaysia", "text_only")
    assert p._should_search_place_images("cadangkan restoran di KL", "text_only")


def test_should_search_place_images_non_travel():
    m, p = _make_pipeline()
    assert not p._should_search_place_images("how to code in python", "text_only")
    assert not p._should_search_place_images("explain quantum physics", "text_only")
    assert not p._should_search_place_images("travel tips", "image_understanding")


def test_format_place_cards_empty():
    m, p = _make_pipeline()
    assert p._format_place_cards([]) == ""


def test_format_place_cards_renders_table():
    m, p = _make_pipeline()
    cards = [
        {"name": "Petronas Twin Towers", "image_url": "https://example.com/petronas.jpg"},
        {"name": "Batu Caves", "image_url": "https://example.com/batu.jpg"},
    ]
    result = p._format_place_cards(cards)
    assert "Petronas Twin Towers" in result
    assert "Batu Caves" in result
    assert "![Petronas Twin Towers]" in result
    assert "|" in result
    assert ":---:" in result
