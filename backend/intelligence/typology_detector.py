"""Combine independently observed intelligence and behavior typologies."""

from .laundering_detector import detect_laundering_patterns, detect_layering
from .mixer_detector import detect_mixer_activity


def detect_typologies(nodes, edges) -> list[dict]:
    return detect_laundering_patterns(nodes, edges) + detect_layering(edges) + detect_mixer_activity(nodes, edges)