from cryptography.fernet import Fernet, InvalidToken

from app.config import get_settings


def _fernet() -> Fernet:
    return Fernet(get_settings().secret_key.encode())


def encrypt_token(token: str) -> str:
    return _fernet().encrypt(token.encode()).decode()


def decrypt_token(token_encrypted: str) -> str:
    return _fernet().decrypt(token_encrypted.encode()).decode()


def try_decrypt_token(token_encrypted: str) -> str | None:
    """None if the stored token can't be decrypted — i.e. SECRET_KEY changed
    since the PAT was saved. Callers must treat that as 'no token configured'
    so the user can re-enter it, rather than surfacing a 500."""
    try:
        return decrypt_token(token_encrypted)
    except InvalidToken:
        return None
