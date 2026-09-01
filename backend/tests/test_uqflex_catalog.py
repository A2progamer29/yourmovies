import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock
from urllib.parse import parse_qs, urlsplit

import pytest

sys.path.insert(0, str(Path(__file__).parents[1]))
import uqflex_catalog as catalog


@pytest.fixture(autouse=True)
def isolated_catalog(monkeypatch, tmp_path):
    monkeypatch.setenv("UQFLEX_PARTNER_KEY", "partner-test-key")
    monkeypatch.setenv("UQFLEX_ENABLE_SSH", "false")
    monkeypatch.delenv("NAS_USER", raising=False)
    monkeypatch.delenv("NAS_HOST", raising=False)
    monkeypatch.setattr(catalog, "CACHE_PATH", str(tmp_path / "catalog.json"))
    monkeypatch.setattr(catalog, "_cache_items", [])
    monkeypatch.setattr(catalog, "_cache_at", 0.0)
    monkeypatch.setattr(catalog, "_last_sync_at", 0.0)
    monkeypatch.setattr(catalog, "_last_sync_error", "")
    monkeypatch.setattr(catalog, "_last_sync_warning", "")
    monkeypatch.setattr(catalog, "_last_raw_count", 0)
    monkeypatch.setattr(catalog, "_active_base", "")
    monkeypatch.setattr(catalog, "partner_bases", lambda: ["https://partner.example/api/partner"])


def test_ssh_target_has_no_embedded_network_defaults(monkeypatch):
    assert catalog._ssh_target() == ""
    monkeypatch.setenv("NAS_USER", "partner")
    monkeypatch.setenv("NAS_HOST", "media.internal.example")
    assert catalog._ssh_target() == "partner@media.internal.example"
    monkeypatch.setenv("NAS_HOST", "-oProxyCommand=bad")
    assert catalog._ssh_target() == ""


class Response:
    def __init__(self, data, status=200):
        self.data, self.status_code = data, status

    def json(self):
        return self.data


def test_paginated_catalog_fetches_every_page_deduplicates_and_persists(monkeypatch):
    calls = []

    def get(url, **_kwargs):
        calls.append(url)
        page = int(parse_qs(urlsplit(url).query).get("page", [1])[0])
        if page == 1:
            return Response({"items": [{"id": "new-3", "title": "Three", "type": "movie"},
                                        {"id": "new-2", "title": "Two", "type": "series"}],
                             "pagination": {"page": 1, "totalPages": 2, "total": 3}})
        return Response({"results": [{"id": "new-1", "title": "One", "type": "anime"}],
                         "page": 2, "totalPages": 2, "total": 3})

    monkeypatch.setattr(catalog.requests, "get", get)
    result = catalog.fetch_items(True)
    assert [item["id"] for item in result] == ["new-3", "new-2", "new-1"]
    assert len(calls) == 2 and catalog._last_raw_count == 3
    assert urlsplit(calls[0]).query == ""
    assert parse_qs(urlsplit(calls[1]).query)["page"] == ["2"]
    assert catalog._last_sync_error == ""
    assert json.loads(Path(catalog.CACHE_PATH).read_text(encoding="utf-8"))[2]["id"] == "new-1"


def test_partial_or_suspicious_catalog_never_erases_healthy_cache(monkeypatch):
    existing = [{"id": str(index), "title": str(index), "type": "movie"} for index in range(10)]
    catalog._cache_items = existing
    monkeypatch.setattr(catalog.requests, "get", lambda *_a, **_k: Response({"items": existing[:2]}))
    assert catalog.fetch_items(True) == existing
    assert "suspicious catalog shrink" in catalog._last_sync_error

    monkeypatch.setattr(catalog.requests, "get", lambda *_a, **_k: Response({"items": existing[:2], "total": 10}))
    assert catalog.fetch_items(True) == existing
    assert "partial catalog" in catalog._last_sync_error or "pagination" in catalog._last_sync_error


def test_pagination_refuses_cross_origin_continuation_with_partner_key(monkeypatch):
    calls = []

    def get(url, **_kwargs):
        calls.append(url)
        return Response({"items": [{"id": "safe", "title": "Safe"}], "next": "https://evil.example/steal"})

    monkeypatch.setattr(catalog.requests, "get", get)
    assert catalog.fetch_items(True)[0]["id"] == "safe"
    assert all(urlsplit(url).hostname == "partner.example" for url in calls)
    assert not any("evil.example" in url for url in calls)


