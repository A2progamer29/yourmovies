from backend.discord_economy import RewardPolicy, premium_plan_for_boosts


def test_boost_thresholds():
    assert premium_plan_for_boosts(0) is None
    assert premium_plan_for_boosts(1) == "basic"
    assert premium_plan_for_boosts(2) == "basic"
    assert premium_plan_for_boosts(3) == "standard"
    assert premium_plan_for_boosts(5) == "standard"
    assert premium_plan_for_boosts(6) == "premium"


def test_reward_policy_respects_daily_cap():
    policy = RewardPolicy(minimum=1, maximum=3, cooldown_seconds=180, daily_cap=60)
    assert policy.clamp(3, 0) == 3
    assert policy.clamp(3, 59) == 1
    assert policy.clamp(2, 60) == 0


def test_bump_policy_has_no_partial_overflow():
    policy = RewardPolicy(minimum=5, maximum=5, cooldown_seconds=7200, daily_cap=15)
    assert policy.clamp(5, 10) == 5
    assert policy.clamp(5, 15) == 0
