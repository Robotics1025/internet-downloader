"""SpeedLimitPolicy — pure calculation of token-bucket parameters.

Phase 1 ships only the math. The actual asyncio rate-limiting loop arrives in
a later phase. Capacity is 2x the refill rate to allow brief bursts.
"""
import pytest

from dm_api.domain.policies.speed_limit_policy import SpeedLimitPolicy


def test_bucket_capacity_is_double_refill_rate() -> None:
    assert SpeedLimitPolicy.bucket_capacity(rate_bps=1000) == 2000


def test_refill_per_second_matches_rate() -> None:
    assert SpeedLimitPolicy.refill_per_second(rate_bps=1000) == 1000


@pytest.mark.parametrize(
    ("rate_bps", "expected_capacity"),
    [
        (1, 2),
        (1024, 2048),
        (1024 * 1024, 2 * 1024 * 1024),
    ],
)
def test_capacity_scales_linearly(rate_bps: int, expected_capacity: int) -> None:
    assert SpeedLimitPolicy.bucket_capacity(rate_bps) == expected_capacity


def test_zero_rate_raises() -> None:
    with pytest.raises(ValueError):
        SpeedLimitPolicy.bucket_capacity(0)


def test_negative_rate_raises() -> None:
    with pytest.raises(ValueError):
        SpeedLimitPolicy.bucket_capacity(-1)
