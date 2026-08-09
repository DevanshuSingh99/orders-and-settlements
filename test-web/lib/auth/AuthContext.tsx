"use client";

/**
 * Gate auth for the test dashboard. The runner JWT lives only in React
 * memory — a refresh clears the session and sends the user back to login.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { onAuthFailure } from "@/lib/api/client";
import { testApi } from "@/lib/api/testApi";

type AuthStatus = "authenticated" | "unauthenticated";

interface AuthContextValue {
  accessToken: string | null;
  status: AuthStatus;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    return onAuthFailure(() => {
      setAccessToken(null);
    });
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await testApi.login(username, password);
    const token = res?.data?.accessToken;
    if (!token || typeof token !== "string") {
      throw new Error("Login succeeded but no access token was returned. Check the test-runner response.");
    }
    setAccessToken(token);
  }, []);

  const logout = useCallback(() => {
    setAccessToken(null);
  }, []);

  const value = useMemo(
    () => ({
      accessToken,
      status: accessToken ? ("authenticated" as const) : ("unauthenticated" as const),
      login,
      logout,
    }),
    [accessToken, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
