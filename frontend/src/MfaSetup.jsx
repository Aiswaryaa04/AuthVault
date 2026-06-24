import { useState } from "react";

const API_BASE = "http://127.0.0.1:8000";

export default function MfaSetup({ token }) {
  const [secret, setSecret] = useState(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleSetup() {
    setError("");
    const res = await fetch(`${API_BASE}/mfa/setup`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      setError("Failed to set up MFA");
      return;
    }
    const data = await res.json();
    setSecret(data.secret);
  }

  async function handleVerify(e) {
    e.preventDefault();
    setError("");
    setMessage("");
    const res = await fetch(`${API_BASE}/mfa/verify`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.detail || "Verification failed");
      return;
    }
    setMessage(data.message);
  }

  return (
    <div className="card">
      <h2>Multi-Factor Authentication</h2>

      {!secret ? (
        <button onClick={handleSetup}>Set up MFA</button>
      ) : (
        <>
          <p style={{ color: "#94a3b8", fontSize: "0.85rem" }}>
            Secret (add this to an authenticator app): <br />
            <code>{secret}</code>
          </p>
          <form onSubmit={handleVerify}>
            <input
              type="text"
              placeholder="6-digit code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
            <button type="submit">Verify Code</button>
          </form>
        </>
      )}

      {message && <p className="success-msg">{message}</p>}
      {error && <p className="error-msg">{error}</p>}
    </div>
  );
}