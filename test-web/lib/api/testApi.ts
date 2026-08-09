import { api } from "./client";
import type {
  CreateLoadRunResponse,
  CreateRunResponse,
  LoadLimitsResponse,
  LoadProfile,
  LoginResponse,
  SuitesResponse,
} from "./types";

export const testApi = {
  login(username: string, password: string) {
    return api.post<LoginResponse>("/test/login", { username, password });
  },

  listSuites(token: string) {
    return api.get<SuitesResponse>("/test/suites", token);
  },

  createRun(token: string, suites?: string[]) {
    return api.post<CreateRunResponse>(
      "/test/runs",
      suites && suites.length > 0 ? { suites } : {},
      token,
    );
  },

  getLoadLimits(token: string) {
    return api.get<LoadLimitsResponse>("/test/load/limits", token);
  },

  createLoadRun(token: string, profile: LoadProfile) {
    return api.post<CreateLoadRunResponse>("/test/load/runs", profile, token);
  },
};
