from __future__ import annotations

import asyncio
import logging
from pathlib import Path

import discord
from discord import app_commands
from discord.ext import commands, tasks

from api_client import YourMoviesAPI, YourMoviesAPIError
from assistant import TicketAssistant
from config import Settings
from errors import ERRORS, discord_error


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("yourmovies.bot")
settings = Settings.from_env()

intents = discord.Intents.default()
intents.members = True
intents.message_content = True
intents.reactions = True


class YourMoviesBot(commands.Bot):
    def __init__(self) -> None:
        super().__init__(command_prefix=commands.when_mentioned, intents=intents)
        self.api = YourMoviesAPI(settings.api_base_url, settings.service_key)
        self.ticket_assistant = TicketAssistant(
            api=self.api,
            api_key=settings.openai_api_key,
            model=settings.openai_model,
            knowledge_path=Path(__file__).parent / "knowledge" / "yourmovies.md",
        )
        self.ai_paused_channels: set[int] = set()
        self.ai_next_allowed: dict[int, float] = {}
        self.uqflex_movies: dict[str, dict] | None = None

    async def setup_hook(self) -> None:
        guild = discord.Object(id=settings.guild_id)
        self.tree.clear_commands(guild=guild)
        self.tree.copy_global_to(guild=guild)
        await self.tree.sync(guild=guild)
        reconcile_boosters.start()
        media_notifications.start()

    async def close(self) -> None:
        if media_notifications.is_running():
            media_notifications.cancel()
        if reconcile_boosters.is_running():
            reconcile_boosters.cancel()
        await self.api.close()
        await super().close()


bot = YourMoviesBot()


def is_staff(member: discord.Member | discord.User) -> bool:
    if not isinstance(member, discord.Member):
        return False
    if member.guild_permissions.manage_guild:
        return True
    return bool({role.id for role in member.roles} & settings.staff_role_ids)


async def safe_reward(*, user_id: int, guild_id: int, event_id: str, event_type: str) -> None:
    try:
        await bot.api.reward(
            user_id=user_id,
            guild_id=guild_id,
            event_id=event_id,
            event_type=event_type,
        )
    except YourMoviesAPIError as exc:
        logger.warning("Récompense ignorée (%s): %s", event_type, exc)


def interaction_user(message: discord.Message) -> discord.abc.User | None:
    metadata = getattr(message, "interaction_metadata", None)
    user = getattr(metadata, "user", None)
    if user:
        return user
    legacy = getattr(message, "interaction", None)
    return getattr(legacy, "user", None)


async def ticket_conversation(message: discord.Message) -> list[dict[str, str]]:
    """Charge un historique court, textuel et étiqueté du ticket."""
    if not isinstance(message.channel, discord.TextChannel):
        return [{"role": "Utilisateur", "content": message.content or ""}]

    messages = [
        item
        async for item in message.channel.history(
            limit=settings.ai_history_limit,
            before=message,
            oldest_first=True,
        )
    ]
    messages.append(message)
    conversation: list[dict[str, str]] = []
    for item in messages:
        text = (item.content or "").strip()
        if not text or item.webhook_id:
            continue
        if bot.user and item.author.id == bot.user.id:
            role = "Assistant"
        elif item.author.bot:
            continue
        elif is_staff(item.author):
            role = "Staff"
        else:
            role = "Utilisateur"
        conversation.append({"role": role, "content": text[:1800]})
    return conversation


async def handle_ticket_message(message: discord.Message) -> None:
    ai_categories = {
        category_id
        for category_id in (settings.support_category_id, settings.other_category_id)
        if category_id is not None
    }
    if not settings.ai_enabled or not ai_categories:
        return
    if not isinstance(message.channel, discord.TextChannel):
        return
    category_id = message.channel.category_id
    if category_id not in ai_categories or category_id == settings.payment_category_id:
        return
    if is_staff(message.author) or message.channel.id in bot.ai_paused_channels:
        return
    text = (message.content or "").strip()
    if not text:
        return
    loop_time = asyncio.get_running_loop().time()
    if loop_time < bot.ai_next_allowed.get(message.channel.id, 0):
        return
    bot.ai_next_allowed[message.channel.id] = loop_time + settings.ai_channel_cooldown_seconds
    try:
        conversation = await ticket_conversation(message)
        async with message.channel.typing():
            answer = await bot.ticket_assistant.answer(text, conversation)
        if answer:
            await message.reply(answer, mention_author=False, allowed_mentions=discord.AllowedMentions.none())
    except Exception as exc:
        logger.exception("[%s] Échec de l'assistant dans le ticket %s: %s", ERRORS["YM-AI-FAILED"].code, message.channel.id, exc)


