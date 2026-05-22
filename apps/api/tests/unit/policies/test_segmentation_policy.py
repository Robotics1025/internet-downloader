"""SegmentationPolicy decides how many segments a download is split into.

IDM-style thresholds:
    < 5 MB      -> 1
    5..50 MB    -> 4
    50..500 MB  -> 8
    > 500 MB    -> 16

If the server doesn't support Range requests, force 1 segment.
If the total size is unknown, force 1 segment.
Always cap at max_segments (default 16).
"""
import pytest

from dm_api.domain.policies.segmentation_policy import SegmentationPolicy

MB = 1024 * 1024


@pytest.mark.parametrize(
    ("size_bytes", "expected"),
    [
        (1 * MB, 1),
        (4 * MB, 1),                # just under 5 MB
        (5 * MB - 1, 1),            # boundary: still under 5 MB
        (5 * MB, 4),                # exactly 5 MB
        (10 * MB, 4),
        (49 * MB, 4),
        (50 * MB - 1, 4),
        (50 * MB, 8),
        (100 * MB, 8),
        (499 * MB, 8),
        (500 * MB - 1, 8),
        (500 * MB, 16),
        (1024 * MB, 16),
    ],
)
def test_segmentation_buckets(size_bytes: int, expected: int) -> None:
    assert SegmentationPolicy.plan(size_bytes, accepts_ranges=True) == expected


def test_no_range_support_forces_one_segment() -> None:
    assert SegmentationPolicy.plan(100 * MB, accepts_ranges=False) == 1


def test_unknown_size_forces_one_segment() -> None:
    assert SegmentationPolicy.plan(None, accepts_ranges=True) == 1


def test_max_segments_caps_result() -> None:
    assert SegmentationPolicy.plan(1024 * MB, accepts_ranges=True, max_segments=4) == 4


def test_max_segments_does_not_inflate_small_files() -> None:
    # max_segments=32 should not bump a 10 MB file above its natural 4.
    assert SegmentationPolicy.plan(10 * MB, accepts_ranges=True, max_segments=32) == 4


def test_max_segments_of_zero_raises() -> None:
    with pytest.raises(ValueError):
        SegmentationPolicy.plan(10 * MB, accepts_ranges=True, max_segments=0)