def test_missing_anime_rail_is_fetched_with_explicit_type(monkeypatch):
    calls = []

    def get(url, **_kwargs):
        calls.append(url)
        requested = parse_qs(urlsplit(url).query).get("type", [""])[0]
        if requested == "anime":
            # Some provider versions label every episodic title as `series`;
            # the explicitly requested rail remains authoritative.
            return Response({"items": [{"id": "anime", "title": "Anime", "type": "series"}]})
        if requested == "series":
            return Response({"items": [{"id": "show", "title": "Show", "type": "series"}]})
        return Response({"items": [{"id": "movie", "title": "Movie", "type": "movie"}]})

    monkeypatch.setattr(catalog.requests, "get", get)
    result = catalog.fetch_items(True)
    assert {catalog.item_kind(item) for item in result} == {"movie", "series", "anime"}
    assert any("type=anime" in url for url in calls)


def test_dedicated_anime_endpoint_is_used_when_catalog_filter_is_ignored(monkeypatch):
    calls = []

    def get(url, **_kwargs):
        calls.append(url)
        if urlsplit(url).path.endswith("/v1/animes"):
            return Response({"items": [{"id": "anime", "title": "Anime", "type": "series"}]})
        if "/v1/anime" in urlsplit(url).path:
            return Response({}, status=404)
        # Simulates the production provider returning its generic movie dump
        # even when `type=anime` is present.
        return Response({"items": [{"id": "movie", "title": "Movie", "type": "movie"}]})

    monkeypatch.setattr(catalog.requests, "get", get)
    result = catalog.fetch_items(True)
    assert {catalog.item_kind(item) for item in result} == {"movie", "anime"}
    assert any(urlsplit(url).path.endswith("/v1/animes") for url in calls)


def test_grouping_uses_provider_identity_and_keeps_remakes_separate():
    rows = [
        {"id": "s1", "tmdb_id": 10, "type": "series", "title": "Same", "year": 2000},
        {"id": "s2", "tmdb_id": 10, "type": "tv", "title": "Same", "year": 2001},
        {"id": "remake", "tmdb_id": 20, "type": "show", "title": "Same", "year": 2025},
    ]
    grouped = catalog.group_series_by_title(rows)
    assert len(grouped) == 2
    assert grouped[0]["_variant_ids"] == ["s1", "s2"]
    assert grouped[1]["_variant_ids"] == ["remake"]


def test_type_and_nested_episode_schema_are_normalized_without_source_leaks():
    item = {"id": "anime-1", "mediaType": "anime", "title": "Anime", "cover": "https://image.example/poster.jpg",
            "seasons": [{"number": 2, "episodes": [{"number": 4, "name": "Return", "description": "Story"}]}]}
    doc = catalog.to_media_doc(item, "https://backend.example")
    assert doc["type"] == "anime" and doc["poster_url"].endswith("poster.jpg")
    episode = doc["seasons"][0]["episodes"][0]
    assert episode["ep_number"] == 4 and episode["title"] == "Return"
    assert episode["video_url"].startswith("https://backend.example/api/uqflex/stream?")
    assert "partner-test-key" not in json.dumps(doc)


def test_old_grouped_variant_links_still_resolve(monkeypatch):
    item = {"id": "season-1", "type": "series", "title": "Show", "_variant_ids": ["season-1", "season-2"]}
    monkeypatch.setattr(catalog, "fetch_items", lambda force=False: [item])
    monkeypatch.setattr(catalog, "resolve_full_series_item", lambda value: value)
    assert catalog.find_item("uq_season-2")["id"] == "season-1"


def test_disk_write_is_atomic_and_readable(tmp_path, monkeypatch):
    target = tmp_path / "runtime" / "catalog.json"
    monkeypatch.setattr(catalog, "CACHE_PATH", str(target))
    catalog._write_disk([{"id": "one"}])
    assert catalog._read_disk() == [{"id": "one"}]
    assert list(target.parent.glob("*.tmp")) == []