BOOST_MESSAGE_TYPES = {
    discord.MessageType.premium_guild_subscription,
    discord.MessageType.premium_guild_tier_1,
    discord.MessageType.premium_guild_tier_2,
    discord.MessageType.premium_guild_tier_3,
}


def media_type_label(media: dict) -> str:
    return {
        "movie": "Film",
        "series": "Série",
        "anime": "Anime",
    }.get(str(media.get("type") or "movie").lower(), "Contenu")


def media_embed(media: dict, *, action: str, automatic: bool = False) -> discord.Embed:
    kind = media_type_label(media)
    title = str(media.get("title") or "Contenu sans titre")
    year = media.get("year")
    media_id = str(media.get("id") or "")

    if action == "deleted":
        heading = f"{kind} supprimé"
        description = f"**{title}** a été retiré de YourMovie's."
        colour = discord.Colour.from_rgb(190, 70, 70)
    else:
        heading = f"Nouveau {kind.lower()} disponible"
        description = f"**{title}** est maintenant disponible sur YourMovie's."
        colour = discord.Colour.from_rgb(232, 210, 166)

    embed = discord.Embed(title=heading, description=description, colour=colour)
    if year:
        embed.add_field(name="Année", value=str(year), inline=True)
    if automatic:
        embed.add_field(name="Ajout", value="Détecté automatiquement", inline=True)
    if action != "deleted" and media_id:
        embed.url = f"https://yourmovies.space/media/{media_id}"

    poster = media.get("poster_url")
    if isinstance(poster, str) and poster.startswith(("http://", "https://")):
        embed.set_thumbnail(url=poster)

    # Pas de footer « Mises à jour depuis le panel admin » : l'origine n'a pas
    # à être affichée dans le message public, qu'il soit manuel ou automatique.
    return embed


async def resolve_media_channel(channel_id: int | str | None) -> discord.TextChannel | None:
    if not channel_id:
        return None
    try:
        numeric_id = int(channel_id)
    except (TypeError, ValueError):
        return None
    channel = bot.get_channel(numeric_id)
    if channel is None:
        try:
            channel = await bot.fetch_channel(numeric_id)
        except (discord.HTTPException, discord.NotFound, discord.Forbidden):
            return None
    return channel if isinstance(channel, discord.TextChannel) else None


async def process_admin_media_events(status: dict, channel: discord.TextChannel) -> None:
    for event in status.get("events") or []:
        cursor = str(event.get("cursor") or "")
        action = str(event.get("action") or "")
        media = event.get("media") if isinstance(event.get("media"), dict) else {}
        try:
            # Les propositions, validations et refus sont internes. L'ajout validé
            # possède déjà son propre événement "added", ce qui évite les doublons.
            if action in {"added", "deleted"}:
                await channel.send(
                    embed=media_embed(media, action=action, automatic=False),
                    allowed_mentions=discord.AllowedMentions.none(),
                )
            if cursor:
                await bot.api.acknowledge_media_event(cursor=cursor, guild_id=settings.guild_id)
        except (discord.HTTPException, YourMoviesAPIError) as exc:
            logger.warning("Notification média %s non envoyée/confirmée: %s", cursor or "?", exc)
            break


