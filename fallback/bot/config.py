from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv


def _required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(
            f"[YM-CONFIG-MISSING] La variable {name} est obligatoire. "
            "Ajoute-la dans bot/.env puis redémarre complètement le bot."
        )
    return value


def _optional_id(name: str) -> int | None:
    value = os.environ.get(name, "").strip()
    if not value:
        return None
    try:
        return int(value)
    except ValueError as exc:
        raise RuntimeError(
            f"[YM-CONFIG-ID] {name} doit contenir uniquement l’identifiant numérique Discord."
        ) from exc


def _id_set(name: str) -> frozenset[int]:
    raw = os.environ.get(name, "")
    try:
        return frozenset(int(value.strip()) for value in raw.split(",") if value.strip())
    except ValueError as exc:
        raise RuntimeError(
            f"[YM-CONFIG-ROLE-IDS] {name} doit être une liste d’identifiants séparés par des virgules."
        ) from exc


@dataclass(frozen=True)
class Settings:
    discord_token: str
    guild_id: int
    api_base_url: str
    service_key: str
    bump_channel_id: int
    disboard_bot_id: int
    support_category_id: int | None
    payment_category_id: int | None
    other_category_id: int | None
    staff_role_ids: frozenset[int]
    openai_api_key: str | None
    openai_model: str | None
    ai_enabled: bool
    ai_channel_cooldown_seconds: int
    ai_history_limit: int

    @classmethod
    def from_env(cls) -> "Settings":
        load_dotenv()
        return cls(
            discord_token=_required("DISCORD_TOKEN"),
            guild_id=int(_required("DISCORD_GUILD_ID")),
            api_base_url=_required("YOURMOVIES_API_URL").rstrip("/"),
            service_key=_required("DISCORD_SERVICE_KEY"),
            bump_channel_id=int(os.environ.get("DISCORD_BUMP_CHANNEL_ID", "1528334031605862490")),
            disboard_bot_id=int(os.environ.get("DISBOARD_BOT_ID", "302050872383242240")),
            support_category_id=_optional_id("DISCORD_SUPPORT_CATEGORY_ID"),
            payment_category_id=_optional_id("DISCORD_PAYMENT_CATEGORY_ID"),
            other_category_id=_optional_id("DISCORD_OTHER_CATEGORY_ID"),
            staff_role_ids=_id_set("DISCORD_STAFF_ROLE_IDS"),
            openai_api_key=os.environ.get("OPENAI_API_KEY") or None,
            openai_model=os.environ.get("OPENAI_MODEL") or None,
            ai_enabled=os.environ.get("TICKET_AI_ENABLED", "true").lower() in {"1", "true", "yes", "on"},
            ai_channel_cooldown_seconds=max(10, int(os.environ.get("TICKET_AI_COOLDOWN_SECONDS", "30"))),
            ai_history_limit=min(50, max(1, int(os.environ.get("TICKET_AI_HISTORY_LIMIT", "30")))),
        )
