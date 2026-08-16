import pytest
from pydantic import ValidationError

from backend.discord_api import (
    MediaEventAckInput,
    MediaNotificationConfigInput,
    SiteStatusConfigInput,
    SiteStatusUpdateInput,
)


GUILD_ID = "1535804810253701190"
CHANNEL_ID = "1535805686640934923"


def test_media_notification_config_accepts_discord_snowflakes():
    payload = MediaNotificationConfigInput(guild_id=GUILD_ID, channel_id=CHANNEL_ID)

    assert payload.guild_id == GUILD_ID
    assert payload.channel_id == CHANNEL_ID


def test_media_event_ack_accepts_discord_snowflake():
    assert MediaEventAckInput(guild_id=GUILD_ID).guild_id == GUILD_ID


def test_site_status_config_accepts_discord_snowflakes():
    payload = SiteStatusConfigInput(
        guild_id=GUILD_ID,
        channel_id=CHANNEL_ID,
        message_id="1535805686640934924",
        updated_by_id="1535804810253701191",
        updated_by_name="Administrateur",
    )

    assert payload.channel_id == CHANNEL_ID
    assert payload.message_id == "1535805686640934924"


def test_site_status_update_accepts_supported_status():
    payload = SiteStatusUpdateInput(
        guild_id=GUILD_ID,
        message_id="1535805686640934924",
        status="readers",
        message="Les lecteurs ne fonctionnent pas actuellement.",
        updated_by_id="1535804810253701191",
        updated_by_name="Administrateur",
    )

    assert payload.status == "readers"


def test_site_status_update_rejects_unknown_status():
    with pytest.raises(ValidationError):
        SiteStatusUpdateInput(
            guild_id=GUILD_ID,
            message_id="1535805686640934924",
            status="unknown",
            updated_by_id="1535804810253701191",
            updated_by_name="Administrateur",
        )


@pytest.mark.parametrize(
    ("guild_id", "channel_id"),
    [
        ("not-a-discord-id", CHANNEL_ID),
        (GUILD_ID, "123"),
    ],
)
def test_media_notification_config_rejects_invalid_ids(guild_id, channel_id):
    with pytest.raises(ValidationError):
        MediaNotificationConfigInput(guild_id=guild_id, channel_id=channel_id)
