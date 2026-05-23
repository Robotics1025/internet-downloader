"""SpeedLimitPolicy — pure token-bucket parameter math.

Phase 1 ships only the calculations. Workers in later phases consume these
values to throttle their writes. Capacity is 2x the refill rate.
"""


class SpeedLimitPolicy:
    BURST_MULTIPLIER = 2

    @staticmethod
    def bucket_capacity(rate_bps: int) -> int:
        if rate_bps <= 0:
            raise ValueError("rate_bps must be positive")
        return rate_bps * SpeedLimitPolicy.BURST_MULTIPLIER

    @staticmethod
    def refill_per_second(rate_bps: int) -> int:
        if rate_bps <= 0:
            raise ValueError("rate_bps must be positive")
        return rate_bps
