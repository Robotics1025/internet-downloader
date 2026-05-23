"""RetryPolicy — exponential backoff for failed segments.

Returns None when the retry budget is exhausted so callers can surface a clear
"give up" signal instead of guessing at sentinel values.
"""


class RetryPolicy:
    MAX_RETRIES = 5

    @staticmethod
    def next_delay_seconds(retry_count: int) -> int | None:
        if retry_count < 0:
            raise ValueError("retry_count cannot be negative")
        if retry_count >= RetryPolicy.MAX_RETRIES:
            return None
        return int(2**retry_count)
