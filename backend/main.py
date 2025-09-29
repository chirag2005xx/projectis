from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import os
import base64

app = FastAPI()

def generate_key():
    return AESGCM.generate_key(bit_length=256)

def buffer_to_base64(buffer: bytes) -> str:
    return base64.b64encode(buffer).decode()

def base64_to_buffer(b64: str) -> bytes:
    return base64.b64decode(b64.encode())

@app.post("/api/encrypt")
async def encrypt_file(file: UploadFile = File(...)):
    data = await file.read()
    key = generate_key()
    aesgcm = AESGCM(key)
    iv = os.urandom(12)
    encrypted = aesgcm.encrypt(iv, data, None)
    return {
        "encryptedContentB64": buffer_to_base64(encrypted),
        "keyB64": buffer_to_base64(key),
        "ivB64": buffer_to_base64(iv)
    }

@app.post("/api/decrypt")
async def decrypt_file(
    encryptedContentB64: str = Form(...),
    keyB64: str = Form(...),
    ivB64: str = Form(...)
):
    key = base64_to_buffer(keyB64)
    iv = base64_to_buffer(ivB64)
    encrypted = base64_to_buffer(encryptedContentB64)
    aesgcm = AESGCM(key)
    decrypted = aesgcm.decrypt(iv, encrypted, None)
    return StreamingResponse(
        iter([decrypted]),
        media_type="application/octet-stream"
    )