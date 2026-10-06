import React from "react";
import { apiGet } from "../api.js";

import { AuthContext } from "./context.js";

export function AuthProvider({ children }) {
  const [user, setUser] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;

    async function loadMe() {
      try {
        const data = await apiGet("/api/auth/me");
        if (!cancelled) {
          setUser(data.user);
        }
      } catch {
        if (!cancelled) {
          setUser(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadMe();

    return function cleanup() {
      cancelled = true;
    };
  }, []);

  const value = React.useMemo(() => {
    return { user, setUser, loading };
  }, [user, loading]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
