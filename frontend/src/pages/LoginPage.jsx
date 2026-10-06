import React from "react";
import { useNavigate } from "react-router-dom";
import { apiPost, apiGet } from "../api.js";
import { useAuth } from "../auth/useAuth.js";
import { Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  const navigate = useNavigate();
  const { user, setUser } = useAuth();

  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");

  // const [username, setUsername] = React.useState("diana");
  // const [password, setPassword] = React.useState("Password123!");
  
  const [showPassword, setShowPassword] = React.useState(false);

  const [errorText, setErrorText] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (user) {
      navigate("/dashboard");
    }
  }, [user, navigate]);

  async function onSubmit(e) {
    e.preventDefault();
    setErrorText("");
    setSubmitting(true);

    try {
      await apiPost("/api/auth/login", { username, password });
      const me = await apiGet("/api/auth/me");
      setUser(me.user);
      navigate("/dashboard");
    } catch (err) {
      setErrorText(String(err && err.message ? err.message : "Request failed."));
    } finally {
      setSubmitting(false);
    }
  }

function parseApiError(err) {
  const raw = String(err && err.message ? err.message : err || "").trim();

  let message = raw;
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj === "object") {
      if (typeof obj.message === "string") {
        message = obj.message;
      } else if (typeof obj.error === "string") {
        message = obj.error;
      }
    }
  } catch {
    // keep raw
  }

  const lower = String(message || "").toLowerCase();

  if (lower.includes("invalid credentials")) {
    return "Your username or password is incorrect. Please try again.";
  }

  if (lower.includes("not authenticated") || lower.includes("unauthorized")) {
    return "You are not signed in. Please sign in again.";
  }

  if (!message) {
    return "Request failed. Please try again.";
  }

  return message;
}

  return (
    <div className="page">
      <div className="card">
        <div className="brand">
          <div>
            <h1 className="title">Sign in</h1>
          </div>
        </div>

        <form onSubmit={onSubmit}>
          <div className="field">
            <label className="label" htmlFor="username">Username</label>
            <input
              id="username"
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </div>

          <div className="field">
            <label className="label" htmlFor="password">Password</label>

            <div className="pw-wrap">
              <input
                id="password"
                className="input pw-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
              />

              <button
                type="button"
                className="pw-toggle"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button className="button" type="submit" disabled={submitting}>
            {submitting ? "Signing in..." : "Login"}
          </button>
        </form>

        {errorText ? <div className="login-error">{parseApiError(errorText)}</div> : null}
      </div>
    </div>
  );
}
