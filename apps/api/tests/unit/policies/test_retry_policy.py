"""RetryPolicy returns exponential backoff delays, then None when exhausted.

Sequence:
    retry_count 0 -> 1 second
    retry_count 1 -> 2 seconds
    retry_count 2 -> 4 seconds
    retry_count 3 -> 8 seconds
    retry_count 4 -> 16 seconds
    retry_count 5+ -> None (give up)
"""
import pytest

from dm_api.domain.policies.retry_policy import RetryPolicy


@pytest.mark.parametrize(
    ("retry_count", "expected"),
    [
        (0, 1),
        (1, 2),
        (2, 4),
        (3, 8),
        (4, 16),
    ],
)
def test_backoff_sequence(retry_count: int, expected: int) -> None:
    assert RetryPolicy.next_delay_seconds(retry_count) == expected


@pytest.mark.parametrize("retry_count", [5, 6, 10, 100])
def test_exhaustion_returns_none(retry_count: int) -> None:
    assert RetryPolicy.next_delay_seconds(retry_count) is None


def test_negative_retry_count_raises() -> None:
    with pytest.raises(ValueError):
        RetryPolicy.next_delay_seconds(-1)


def test_max_retries_constant() -> None:
    assert RetryPolicy.MAX_RETRIES == 5
