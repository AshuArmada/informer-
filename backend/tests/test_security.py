import pytest
from cryptography.fernet import InvalidToken

from app.security import decrypt_token, encrypt_token


def test_encrypt_then_decrypt_round_trips():
    token = "ghp_1234567890abcdefghijklmnopqrstuvwxyz"
    encrypted = encrypt_token(token)
    assert decrypt_token(encrypted) == token


def test_encrypted_value_is_not_the_plaintext():
    token = "github_pat_11ABCDEFGQ0examplefinegrainedtoken"
    encrypted = encrypt_token(token)
    assert encrypted != token
    assert token not in encrypted


def test_same_token_encrypted_twice_yields_different_ciphertext():
    # Fernet includes a random IV/timestamp, so re-encrypting must not be deterministic.
    token = "ghp_sametoken0000000000000000000000"
    assert encrypt_token(token) != encrypt_token(token)


def test_decrypting_garbage_raises():
    with pytest.raises(InvalidToken):
        decrypt_token("not-a-real-fernet-token")
