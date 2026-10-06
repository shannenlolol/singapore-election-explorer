import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth.js";
import { apiPost } from "../api.js";

export default function NavBar() {
  const navigate = useNavigate();
  const { user, setUser, loading } = useAuth();

  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const menuRootRef = React.useRef(null);
  const logoutBtnRef = React.useRef(null);

  async function onLogout() {
    try {
      await apiPost("/api/auth/logout", {});
    } catch {
      // even if server fails, proceed to clear local state
    } finally {
      setUser(null);
      navigate("/login", { replace: true });
    }
  }

  React.useEffect(function () {
    function onDocMouseDown(e) {
      const root = menuRootRef.current;
      if (!root) {
        return;
      }
      if (root.contains(e.target)) {
        return;
      }
      setIsMenuOpen(false);
    }

    function onDocKeyDown(e) {
      if (e.key === "Escape") {
        setIsMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onDocKeyDown);

    return function () {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onDocKeyDown);
    };
  }, []);

  React.useEffect(
    function () {
      if (isMenuOpen) {
        window.setTimeout(function () {
          if (logoutBtnRef.current) {
            logoutBtnRef.current.focus();
          }
        }, 0);
      }
    },
    [isMenuOpen],
  );

  if (loading) {
    return (
      <div className="topbar">
        <div className="topbar-inner">
          <div className="topbar-left">
            <div className="topbar-brand">
              <div className="topbar-dot" />
              <div className="topbar-title">Singapore Election Explorer</div>
            </div>
          </div>
          <div className="topbar-right">
            <div className="topbar-meta">Loading...</div>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  function navClass({ isActive }) {
    let className = "topbar-link";
    if (isActive) {
      className += " is-active";
    }
    return className;
  }
function toTitleCase(value) {
  const s = String(value || "").trim();
  if (!s) return "";
  return s
    .toLowerCase()
    .split(/\s+/g)
    .map(function (w) {
      return w ? w.charAt(0).toUpperCase() + w.slice(1) : "";
    })
    .join(" ");
}
  const displayName =
    toTitleCase(String(user.username || user.name || user.email || "User").trim());

  const displayRole =
    toTitleCase(String(user.role_name || user.role || "—").trim());

  return (
    <div className="topbar">
      <div className="topbar-inner">
        <div className="topbar-left">
          <div className="topbar-brand">
            <img src="/icon.svg" alt="Logo" className="topbar-dot" />
            <div className="topbar-title">Singapore Election Explorer</div>
          </div>

          <nav className="topbar-nav">
            <NavLink to="/dashboard" end className={navClass}>
              Dashboard
            </NavLink>
            <NavLink to="/map" end className={navClass}>
              Map
            </NavLink>
          </nav>
        </div>

        <div className="topbar-right">
          <div className="profile-menu-root" ref={menuRootRef}>
            <button
              type="button"
              className="profile-trigger"
              aria-haspopup="menu"
              aria-expanded={isMenuOpen ? "true" : "false"}
              onClick={function () {
                setIsMenuOpen(function (prev) {
                  return !prev;
                });
              }}
              title="Open user menu"
            >
              <span className="profile-icon" aria-hidden="true">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M12 12c2.761 0 5-2.239 5-5S14.761 2 12 2 7 4.239 7 7s2.239 5 5 5Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M20 22a8 8 0 1 0-16 0"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </button>

            {isMenuOpen ? (
              <div className="profile-dropdown" role="menu">
                <div className="profile-dropdown-header">
                  <div className="profile-name">{displayName}</div>
                  <div className="profile-role">{displayRole}</div>
                </div>

                <div className="profile-divider" />

                <button
                  type="button"
                  className="profile-logout"
                  role="menuitem"
                  ref={logoutBtnRef}
                  onClick={function () {
                    setIsMenuOpen(false);
                    onLogout();
                  }}
                >
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
