from doccrawler.tagging import auto_tags


def test_auto_tags_returns_keywords():
    text = (
        "Photosynthesis is the process by which plants convert sunlight into "
        "chemical energy. Photosynthesis occurs in chloroplasts and requires "
        "sunlight, water, and carbon dioxide."
    )
    tags = auto_tags(text, max_tags=5)
    assert len(tags) > 0
    assert "photosynthesis" in tags


def test_auto_tags_empty_text():
    assert auto_tags("") == []
    assert auto_tags("   ") == []


def test_auto_tags_excludes_stopwords():
    text = "the a an and or but if then this that with for from"
    assert auto_tags(text) == []
