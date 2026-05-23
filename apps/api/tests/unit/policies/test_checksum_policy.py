"""ChecksumPolicy extracts an (algorithm, expected) tuple from HTTP response headers.

Supported headers:
    Content-MD5: <base64-encoded-md5>          -> ("md5", "<base64>")
    Digest: md5=<base64>                       -> ("md5", "<base64>")
    Digest: sha-256=<base64>                   -> ("sha-256", "<base64>")

Unsupported algorithms in Digest -> None.
Missing headers -> None.
Header lookup must be case-insensitive.
"""
from dm_api.domain.policies.checksum_policy import ChecksumPolicy


def test_content_md5_is_extracted() -> None:
    headers = {"Content-MD5": "1B2M2Y8AsgTpgAmY7PhCfg=="}
    assert ChecksumPolicy.from_headers(headers) == ("md5", "1B2M2Y8AsgTpgAmY7PhCfg==")


def test_digest_md5_is_extracted() -> None:
    headers = {"Digest": "md5=1B2M2Y8AsgTpgAmY7PhCfg=="}
    assert ChecksumPolicy.from_headers(headers) == ("md5", "1B2M2Y8AsgTpgAmY7PhCfg==")


def test_digest_sha_256_is_extracted() -> None:
    headers = {"Digest": "sha-256=47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU="}
    assert ChecksumPolicy.from_headers(headers) == (
        "sha-256",
        "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=",
    )


def test_unsupported_digest_algorithm_returns_none() -> None:
    headers = {"Digest": "sha-512=abc=="}
    assert ChecksumPolicy.from_headers(headers) is None


def test_no_headers_returns_none() -> None:
    assert ChecksumPolicy.from_headers({}) is None


def test_irrelevant_headers_return_none() -> None:
    assert ChecksumPolicy.from_headers({"Content-Type": "application/zip"}) is None


def test_header_lookup_is_case_insensitive() -> None:
    headers = {"content-md5": "1B2M2Y8AsgTpgAmY7PhCfg=="}
    assert ChecksumPolicy.from_headers(headers) == ("md5", "1B2M2Y8AsgTpgAmY7PhCfg==")


def test_digest_with_leading_whitespace() -> None:
    headers = {"Digest": "  md5=1B2M2Y8AsgTpgAmY7PhCfg=="}
    assert ChecksumPolicy.from_headers(headers) == ("md5", "1B2M2Y8AsgTpgAmY7PhCfg==")


def test_malformed_digest_returns_none() -> None:
    headers = {"Digest": "this-has-no-equals-sign"}
    assert ChecksumPolicy.from_headers(headers) is None


def test_content_md5_wins_over_digest_when_both_present() -> None:
    headers = {
        "Content-MD5": "1B2M2Y8AsgTpgAmY7PhCfg==",
        "Digest": "sha-256=other-value=",
    }
    assert ChecksumPolicy.from_headers(headers) == ("md5", "1B2M2Y8AsgTpgAmY7PhCfg==")
