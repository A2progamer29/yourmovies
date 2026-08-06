from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class RewardPolicy:
    minimum: int
    maximum: int
    cooldown_seconds: int
    daily_cap: int

    def clamp(self, proposed: int, already_earned: int) -> int:
        if proposed <= 0 or already_earned >= self.daily_cap:
            return 0
        return min(max(self.minimum, proposed), self.maximum, self.daily_cap - already_earned)


def premium_plan_for_boosts(count: int) -> str | None:
    if count >= 6:
        return "premium"
    if count >= 3:
        return "standard"
    if count >= 1:
        return "basic"
    return None
