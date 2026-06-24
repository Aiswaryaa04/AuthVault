from fastapi import FastAPI, Depends, HTTPException, status, Body
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from models import User, RefreshToken
import pyotp

from database import engine, Base, get_db
from models import User
from schemas import UserCreate, UserOut, Token
from auth import hash_password, verify_password, create_access_token, decode_access_token, create_refresh_token, generate_mfa_secret, verify_totp_code

# Create tables on startup
Base.metadata.create_all(bind=engine)

app = FastAPI(title="AuthVault")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

# --- Signup ---
@app.post("/signup", response_model=UserOut)
def signup(user: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == user.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    new_user = User(
        email=user.email,
        hashed_password=hash_password(user.password)
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

# --- Login ---
@app.post("/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )

    access_token = create_access_token(data={"sub": user.email})
    refresh_token_str = create_refresh_token()

    db_refresh = RefreshToken(token=refresh_token_str, user_id=user.id)
    db.add(db_refresh)
    db.commit()

    return {"access_token": access_token, "token_type": "bearer", "refresh_token": refresh_token_str}

@app.post("/refresh", response_model=Token)
def refresh_token(refresh_token: str = Body(..., embed=True), db: Session = Depends(get_db)):
    db_token = db.query(RefreshToken).filter(
        RefreshToken.token == refresh_token,
        RefreshToken.revoked == False
    ).first()

    if not db_token:
        raise HTTPException(status_code=401, detail="Invalid or revoked refresh token")

    # Rotation: revoke the old one, issue a new pair
    db_token.revoked = True
    db.commit()

    user = db.query(User).filter(User.id == db_token.user_id).first()
    new_access_token = create_access_token(data={"sub": user.email})
    new_refresh_token_str = create_refresh_token()

    new_db_refresh = RefreshToken(token=new_refresh_token_str, user_id=user.id)
    db.add(new_db_refresh)
    db.commit()

    return {"access_token": new_access_token, "token_type": "bearer", "refresh_token": new_refresh_token_str}

# --- Dependency: get current user from token ---
def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    payload = decode_access_token(token)
    if payload is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    email = payload.get("sub")
    user = db.query(User).filter(User.email == email).first()
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    return user

def require_role(required_role: str):
    def role_checker(current_user: User = Depends(get_current_user)):
        if current_user.role != required_role:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return current_user
    return role_checker

# --- Protected route ---
@app.get("/me", response_model=UserOut)
def read_current_user(current_user: User = Depends(get_current_user)):
    return current_user

@app.get("/admin-only")
def admin_route(current_user: User = Depends(require_role("admin"))):
    return {"message": f"Welcome, admin {current_user.email}"}

# --- MFA Setup ---
@app.post("/mfa/setup")
def setup_mfa(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    secret = generate_mfa_secret()
    current_user.mfa_secret = secret
    current_user.mfa_enabled = True
    db.commit()

    totp_uri = pyotp.totp.TOTP(secret).provisioning_uri(
        name=current_user.email, issuer_name="AuthVault"
    )
    return {"secret": secret, "qr_uri": totp_uri}

# --- MFA Verify ---
@app.post("/mfa/verify")
def verify_mfa(code: str = Body(..., embed=True), current_user: User = Depends(get_current_user)):
    if not current_user.mfa_enabled:
        raise HTTPException(status_code=400, detail="MFA not enabled for this user")
    if not verify_totp_code(current_user.mfa_secret, code):
        raise HTTPException(status_code=401, detail="Invalid MFA code")
    return {"message": "MFA code verified successfully"}