async def process_uqflex_changes(channel: discord.TextChannel) -> None:
    catalogue = await bot.api.media_catalog(media_type="movie", limit=500)
    current = {
        str(item.get("id")): item
        for item in catalogue
        if str(item.get("id") or "").startswith("uq_")
    }

    # Le premier passage sert uniquement de référence. On ne republie donc pas
    # tout le catalogue à chaque redémarrage du bot.
    if bot.uqflex_movies is None:
        bot.uqflex_movies = current
        logger.info("Référence UQFlex initialisée: %s film(s)", len(current))
        return

    previous = bot.uqflex_movies
    added_ids = [media_id for media_id in current if media_id not in previous]
    removed_ids = [media_id for media_id in previous if media_id not in current]

    for media_id in added_ids:
        try:
            await channel.send(
                embed=media_embed(current[media_id], action="added", automatic=True),
                allowed_mentions=discord.AllowedMentions.none(),
            )
        except discord.HTTPException as exc:
            logger.warning("Ajout UQFlex %s non annoncé: %s", media_id, exc)
            return

    for media_id in removed_ids:
        try:
            await channel.send(
                embed=media_embed(previous[media_id], action="deleted", automatic=True),
                allowed_mentions=discord.AllowedMentions.none(),
            )
        except discord.HTTPException as exc:
            logger.warning("Suppression UQFlex %s non annoncée: %s", media_id, exc)
            return

    bot.uqflex_movies = current


@bot.event
async def on_ready() -> None:
    logger.info("Connecté en tant que %s (%s)", bot.user, bot.user.id if bot.user else "?")


@bot.event
async def on_message(message: discord.Message) -> None:
    if not message.guild or message.guild.id != settings.guild_id:
        return

    if message.type in BOOST_MESSAGE_TYPES and not message.author.bot:
        try:
            await bot.api.boost_event(
                user_id=message.author.id,
                guild_id=message.guild.id,
                event_id=f"boost:{message.id}",
            )
        except YourMoviesAPIError as exc:
            logger.warning("Boost non enregistré: %s", exc)
        return

    if (
        message.channel.id == settings.bump_channel_id
        and message.author.id == settings.disboard_bot_id
    ):
        bumper = interaction_user(message)
        metadata = getattr(message, "interaction_metadata", None)
        command_name = (getattr(metadata, "name", "") or "").lower()
        if bumper and (not command_name or command_name == "bump"):
            await safe_reward(
                user_id=bumper.id,
                guild_id=message.guild.id,
                event_id=f"bump:{message.id}",
                event_type="bump",
            )
        return

    if message.author.bot or message.webhook_id:
        return
    await safe_reward(
        user_id=message.author.id,
        guild_id=message.guild.id,
        event_id=f"message:{message.id}",
        event_type="message",
    )
    await handle_ticket_message(message)
    await bot.process_commands(message)


@bot.event
async def on_raw_reaction_add(payload: discord.RawReactionActionEvent) -> None:
    if payload.guild_id != settings.guild_id or payload.user_id == getattr(bot.user, "id", None):
        return
    member = payload.member
    if member is None:
        guild = bot.get_guild(settings.guild_id)
        member = guild.get_member(payload.user_id) if guild else None
    if member and member.bot:
        return
    await safe_reward(
        user_id=payload.user_id,
        guild_id=payload.guild_id,
        event_id=f"reaction:{payload.message_id}:{payload.user_id}:{payload.emoji}",
        event_type="reaction",
    )


@bot.listen("on_interaction")
async def reward_interaction(interaction: discord.Interaction) -> None:
    if (
        interaction.guild_id == settings.guild_id
        and interaction.type is discord.InteractionType.application_command
        and not interaction.user.bot
    ):
        asyncio.create_task(safe_reward(
            user_id=interaction.user.id,
            guild_id=interaction.guild_id,
            event_id=f"command:{interaction.id}",
            event_type="command",
        ))


async def send_interaction_error(interaction: discord.Interaction, message: str) -> None:
    try:
        if interaction.response.is_done():
            await interaction.followup.send(message, ephemeral=True)
        else:
            await interaction.response.send_message(message, ephemeral=True)
    except discord.NotFound as exc:
        error = discord_error(exc)
        logger.warning("[%s] Impossible de répondre à l'interaction %s: %s", error.code, interaction.id, exc)
    except discord.HTTPException as exc:
        error = discord_error(exc)
        logger.warning("[%s] Échec de réponse à l'interaction %s: %s", error.code, interaction.id, exc)


