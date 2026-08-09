"use client";

/**
 * Tracks the current user across the app. We never store the access token
 * in JavaScript - it lives only in the httpOnly cookie the browser manages
 * automatically (see lib/api/client.ts). On first load we call GET
 * /api/auth/me, which succeeds if a valid session cookie is already
 * present (e.g. after a page refresh) and fails otherwise.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { authApi } from "@/lib/api/auth";
import { ApiError, onAuthFailure } from "@/lib/api/client";
import { formatApiError, isSessionAbsentError, type FormattedApiError } from "@/lib/api/errors";
import type { User } from "@/lib/api/types";

type AuthStatus = "loading" | "authenticated" | "unauthenticated" | "unavailable";

interface AuthContextValue {
  user: User | null;
  status: AuthStatus;
  /** Set when status is `unavailable` (network/server failure during session check). */
  sessionError: FormattedApiError | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  retrySession: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [sessionError, setSessionError] = useState<FormattedApiError | null>(null);
  const [sessionNonce, setSessionNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setSessionError(null);

    authApi
      .me()
      .then((res) => {
        if (cancelled) return;
        setUser(res.data.user);
        setStatus("authenticated");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setUser(null);
        // Missing/expired session → login. Network/5xx → show retry, don't pretend logged out.
        if (isSessionAbsentError(err) || (err instanceof ApiError && err.code === "NOT_FOUND")) {
          setStatus("unauthenticated");
          setSessionError(null);
          return;
        }
        setStatus("unavailable");
        setSessionError(formatApiError(err, "Unable to verify your session right now."));
      });

    return () => {
      cancelled = true;
    };
  }, [sessionNonce]);

  useEffect(() => {
    return onAuthFailure(() => {
      setUser(null);
      setStatus("unauthenticated");
      setSessionError(null);
    });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await authApi.login(email, password);
    setUser(res.data.user);
    setStatus("authenticated");
    setSessionError(null);
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    const res = await authApi.register(email, password);
    setUser(res.data.user);
    setStatus("authenticated");
    setSessionError(null);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setUser(null);
      setStatus("unauthenticated");
      setSessionError(null);
    }
  }, []);

  const retrySession = useCallback(() => {
    setSessionNonce((n) => n + 1);
  }, []);

  const value = useMemo(
    () => ({ user, status, sessionError, login, register, logout, retrySession }),
    [user, status, sessionError, login, register, logout, retrySession],
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
