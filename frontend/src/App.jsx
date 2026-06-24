import { useState } from "react";
import Signup from "./Signup";
import Login from "./Login";
import "./App.css";

function App() {
  const [token, setToken] = useState(null);
  const [meInfo, setMeInfo] = useState(null);
  const [showSignup, setShowSignup] = useState(false);

  function handleLoginSuccess(accessToken) {
    setToken(accessToken);
  }

  async function fetchMe() {
    const res = await fetch("http://127.0.0.1:8000/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setMeInfo(data);
  }

  function handleLogout() {
    setToken(null);
    setMeInfo(null);
  }

  return (
    <div className="app-container">
      <h1 className="app-title">AuthVault</h1>

      {!token ? (
        <>
          {showSignup ? <Signup /> : <Login onLoginSuccess={handleLoginSuccess} />}

          <p className="toggle-text">
            {showSignup ? (
              <>
                Already have an account?{" "}
                <span className="toggle-link" onClick={() => setShowSignup(false)}>
                  Log in
                </span>
              </>
            ) : (
              <>
                Don't have an account?{" "}
                <span className="toggle-link" onClick={() => setShowSignup(true)}>
                  Sign up
                </span>
              </>
            )}
          </p>
        </>
      ) : (
        <div className="card">
          <p className="logged-in-badge">✅ Logged in!</p>
          <button onClick={fetchMe}>Fetch /me</button>
          <button onClick={handleLogout} className="secondary-btn" style={{ marginTop: "0.5rem" }}>
            Logout
          </button>
          {meInfo && (
            <pre className="json-display">
              {JSON.stringify(meInfo, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export default App;