@bot.tree.error
async def on_app_command_error(interaction: discord.Interaction, error: app_commands.AppCommandError) -> None:
    if isinstance(error, app_commands.CommandNotFound):
        known = ERRORS["YM-CMD-NOT-FOUND"]
    else:
        original = getattr(error, "original", error)
        known = discord_error(original)
    logger.exception("[%s] Commande %s en erreur: %s", known.code, getattr(interaction.command, "name", "inconnue"), error)
    await send_interaction_error(interaction, known.user_message())


@bot.event
async def on_member_update(before: discord.Member, after: discord.Member) -> None:
    if before.guild.id != settings.guild_id or before.premium_since == after.premium_since:
        return
    try:
        await bot.api.boost_status(
            user_id=after.id,
            guild_id=after.guild.id,
            is_boosting=after.premium_since is not None,
        )
    except YourMoviesAPIError as exc:
        logger.warning("Statut boost non synchronisé: %s", exc)


@tasks.loop(hours=6)
async def reconcile_boosters() -> None:
    guild = bot.get_guild(settings.guild_id)
    if not guild:
        return
    booster_ids = [member.id for member in guild.premium_subscribers]
    try:
        result = await bot.api.reconcile_boosters(guild_id=guild.id, booster_ids=booster_ids)
        logger.info("Réconciliation boosts: %s", result)
    except YourMoviesAPIError as exc:
        logger.warning("Réconciliation boosts impossible: %s", exc)


@reconcile_boosters.before_loop
async def before_reconcile_boosters() -> None:
    await bot.wait_until_ready()


@tasks.loop(seconds=30)
async def media_notifications() -> None:
    try:
        status = await bot.api.media_events(guild_id=settings.guild_id, limit=25)
        if not status.get("configured"):
            bot.uqflex_movies = None
            return
        channel = await resolve_media_channel(status.get("channel_id"))
        if channel is None:
            logger.warning("Salon de notifications médias introuvable: %s", status.get("channel_id"))
            return
        await process_admin_media_events(status, channel)
        await process_uqflex_changes(channel)
    except YourMoviesAPIError as exc:
        logger.warning("Synchronisation des notifications médias impossible: %s", exc)
    except Exception as exc:
        logger.exception("Erreur inattendue pendant la détection des contenus: %s", exc)


@media_notifications.before_loop
async def before_media_notifications() -> None:
    await bot.wait_until_ready()


@bot.tree.command(name="lier", description="Lier ton compte Discord à ton compte YourMovie's")
@app_commands.describe(code="Code généré depuis les paramètres de ton compte YourMovie's")
async def link_command(interaction: discord.Interaction, code: str) -> None:
    await interaction.response.defer(ephemeral=True, thinking=True)
    try:
        result = await bot.api.link(
            code=code,
            user_id=interaction.user.id,
            user_name=str(interaction.user),
            guild_id=interaction.guild_id or settings.guild_id,
        )
    except YourMoviesAPIError as exc:
        await interaction.followup.send(exc.user_message(), ephemeral=True)
        return
    await interaction.followup.send(
        f"Compte lié à **{result.get('name') or 'YourMovie\'s'}**. Solde : **{result.get('coins', 0)} YM Coins**.",
        ephemeral=True,
    )


@bot.tree.command(name="solde", description="Voir ton solde de YM Coins")
async def balance_command(interaction: discord.Interaction) -> None:
    await interaction.response.defer(ephemeral=True)
    try:
        member = await bot.api.member(interaction.user.id)
    except YourMoviesAPIError as exc:
        await interaction.followup.send(exc.user_message(), ephemeral=True)
        return
    await interaction.followup.send(
        f"Tu as **{member['coins']} YM Coins**. Boosts comptabilisés : **{member['boost_count']}**.",
        ephemeral=True,
    )


