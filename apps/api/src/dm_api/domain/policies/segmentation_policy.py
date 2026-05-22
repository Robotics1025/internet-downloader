"""SegmentationPolicy — chooses how many HTTP range segments to download in parallel.

Pure function, no I/O. Thresholds are IDM-style defaults; the cap is user-configurable.
"""

_MB = 1024 * 1024


class SegmentationPolicy:
    @staticmethod
    def plan(
        size_bytes: int | None,
        accepts_ranges: bool,
        max_segments: int = 16,
    ) -> int:
        if max_segments < 1:
            raise ValueError("max_segments must be at least 1")
        if size_bytes is None or not accepts_ranges:
            return 1

        if size_bytes < 5 * _MB:
            natural = 1
        elif size_bytes < 50 * _MB:
            natural = 4
        elif size_bytes < 500 * _MB:
            natural = 8
        else:
            natural = 16

        return min(natural, max_segments)
