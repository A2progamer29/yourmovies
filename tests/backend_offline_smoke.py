"""Teste l’autorisation Premium sans démarrer MongoDB ni les services externes."""

import ast
import asyncio
import re
from pathlib import Path
from typing import Optional
from urllib.parse import quote


class HttpError(Exception):
    def __init__(self, status_code, detail):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


class Request:
    base_url = "https://backend.example.test/"


class MediaCollection:
    document = None

    async def find_one(self, query, projection):
        if self.document and query.get("id") == self.document.get("id"):
            return self.document
        return None


class Database:
    media = MediaCollection()


database = Database()
direct_manifest = "https://cdn.example.test/video/playlist.m3u8?token=temporary"


async def direct_url(_video_id):
    return direct_manifest


def entitlement(user):
    levels = {"basic": 1, "standard": 2, "premium": 3, "admin": 4}
    plan = user.get("plan")
    if not plan or user.get("expired"):
        return None
    return {"plan": plan, "level": levels[plan], "until": "2099-01-01T00:00:00+00:00"}


source_path = Path(__file__).resolve().parents[1] / "backend" / "server.py"
tree = ast.parse(source_path.read_text(encoding="utf-8"))
function = next(node for node in tree.body if isinstance(node, ast.AsyncFunctionDef) and node.name == "offline_download_source")
function.decorator_list = []
module = ast.fix_missing_locations(ast.Module(body=[function], type_ignores=[]))
environment = {
    "Optional": Optional,
    "Request": Request,
    "Query": lambda value: value,
    "Depends": lambda value: None,
    "get_current_user": object(),
    "HTTPException": HttpError,
    "PREMIUM_PLAN_LEVELS": {"premium": 3},
    "_effective_premium_entitlement": entitlement,
    "db": database,
    "_resolve_bunny_reference": lambda document: ("library", document.get("bunny_video_id")),
    "_premiere_piste_jouable": lambda document: (None, None),
    "_url_directe": direct_url,
    "quote": quote,
    "re": re,
}
exec(compile(module, str(source_path), "exec"), environment)
route = environment["offline_download_source"]


async def expect_error(expected, **arguments):
    try:
        await route(request=Request(), **arguments)
    except HttpError as error:
        assert error.status_code == expected, (error.status_code, error.detail)
        return error
    raise AssertionError(f"Le code HTTP {expected} était attendu")


async def main():
    global direct_manifest
    database.media.document = {"id": "movie", "type": "movie", "bunny_video_id": "bunny-guid"}

    for plan in ("basic", "standard"):
        error = await expect_error(403, media_id="movie", user={"plan": plan})
        assert "Premium" in error.detail
    await expect_error(403, media_id="movie", user={"plan": "premium", "expired": True})

    result = await route("movie", Request(), user={"plan": "premium"})
    assert result["source"]["kind"] == "hls"
    assert result["source"]["url"] == direct_manifest
    assert result["premium_until"].startswith("2099")

    direct_manifest = None
    await expect_error(409, media_id="movie", user={"plan": "premium"})
    direct_manifest = "https://cdn.example.test/video/playlist.m3u8?token=temporary"

    database.media.document = {
        "id": "file",
        "type": "movie",
        "qualities": [
            {"quality": "1080p", "url": "https://cdn.example.test/1080.mp4"},
            {"quality": "720p", "file_path": "films/été.mp4"},
        ],
    }
    result = await route("file", Request(), user={"plan": "premium"})
    assert result["source"]["kind"] == "file"
    assert result["source"]["url"] == "https://backend.example.test/api/files/films/%C3%A9t%C3%A9.mp4"

    database.media.document = {
        "id": "anime",
        "type": "anime",
        "seasons": [{"season_number": 2, "episodes": [{"ep_number": 7, "bunny_video_id": "episode-guid"}]}],
    }
    await expect_error(400, media_id="anime", user={"plan": "premium"})
    await expect_error(404, media_id="anime", season_number="2", episode_number="8", user={"plan": "premium"})
    result = await route("anime", Request(), season_number="2", episode_number="7", user={"plan": "premium"})
    assert result["source"]["kind"] == "hls"
    assert result["season_number"] == "2"
    assert result["episode_number"] == "7"

    await expect_error(404, media_id="unknown", user={"plan": "premium"})
    print("API : Basic, Standard et abonnements expirés refusés")
    print("API : films HLS/MP4 et épisodes de séries/animés autorisés pour Premium")
    print("API : lecteur protégé sans source directe refusé sans contournement")


if __name__ == "__main__":
    asyncio.run(main())
