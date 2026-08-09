import { api } from "./client";
import type { User } from "./types";

interface AuthResponse {
  data: { user: User };
}

export const authApi = {
  register: (email: string, password: string) => api.post<AuthResponse>("/api/auth/register", { email, password }),
  login: (email: string, password: string) => api.post<AuthResponse>("/api/auth/login", { email, password }),
  logout: () => api.post<{ data: { loggedOut: boolean } }>("/api/auth/logout"),
  me: () => api.get<AuthResponse>("/api/auth/me"),
};
