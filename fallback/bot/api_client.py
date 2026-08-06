from __future__ import annotations

from typing import Any

import httpx


class YourMoviesAPIError(RuntimeError):
    def __init__(self, code: str, message: str, *, status: int | None = None, action: str | None = None) -> None:
        self.code = code
        self.message = message
        self.status = status
        self.action = action or "Réessaie dans quelques instants."
        super().__init__(f"[{code}] {message}")

    def user_message(self) -> str:
        return f"**Erreur `{self.code}`**\n{self.message}\n**Que faire :** {self.action}"


class YourMoviesAPI:
    def __init__(self, base_url: str, service_key: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.client = httpx.AsyncClient(
            timeout=httpx.Timeout(15.0),
            headers={"X-YourMovies-Service-Key": service_key},
        )

    async def close(self) -> None:
        await self.client.aclose()

    async def _request(self, method: str, path: str, *, json: dict | None = None) -> dict[str, Any]:
        try:
            response = await self.client.request(method, f"{self.base_url}{path}", json=json)
        except httpx.TimeoutException as exc:
            raise YourMoviesAPIError("YM-API-TIMEOUT", "Le backend YourMovie's met trop de temps à répondre.", action="Attends quelques secondes puis réessaie.") from exc
        except httpx.ConnectError as exc:
            raise YourMoviesAPIError("YM-API-OFFLINE", "Impossible de joindre le backend YourMovie's.", action="Vérifie que le service Render est Live et que YOURMOVIES_API_URL est correcte.") from exc
        except httpx.HTTPError as exc:
            raise YourMoviesAPIError("YM-API-NETWORK", "La communication avec le backend a échoué.", action="Vérifie la connexion réseau et les logs Render.") from exc
        if response.is_error:
            payload: Any = None
            try:
                payload = response.json()
            except ValueError:
                payload = {}
            detail = payload.get("detail", response.text) if isinstance(payload, dict) else response.text
            if isinstance(detail, dict):
                code = str(detail.get("code") or f"YM-API-{response.status_code}")
                message = str(detail.get("message") or "Le backend a refusé la requête.")
                action = str(detail.get("action") or self._action_for_status(response.status_code))
            else:
                code = f"YM-API-{response.status_code}"
                message = str(detail or "Le backend a refusé la requête.")
                action = self._action_for_status(response.status_code)
            raise YourMoviesAPIError(code, message, status=response.status_code, action=action)
        try:
            return response.json()
        except ValueError as exc:
            raise YourMoviesAPIError("YM-API-BAD-JSON", "Le backend a renvoyé une réponse illisible.", status=response.status_code, action="Consulte les logs du backend Render.") from exc

    @staticmethod
    def _action_for_status(status: int) -> str:
        return {
            400: "Vérifie les informations envoyées puis réessaie.",
            401: "Vérifie que DISCORD_SERVICE_KEY est identique dans le bot et sur Render.",
            403: "Vérifie les autorisations de la clé de service.",
            404: "Déploie la version du backend contenant les routes Discord.",
            409: "Cette opération existe déjà ou entre en conflit avec une liaison existante.",
            422: "Vérifie le format des identifiants et des données envoyées.",
            429: "Attends avant de réessayer.",
            500: "Consulte les logs du backend Render.",
            503: "Configure les variables d’environnement manquantes puis redémarre le backend.",
        }.get(status, "Consulte les logs du bot et du backend avec ce code d’erreur.")

    async def link(self, *, code: str, user_id: int, user_name: str, guild_id: int) -> dict:
        return await self._request("POST", "/api/internal/discord/link", json={
            "code": code,
            "discord_user_id": str(user_id),
            "discord_name": user_name,
            "guild_id": str(guild_id),
        })

    async def reward(self, *, user_id: int, guild_id: int, event_id: str, event_type: str) -> dict:
        return await self._request("POST", "/api/internal/discord/reward", json={
            "discord_user_id": str(user_id),
            "guild_id": str(guild_id),
            "event_id": event_id,
            "event_type": event_type,
        })

    async def member(self, user_id: int) -> dict:
        return await self._request("GET", f"/api/internal/discord/member/{user_id}")

    async def economy(self) -> dict:
        return await self._request("GET", "/api/internal/discord/economy")

    async def public_plans(self) -> list[dict]:
        result = await self._request("GET", "/api/plans")
        return result if isinstance(result, list) else []

    async def boost_event(self, *, user_id: int, guild_id: int, event_id: str) -> dict:
        return await self._request("POST", "/api/internal/discord/boost/event", json={
            "discord_user_id": str(user_id),
            "guild_id": str(guild_id),
            "event_id": event_id,
        })

    async def boost_status(self, *, user_id: int, guild_id: int, is_boosting: bool) -> dict:
        return await self._request("POST", "/api/internal/discord/boost/status", json={
            "discord_user_id": str(user_id),
            "guild_id": str(guild_id),
            "is_boosting": is_boosting,
        })

    async def reconcile_boosters(self, *, guild_id: int, booster_ids: list[int]) -> dict:
        return await self._request("POST", "/api/internal/discord/boost/reconcile", json={
            "guild_id": str(guild_id),
            "boosting_discord_user_ids": [str(user_id) for user_id in booster_ids],
        })

    async def set_boost_count(self, *, user_id: int, guild_id: int, count: int) -> dict:
        return await self._request("POST", "/api/internal/discord/boost/set", json={
            "discord_user_id": str(user_id),
            "guild_id": str(guild_id),
            "boost_count": count,
        })
