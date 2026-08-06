from bot.api_client import YourMoviesAPIError
from bot.errors import ERRORS


def test_api_error_user_message_contains_code_and_action():
    error = YourMoviesAPIError(
        "YM-API-TEST",
        "Erreur de test.",
        status=500,
        action="Consulte les logs.",
    )
    message = error.user_message()
    assert "YM-API-TEST" in message
    assert "Erreur de test" in message
    assert "Consulte les logs" in message


def test_known_discord_errors_have_unique_codes():
    codes = [error.code for error in ERRORS.values()]
    assert len(codes) == len(set(codes))
    assert "YM-DISCORD-10062" in codes
