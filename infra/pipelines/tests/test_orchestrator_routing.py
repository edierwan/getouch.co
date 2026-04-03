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
    assert p._should_search_place_images("buat ilternary tuk ke kunning china tuk 7 hari", "text_only")
    assert p._should_search_place_images("can do iternary to ghauzhau china for 5 night", "text_only")
    assert p._should_search_place_images("buat perancangan 3 malam ke langkawi", "text_only")


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
    assert "![Batu Caves]" in result
    assert "|" in result  # table format
    assert ":---:" in result  # center alignment
    assert "**Petronas Twin Towers**" in result  # bold names


def test_score_image_candidate_positive():
    """Candidate with matching city/country scores high."""
    m, p = _make_pipeline()
    poi = {"display_name": "A Famosa", "canonical_name": "A Famosa Fort, Melaka, Malaysia", "city": "Melaka", "country": "Malaysia"}
    candidate = {"title": "A Famosa Fort in Melaka, Malaysia", "content": "historic fort", "img_src": "https://example.com/famosa.jpg"}
    score = p._score_image_candidate(poi, candidate)
    assert score > 0.5, f"Expected high score, got {score}"


def test_score_image_candidate_wrong_landmark():
    """Candidate mentioning Taj Mahal is rejected for Melaka itinerary."""
    m, p = _make_pipeline()
    poi = {"display_name": "A Famosa", "canonical_name": "A Famosa Fort, Melaka, Malaysia", "city": "Melaka", "country": "Malaysia"}
    candidate = {"title": "Taj Mahal at sunset, India", "content": "beautiful monument in Agra India", "img_src": "https://example.com/tajmahal.jpg"}
    score = p._score_image_candidate(poi, candidate)
    assert score < 0.0, f"Expected negative score for wrong landmark, got {score}"


def test_score_image_candidate_no_context():
    """Candidate with no destination context scores low."""
    m, p = _make_pipeline()
    poi = {"display_name": "Christ Church", "canonical_name": "Christ Church, Melaka, Malaysia", "city": "Melaka", "country": "Malaysia"}
    candidate = {"title": "random building photo", "content": "", "img_src": "https://example.com/random.jpg"}
    score = p._score_image_candidate(poi, candidate)
    assert score < 0.15, f"Expected low score for context-less candidate, got {score}"


# ── Travel itinerary planner tests ──────────────────────────


def test_is_travel_itinerary_positive():
    """Travel itinerary queries are detected correctly."""
    m, p = _make_pipeline()
    assert p._is_travel_itinerary("buat itinerary tuk ke melaka tuk 5 hari")
    assert p._is_travel_itinerary("buat ilternary tuk ke kunning china tuk 7 hari")
    assert p._is_travel_itinerary("create a travel plan for Tokyo")
    assert p._is_travel_itinerary("plan my trip to Bali for 3 days")
    assert p._is_travel_itinerary("5 hari ke langkawi")
    assert p._is_travel_itinerary("buatkan rencana perjalanan ke jogja")
    assert p._is_travel_itinerary("perancangan cuti 4 malam ke sabah")


def test_is_travel_itinerary_negative():
    """Non-itinerary queries are correctly rejected."""
    m, p = _make_pipeline()
    assert not p._is_travel_itinerary("what is the best restaurant in KL")
    assert not p._is_travel_itinerary("explain how airplanes work")
    assert not p._is_travel_itinerary("help me with python code")
    assert not p._is_travel_itinerary("translate this to english")


def test_parse_trip_request_days():
    m, p = _make_pipeline()
    info = p._parse_trip_request("buat itinerary tuk ke melaka tuk 5 hari")
    assert info["days"] == 5
    assert info["nights"] == 4


def test_parse_trip_request_nights():
    m, p = _make_pipeline()
    info = p._parse_trip_request("plan trip to bali for 3 nights")
    assert info["days"] == 4  # 3 nights = 4 days
    assert info["nights"] == 3


def test_parse_trip_request_default():
    m, p = _make_pipeline()
    info = p._parse_trip_request("buat itinerary ke melaka")
    assert info["days"] == 3  # default
    assert info["nights"] == 2


def test_parse_trip_request_clamped():
    m, p = _make_pipeline()
    info = p._parse_trip_request("30 hari ke europe")
    assert info["days"] == 14  # capped at 14


def test_compose_travel_planner_prompt_structure():
    """Travel planner prompt includes all required sections."""
    m, p = _make_pipeline()
    pois = [
        {"display_name": "A Famosa", "canonical_name": "A Famosa Fort, Melaka, Malaysia",
         "city": "Melaka", "country": "Malaysia"},
    ]
    sources = [
        {"id": "src_1", "title": "Melaka Guide", "url": "https://example.com",
         "domain": "example.com", "snippet": "Top things to do in Melaka."},
    ]
    prompt = p._compose_travel_planner_prompt(
        user_message="buat itinerary ke melaka 5 hari",
        trip_info={"days": 5, "nights": 4},
        pois=pois,
        web_sources=sources,
    )
    assert "Melaka" in prompt
    assert "5 days" in prompt or "5 Hari" in prompt
    assert "A Famosa" in prompt
    assert "Ringkasan Perjalanan" in prompt
    assert "Cadangan Makanan" in prompt
    assert "Tips Pengangkutan" in prompt
    assert "Kawasan Penginapan" in prompt
    assert "Anggaran Perbelanjaan" in prompt
    assert "Tips Praktikal" in prompt
    assert "[1]" in prompt  # source citation
    assert "example.com" in prompt
    assert "Do NOT include a Sources" in prompt


def test_format_sources_section():
    m, p = _make_pipeline()
    sources = [
        {"id": "src_1", "title": "Melaka Guide", "url": "https://example.com/melaka",
         "domain": "example.com", "snippet": "stuff"},
        {"id": "src_2", "title": "Travel Tips", "url": "https://travel.com/tips",
         "domain": "travel.com", "snippet": "tips"},
    ]
    result = p._format_sources_section(sources)
    assert "---" in result
    assert "Sumber" in result
    assert "[Melaka Guide](https://example.com/melaka)" in result
    assert "[Travel Tips](https://travel.com/tips)" in result
    assert "example.com" in result
    assert "travel.com" in result


def test_format_sources_section_empty():
    m, p = _make_pipeline()
    assert p._format_sources_section([]) == ""


def test_extract_domain():
    m, p = _make_pipeline()
    assert p._extract_domain("https://www.example.com/page") == "example.com"
    assert p._extract_domain("https://travel.guide.co/tips") == "travel.guide.co"
    assert p._extract_domain("") == ""
