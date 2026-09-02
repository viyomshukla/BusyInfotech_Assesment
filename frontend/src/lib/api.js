import axios from 'axios';

// The session cookie is httpOnly and does the work on its own in Chrome and
// Firefox. Safari refuses it — the API is on a different registrable domain to
// the site, and "Prevent cross-site tracking" is on out of the box — so the
// token returned by /auth/login is kept here as well and sent as a bearer
// header. The API accepts either, and the cookie stays in place where it works.
const TOKEN_KEY = 'riverside.token';

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    // Private windows and locked-down settings can throw on access alone.
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Nothing to do: the cookie is still the primary path.
  }
}

export const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL}/api`,
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // A rejected token is a dead token — drop it so the next load does not keep
    // presenting it and getting turned away.
    if (error.response?.status === 401) setToken(null);

    const message =
      error.response?.data?.error ??
      error.response?.data?.details?.[0]?.message ??
      'Something went wrong. Please try again.';

    return Promise.reject({
      status: error.response?.status,
      message,
      details: error.response?.data?.details ?? [],
    });
  }
);
