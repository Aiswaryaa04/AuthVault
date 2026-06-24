# AuthVault

AuthVault is an authentication and authorization backend I built to get hands-on with the patterns that show up in almost every real-world production system: signed sessions, token rotation, role checks, MFA, audit trails, and brute-force protection. Instead of just reading about how these work, I built each piece from scratch, tested it against the actual database/cache, and committed it incrementally so the history reflects how it actually came together.

It's a FastAPI backend, backed by PostgreSQL for persistent data and Redis for rate limiting, with a small React frontend wired up to the real API (not mocked), and a standalone SDK that demonstrates how a separate service could verify AuthVault tokens without ever touching the database.

## Why I built it this way

A lot of auth tutorials stop at "here's how to issue a JWT." That's the easy 20%. The harder, more interesting parts are the things that actually matter in production:

- What happens when an access token expires — do you force a re-login, or can you refresh silently?
- If a refresh token leaks, how do you limit the blast radius?
- How do you let some users do more than others without hardcoding role checks into every route?
- How do you actually prove someone has access to a second factor, without a live network call to verify it?
- If something goes wrong, can you trace what happened?
- What stops someone from just hammering the login endpoint with a password list?

Each feature in this repo maps directly to one of those questions, and I made sure I could explain and demonstrate the answer before moving to the next one — that's also why the commit history is incremental rather than one big initial commit.

## What's actually in here

### Core authentication
Signup hashes passwords with bcrypt before they ever touch the database — the actual password is never stored, only a one-way hash with a random salt baked in. Login re-hashes the submitted password and compares it to the stored hash; if it matches, the server issues a JWT access token signed with a server-side secret. Because the token is signed (not encrypted), the server can verify it wasn't tampered with just by recomputing the signature — no database lookup needed to check validity, only to fetch the user's current data.

### Refresh token rotation
Access tokens are short-lived (30 minutes) on purpose — if one leaks, the damage window is small. But that means a user would need to re-enter their password every 30 minutes, which isn't realistic. Refresh tokens solve this: they're long-lived, stored in Postgres (not just trusted blindly like a JWT), and every time one is used, it's immediately marked `revoked` and a new one is issued. So even if a refresh token is intercepted, it can only be used once before becoming worthless — and the legitimate user's next refresh attempt would fail, which is a signal something's wrong.

### Role-based access control
Routes that need elevated permissions check the calling user's `role` field through a dependency I wrote called `require_role`. It's a small function that returns another function — a "dependency factory" — which lets me write `Depends(require_role("admin"))` on any route and get a 403 if the user doesn't match, without duplicating the check logic everywhere.

### MFA via TOTP
This was the part I understood the least going in, and probably learned the most from. TOTP doesn't involve the server sending you a code — instead, the server and your authenticator app both independently compute a 6-digit code from a shared secret plus the current time (rounded to a 30-second window). Since both sides do the same math, the codes match, with zero network round-trip needed at verification time. I tested this by generating a secret through `/mfa/setup`, then independently computing the matching code in a Python shell (acting as a stand-in for a phone authenticator app) and verifying it through `/mfa/verify`.

### Audit logging
Every signup, successful login, and failed login gets written to an `audit_logs` table — user id (when known), event type, a short detail string, and a timestamp. There's no update or delete path for this table anywhere in the code; the only way to interact with it is to insert. That's the actual mechanism behind "immutable" here — it's not a database-level constraint, it's that the application simply never gives itself a way to rewrite history.

### Rate limiting
Failed login attempts are tracked in Redis, keyed by email, with an automatic 15-minute expiry. After 5 failures, further attempts get a 429 until the window resets. I used Redis specifically because its `INCR` operation is atomic — even under concurrent requests, the counter can't get corrupted by a race condition — and `EXPIRE` means there's no manual cleanup job needed; the key just disappears on its own.

### The SDK
This is the piece I think best demonstrates *why* JWTs are useful in the first place. I packaged the token-verification logic into a separate, installable Python package (`sdk/authvault_sdk`) that has zero knowledge of the Postgres database, the signup flow, or any of AuthVault's internals — it only needs the same signing secret. I proved this actually works by spinning up a second, completely unrelated FastAPI app on a different port, importing the SDK, and using a token minted by the main app to access a protected route on the second app. That's the real test of "reusable" — not that the code is in a separate folder, but that it functions correctly with no shared state beyond the secret.

### The frontend
A small React app (built with Vite) with toggleable login/signup forms. It's not just a UI mockup — every form submission hits the real FastAPI backend over `fetch`, stores the returned JWT in React state, and uses it to call the protected `/me` endpoint. I had to add CORS middleware to the backend to get this working, since the frontend (`localhost:5173`) and backend (`127.0.0.1:8000`) are different origins as far as the browser is concerned.

## Project layout

```
authvault/
├── main.py            FastAPI app — all routes live here
├── models.py          SQLAlchemy models: User, RefreshToken, AuditLog
├── schemas.py         Pydantic schemas — what the API accepts/returns
├── auth.py            Password hashing, JWT signing/verification, TOTP helpers
├── database.py        DB engine/session setup, Redis client
├── sdk/                Standalone package for third-party token verification
│   └── authvault_sdk/
└── frontend/           React (Vite) app — login/signup UI
    └── src/
```

I split `schemas.py` from `models.py` deliberately: `models.py` defines what's stored in Postgres, `schemas.py` defines what crosses the API boundary. They're not the same thing on purpose — for example, the response schema for a user never includes the password hash, even though the database row does.

## Running it locally

You'll need Python 3.11+, PostgreSQL, Redis, and Node.js installed.

**Backend:**
```bash
python3 -m venv venv
source venv/bin/activate
pip install fastapi uvicorn sqlalchemy psycopg2-binary "passlib[bcrypt]" \
            python-jose python-multipart pydantic[email] pyotp qrcode redis

createdb authvault
psql authvault
```
Inside `psql`, create a user and grant schema access (Postgres 15+ locks down the public schema by default, so the database-level grant alone isn't enough):
```sql
CREATE USER authvault_user WITH PASSWORD 'devpassword123';
GRANT ALL PRIVILEGES ON DATABASE authvault TO authvault_user;
\c authvault
GRANT ALL ON SCHEMA public TO authvault_user;
\q
```
Then start Redis and the API:
```bash
brew install redis && brew services start redis
uvicorn main:app --reload
```
API docs at `http://127.0.0.1:8000/docs`.

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```
Runs at `http://localhost:5173`.

**SDK (for use in a different project):**
```bash
pip install -e ./sdk
```
```python
from authvault_sdk import AuthVaultSDK

auth = AuthVaultSDK(secret_key="<same secret as the main app>")

@app.get("/protected")
def route(user = Depends(auth.get_current_user)):
    return {"email": user["email"]}
```

## Endpoints

| Method | Path | What it does |
|---|---|---|
| POST | `/signup` | Create a user, hash their password |
| POST | `/login` | Verify credentials, issue access + refresh tokens, logged to audit_logs |
| POST | `/refresh` | Exchange a valid refresh token for a new pair; revokes the old one |
| GET | `/me` | Return the current authenticated user |
| GET | `/admin-only` | Example route gated behind the `admin` role |
| POST | `/mfa/setup` | Generate and store a TOTP secret for the current user |
| POST | `/mfa/verify` | Check a 6-digit TOTP code against the stored secret |
