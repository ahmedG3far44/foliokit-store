import { createContext, useContext } from "react";
import type { IUser } from "../lib/types";

export interface LoginInput { email: string; password: string }
export interface RegisterInput extends LoginInput { name: string }

export interface AuthState {
  user: IUser | null;
  isAuthenticated: boolean;
  isReady: boolean;
  isLoading: boolean;
  error: string | null;
  login: (input: LoginInput) => Promise<IUser>;
  register: (input: RegisterInput) => Promise<IUser>;
  loginWithGoogle: (credential: string) => Promise<IUser>;
  logout: () => Promise<void>;
  clearError: () => void;
  refreshUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}

export const useAppAuth = useAuth;
