from bot.assistant import redact_ticket_text


def test_redact_ticket_text_masks_sensitive_values():
    text = "Mon e-mail est test@example.com, password: secret123 et carte 4242 4242 4242 4242"
    redacted = redact_ticket_text(text)

    assert "test@example.com" not in redacted
    assert "secret123" not in redacted
    assert "4242 4242 4242 4242" not in redacted
    assert "[E-MAIL MASQUÉ]" in redacted
    assert "[SECRET MASQUÉ]" in redacted
    assert "[NUMÉRO MASQUÉ]" in redacted
