import os
import hashlib
from pathlib import Path
from django.conf import settings
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

def get_encryption_key() -> bytes:
    key_hex = settings.ENCRYPTION_KEY
    return bytes.fromhex(key_hex)

def compute_checksum(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def encrypt_bytes(data: bytes) -> tuple[bytes, str]:
    """
    Encrypts plaintext bytes with AES-256-GCM.
    Returns (ciphertext_with_auth_tag, iv_hex).
    """
    key = get_encryption_key()
    aesgcm = AESGCM(key)
    iv = os.urandom(12)  # Standard 96-bit nonce for AES-GCM
    ciphertext = aesgcm.encrypt(iv, data, None)
    return ciphertext, iv.hex()

def decrypt_bytes(ciphertext: bytes, iv_hex: str) -> bytes:
    """
    Decrypts AES-256-GCM ciphertext verifying authentication tag.
    """
    key = get_encryption_key()
    aesgcm = AESGCM(key)
    iv = bytes.fromhex(iv_hex)
    return aesgcm.decrypt(iv, ciphertext, None)

def save_encrypted_file(file_bytes: bytes, stored_filename: str) -> tuple[str, str, str]:
    """
    Encrypts and saves file to upload directory.
    Returns (stored_filename, iv_hex, checksum).
    """
    checksum = compute_checksum(file_bytes)
    ciphertext, iv_hex = encrypt_bytes(file_bytes)
    
    file_path = Path(settings.UPLOAD_DIR) / stored_filename
    with open(file_path, 'wb') as f:
        f.write(ciphertext)
        
    return stored_filename, iv_hex, checksum

def read_decrypted_file(stored_filename: str, iv_hex: str) -> bytes:
    """
    Reads encrypted file from disk and returns decrypted plaintext bytes.
    """
    file_path = Path(settings.UPLOAD_DIR) / stored_filename
    if not file_path.exists():
        raise FileNotFoundError("Encrypted file does not exist on disk")
        
    with open(file_path, 'rb') as f:
        ciphertext = f.read()
        
    return decrypt_bytes(ciphertext, iv_hex)
