from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class BotError:
    code: str
    title: str
    detail: str
    action: str

    def user_message(self) -> str:
        return f"**{self.title}** (`{self.code}`)\n{self.detail}\n**Que faire :** {self.action}"


ERRORS = {
    "YM-DISCORD-10062": BotError(
        "YM-DISCORD-10062", "Interaction expirée",
        "Discord n’accepte plus la réponse de cette commande.",
        "Relance la commande. Si cela recommence, vérifie la connexion du bot.",
    ),
    "YM-DISCORD-10008": BotError(
        "YM-DISCORD-10008", "Message introuvable",
        "Le message ciblé a été supprimé ou n’est plus accessible.",
        "Actualise Discord puis réessaie.",
    ),
    "YM-DISCORD-403": BotError(
        "YM-DISCORD-403", "Permission Discord manquante",
        "Le bot n’a pas les permissions nécessaires dans ce salon.",
        "Autorise Voir le salon, Lire l’historique et Envoyer des messages.",
    ),
    "YM-DISCORD-429": BotError(
        "YM-DISCORD-429", "Trop de requêtes Discord",
        "Discord limite temporairement les actions du bot.",
        "Attends quelques secondes avant de réessayer.",
    ),
    "YM-CMD-NOT-FOUND": BotError(
        "YM-CMD-NOT-FOUND", "Commande obsolète",
        "Cette commande n’existe plus dans la version actuelle du bot.",
        "Ferme et rouvre Discord, puis utilise une commande visible dans la nouvelle liste.",
    ),
    "YM-CMD-FAILED": BotError(
        "YM-CMD-FAILED", "Commande impossible",
        "Une erreur interne a empêché l’exécution de la commande.",
        "Réessaie. Si l’erreur continue, transmets ce code au staff.",
    ),
    "YM-AI-FAILED": BotError(
        "YM-AI-FAILED", "Assistant temporairement indisponible",
        "L’assistant n’a pas pu traiter ce ticket.",
        "Un membre du staff peut reprendre la conversation.",
    ),
}


def discord_error(error: Exception) -> BotError:
    status = getattr(error, "status", None)
    code = getattr(error, "code", None)
    if code == 10062:
        return ERRORS["YM-DISCORD-10062"]
    if code == 10008:
        return ERRORS["YM-DISCORD-10008"]
    if status == 403:
        return ERRORS["YM-DISCORD-403"]
    if status == 429:
        return ERRORS["YM-DISCORD-429"]
    return ERRORS["YM-CMD-FAILED"]
