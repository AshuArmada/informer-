from cryptography.fernet import Fernet

from app.config import get_settings


def _fernet() -> Fernet:
    return Fernet(get_settings().secret_key.encode())


def encrypt_token(token: str) -> str:
    return _fernet().encrypt(token.encode()).decode()


def decrypt_token(token_encrypted: str) -> str:
    return _fernet().decrypt(token_encrypted.encode()).decode()
