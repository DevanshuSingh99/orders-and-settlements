import { randomUUID } from 'crypto';
import { env } from '../config/env';

export interface ApiResponse {
  status: number;
  body: unknown;
  durationMs: number;
}

export async function apiFetch(params: {
  method: string;
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
  accessToken?: string;
}): Promise<ApiResponse> {
  const url = `${env.PUBLIC_API_BASE_URL.replace(/\/$/, '')}${params.path}`;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'x-request-id': randomUUID(),
    ...params.headers,
  };
  if (params.accessToken) {
    headers.Authorization = `Bearer ${params.accessToken}`;
  }
  let body: string | undefined;
  if (params.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(params.body);
  }

  const started = Date.now();
  const res = await fetch(url, { method: params.method, headers, body });
  const durationMs = Date.now() - started;

  let parsed: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text.slice(0, 2000) };
    }
  }

  return { status: res.status, body: parsed, durationMs };
}

export async function registerEphemeralUser(emailPrefix: string): Promise<{
  userId: string;
  email: string;
  password: string;
  accessToken: string;
}> {
  const email = `${emailPrefix}${randomUUID()}@test.local`;
  const password = `T${randomUUID().replace(/-/g, '')}!a1`;
  const res = await apiFetch({
    method: 'POST',
    path: '/api/auth/register',
    body: { email, password },
  });
  if (res.status !== 201) {
    throw new Error(`Failed to register ephemeral user (${res.status}): ${JSON.stringify(res.body)}`);
  }
  const data = res.body as { data?: { user?: { id?: string }; accessToken?: string } };
  const userId = data.data?.user?.id;
  const accessToken = data.data?.accessToken;
  if (!userId || !accessToken) {
    throw new Error('Register response missing user id or access token');
  }
  return { userId, email, password, accessToken };
}
