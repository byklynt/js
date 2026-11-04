export type AuthResult = { success: true } | { success: false; message: string };

export type LoginPayload = {
  username: string;
  password: string;
  rememberMe: boolean;
};

export type RegisterPayload = {
  username: string;
  email: string;
  password: string;
};

// TODO: replace this stub with a real API call to the JagoanSosmed backend
// (e.g. POST /api/auth/login) once authentication infrastructure is in place.
export async function login(payload: LoginPayload): Promise<AuthResult> {
  await new Promise((resolve) => setTimeout(resolve, 900));
  console.log("[auth-actions] login stub called with", payload);
  return { success: true };
}

// TODO: replace this stub with a real API call to the JagoanSosmed backend
// (e.g. POST /api/auth/register) once authentication infrastructure is in place.
export async function register(payload: RegisterPayload): Promise<AuthResult> {
  await new Promise((resolve) => setTimeout(resolve, 900));
  console.log("[auth-actions] register stub called with", payload);
  return { success: true };
}

// TODO: replace this stub with real Google OAuth (e.g. next-auth or Firebase Auth)
// once a provider is configured for the project.
export async function loginWithGoogle(): Promise<AuthResult> {
  await new Promise((resolve) => setTimeout(resolve, 900));
  console.log("[auth-actions] loginWithGoogle stub called");
  return { success: true };
}

export type CurrentUser = {
  username: string;
  email: string;
};

// TODO: replace this stub with a real session check (e.g. reading a cookie/JWT
// via next-auth, or calling a `/api/auth/me` endpoint) once authentication
// infrastructure is in place. Returning null here should make callers redirect
// to /login. For now a mock user is always returned so the dashboard is
// reviewable end-to-end without a backend.
export async function getCurrentUser(): Promise<CurrentUser | null> {
  return { username: "jagoansosmed_user", email: "user@jagoansosmed.com" };
}

// TODO: replace this stub with a real session-destroying call (e.g. clearing
// the auth cookie / calling POST /api/auth/logout) once auth infra exists.
export async function logout(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 400));
  console.log("[auth-actions] logout stub called");
}