@bot.tree.command(name="economie", description="Afficher les règles de gain des YM Coins")
async def economy_command(interaction: discord.Interaction) -> None:
    await interaction.response.defer(ephemeral=True)
    try:
        economy = await bot.api.economy()
    except YourMoviesAPIError as exc:
        await interaction.followup.send(exc.user_message(), ephemeral=True)
        return
    activity = economy["activity"]
    bump = economy["bump"]
    await interaction.followup.send(
        f"Activité : **{activity['reward_min']} à {activity['reward_max']} coins** toutes les "
        f"**{activity['cooldown_seconds'] // 60} min**, maximum **{activity['daily_cap']}/jour**.\n"
        f"Bump : **{bump['reward']} coins** toutes les **{bump['cooldown_seconds'] // 3600} h**, "
        f"maximum **{bump['daily_cap']}/jour**.",
        ephemeral=True,
    )


@bot.tree.command(name="setup_contenus", description="Choisir le salon des ajouts et suppressions de contenus")
@app_commands.describe(salon="Salon qui recevra les ajouts et suppressions")
async def setup_contents_command(interaction: discord.Interaction, salon: discord.TextChannel) -> None:
    if not is_staff(interaction.user):
        await interaction.response.send_message("Commande réservée au staff.", ephemeral=True)
        return
    await interaction.response.defer(ephemeral=True)
    try:
        await bot.api.configure_media_notifications(
            guild_id=interaction.guild_id or settings.guild_id,
            channel_id=salon.id,
        )
        # Nouvelle référence au prochain passage pour ne jamais annoncer tout le
        # catalogue UQFlex au moment où le salon vient d'être configuré.
        bot.uqflex_movies = None
    except YourMoviesAPIError as exc:
        await interaction.followup.send(exc.user_message(), ephemeral=True)
        return
    await interaction.followup.send(
        f"Les ajouts et suppressions seront maintenant annoncés dans {salon.mention}.",
        ephemeral=True,
        allowed_mentions=discord.AllowedMentions.none(),
    )


ai_group = app_commands.Group(name="ia", description="Gérer l'IA dans ce ticket")


@ai_group.command(name="pause", description="Suspendre les réponses de l'IA dans ce ticket")
async def pause_ai(interaction: discord.Interaction) -> None:
    if not is_staff(interaction.user):
        await interaction.response.send_message("Commande réservée au staff.", ephemeral=True)
        return
    bot.ai_paused_channels.add(interaction.channel_id)
    await interaction.response.send_message("IA suspendue dans ce ticket.", ephemeral=True)


@ai_group.command(name="reprendre", description="Réactiver les réponses de l'IA dans ce ticket")
async def resume_ai(interaction: discord.Interaction) -> None:
    if not is_staff(interaction.user):
        await interaction.response.send_message("Commande réservée au staff.", ephemeral=True)
        return
    bot.ai_paused_channels.discard(interaction.channel_id)
    await interaction.response.send_message("IA réactivée dans ce ticket.", ephemeral=True)


bot.tree.add_command(ai_group)


@bot.tree.command(name="boosts", description="Corriger le nombre de boosts d'un membre")
@app_commands.describe(membre="Membre concerné", nombre="Nombre de boosts actifs à comptabiliser")
async def boosts_command(interaction: discord.Interaction, membre: discord.Member, nombre: app_commands.Range[int, 0, 20]) -> None:
    if not is_staff(interaction.user):
        await interaction.response.send_message("Commande réservée au staff.", ephemeral=True)
        return
    await interaction.response.defer(ephemeral=True)
    try:
        result = await bot.api.set_boost_count(
            user_id=membre.id,
            guild_id=interaction.guild_id or settings.guild_id,
            count=nombre,
        )
    except YourMoviesAPIError as exc:
        await interaction.followup.send(exc.user_message(), ephemeral=True)
        return
    await interaction.followup.send(
        f"{membre.mention} : **{result['boost_count']} boost(s)**, plan **{result.get('plan') or 'aucun'}**.",
        ephemeral=True,
        allowed_mentions=discord.AllowedMentions.none(),
    )


if __name__ == "__main__":
    bot.run(settings.discord_token, log_handler=None)
