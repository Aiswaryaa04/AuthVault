import { useState } from "react";

const API_BASE = "http://127.0.0.1:8000";

/**
 * Generic wrapper for any view that requires a valid token.
 * Fetches a given endpoint and renders children with the result,
 * instead of each component having to handle auth headers itself.
 */
export default function ProtectedRoute({ token, endpoint, children }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  async function fetchData() {
    setError("");
    const res = await fetch(`${API_BASE}${endpoint}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      setError("Unauthorized or request failed");
      return;
    }
    const json = await res.json();
    setData(json);
  }

  return (
    <div className="card">
      <button onClick={fetchData}>Fetch {endpoint}</button>
      {error && <p className="error-msg">{error}</p>}
      {data && children(data)}
    </div>
  );
}