"""Simple, dependency-free auto-tagging using term-frequency keyword extraction
(a lightweight TF-ish scorer; not true TF-IDF since that needs the whole
corpus, but weighted to favor longer, less common-looking words).
"""
from __future__ import annotations

import re
from collections import Counter

STOPWORDS = {
    "the", "a", "an", "and", "or", "but", "if", "then", "else", "of", "to",
    "in", "on", "for", "with", "as", "is", "are", "was", "were", "be", "been",
    "being", "this", "that", "these", "those", "it", "its", "at", "by", "from",
    "into", "about", "over", "after", "before", "between", "out", "up", "down",
    "not", "no", "so", "than", "too", "very", "can", "will", "just", "should",
    "would", "could", "may", "might", "must", "shall", "do", "does", "did",
    "have", "has", "had", "having", "i", "you", "he", "she", "we", "they",
    "them", "his", "her", "our", "your", "their", "there", "here", "what",
    "which", "who", "whom", "how", "why", "when", "where", "all", "any",
    "each", "few", "more", "most", "other", "some", "such", "only", "own",
    "same", "again", "also", "because", "while", "during", "off", "through",
    "above", "below", "under", "further", "once", "both", "on", "per",
}

WORD_RE = re.compile(r"[A-Za-z][A-Za-z\-']{2,}")


def auto_tags(text: str, max_tags: int = 8) -> list[str]:
    """Extract up to max_tags keywords from text via a simple frequency score
    that downweights very common short words and rewards longer terms.
    """
    if not text or not text.strip():
        return []

    words = [w.lower() for w in WORD_RE.findall(text)]
    words = [w for w in words if w not in STOPWORDS and len(w) > 2]
    if not words:
        return []

    freq = Counter(words)
    total = sum(freq.values())

    scored = []
    for word, count in freq.items():
        tf = count / total
        # Reward slightly longer words (proxy for specificity) and frequency.
        score = tf * (1.0 + 0.15 * len(word))
        scored.append((score, word))

    scored.sort(key=lambda x: (-x[0], x[1]))
    return [w for _, w in scored[:max_tags]]
