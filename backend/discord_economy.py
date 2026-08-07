from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping


@dataclass(frozen=True)
class RewardPolicy:
    minimum: int
    maximum: int
    cooldown_seconds: int
    daily_cap: int

    def clamp(self, proposed: float, already_earned: float) -> float:
        if proposed <= 0 or already_earned >= self.daily_cap:
            return 0
        return min(max(self.minimum, proposed), self.maximum, self.daily_cap - already_earned)


@dataclass(frozen=True)
class SubscriptionRewardTier:
    multiplier: float
    activity_daily_cap: int
    bump_daily_cap: int


SUBSCRIPTION_REWARD_TIERS: Mapping[str, SubscriptionRewardTier] = {
    "basic": SubscriptionRewardTier(2.1, 300, 100),
    "standard": SubscriptionRewardTier(2.9, 600, 350),
    "premium": SubscriptionRewardTier(4.0, 900, 650),
}


def reward_tier_for_plan(plan: str | None) -> SubscriptionRewardTier:
    return SUBSCRIPTION_REWARD_TIERS.get(
        (plan or "").lower(),
        SubscriptionRewardTier(1.0, 60, 15),
    )


def premium_plan_for_boosts(count: int) -> str | None:
    if count >= 6:
        return "premium"
    if count >= 3:
        return "standard"
    if count >= 1:
        return "basic"
    return None
