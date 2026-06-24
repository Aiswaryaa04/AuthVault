import { useState } from "react";
import Signup from "./Signup";
import Login from "./Login";
import MfaSetup from "./MfaSetup";
import ProtectedRoute from "./ProtectedRoute";
import "./App.css";

function App() {
  const [token, setToken] = useState(null);
  const [showSignup, setShowSignup] = useState(false);

  function handleLoginSuccess(accessToken) {
    setToken(accessToken);
  }

  function handleLogout() {
    setToken(null);
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
        <>
          <div className="card">
            <p className="logged-in-badge">✅ Logged in!</p>
            <button onClick={handleLogout} className="secondary-btn">
              Logout
            </button>
          </div>

          <ProtectedRoute token={token} endpoint="/me">
            {(data) => (
              <pre className="json-display">{JSON.stringify(data, null, 2)}</pre>
            )}
          </ProtectedRoute>

          <MfaSetup token={token} />
        </>
      )}
    </div>
  );
}

export default App;