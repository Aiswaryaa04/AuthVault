from fastapi import FastAPI, Depends
from authvault_sdk import AuthVaultSDK

app = FastAPI()
auth = AuthVaultSDK(secret_key="dev-secret-change-this-in-production")

@app.get("/protected")
def protected_route(user=Depends(auth.get_current_user)):
    return {"message": f"Hello {user['email']}, verified via SDK!"}

