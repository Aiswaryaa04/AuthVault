from jose import jwt, JWTError
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer


class AuthVaultSDK:
    def __init__(self, secret_key: str, algorithm: str = "HS256"):
        self.secret_key = secret_key
        self.algorithm = algorithm
        self.oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

    def decode_token(self, token: str):
        try:
            payload = jwt.decode(token, self.secret_key, algorithms=[self.algorithm])
            return payload
        except JWTError:
            return None

    def get_current_user(self, token: str = Depends(OAuth2PasswordBearer(tokenUrl="login"))):
        payload = self.decode_token(token)
        if payload is None:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        return {"email": payload.get("sub")}