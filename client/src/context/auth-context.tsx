import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { IUser } from "@shared/types";
import { ApiError, api } from "../lib/api";
import { AuthContext, type LoginInput, type RegisterInput } from "./auth-store";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unable to complete authentication";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<IUser | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runAuth = useCallback(async (request: () => Promise<IUser>) => {
    setIsLoading(true);
    setError(null);
    try {
      const nextUser = await request();
      setUser(nextUser);
      return nextUser;
    } catch (caught) {
      setError(errorMessage(caught));
      throw caught;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = useCallback((input: LoginInput) => runAuth(() => api.post<IUser>("/auth/login", input)), [runAuth]);
  const register = useCallback((input: RegisterInput) => runAuth(() => api.post<IUser>("/auth/register", input)), [runAuth]);
  const loginWithGoogle = useCallback((credential: string) => runAuth(() => api.post<IUser>("/auth/google", { credential })), [runAuth]);

  const refreshUser = useCallback(async () => {
    const nextUser = await api.get<IUser>("/auth/me");
    setUser(nextUser);
  }, []);

  const logout = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try { await api.post<null>("/auth/logout"); }
    finally {
      setUser(null);
      setIsLoading(false);
    }
  }, []);
  const clearError = useCallback(() => setError(null), []);

  useEffect(() => {
    let active = true;
    // Loading the server-owned session is the external synchronization this provider owns.
    // oxlint-disable-next-line react/set-state-in-effect
    void refreshUser()
      .catch((caught) => {
        if (active && (!(caught instanceof ApiError) || caught.status !== 401)) setError(errorMessage(caught));
        if (active) setUser(null);
      })
      .finally(() => { if (active) setIsReady(true); });
    return () => { active = false; };
  }, [refreshUser]);

  const value = useMemo(() => ({
    user,
    isAuthenticated: Boolean(user),
    isReady,
    isLoading,
    error,
    login,
    register,
    loginWithGoogle,
    logout,
    clearError,
    refreshUser,
  }), [user, isReady, isLoading, error, login, register, loginWithGoogle, logout, clearError, refreshUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
