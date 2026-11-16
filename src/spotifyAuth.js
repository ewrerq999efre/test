/**
 * Spotify PKCE (Proof Key for Code Exchange) Authentication Flow
 * Allows pure client-side authentication without exposing a client secret.
 */

export const SPOTIFY_CLIENT_ID = 'da73a704098442f0aa3407196bb679b9';

export function getRedirectUri() {
  if (typeof window === 'undefined') return 'http://127.0.0.1:5173/';
  let origin = window.location.origin;
  // Spotify strictly flags "http://localhost" as Insecure and mandates loopback IP "http://127.0.0.1"
  if (origin.includes('localhost')) {
    origin = origin.replace('localhost', '127.0.0.1');
  }
  const path = window.location.pathname.endsWith('/')
    ? window.location.pathname
    : `${window.location.pathname}/`;
  return `${origin}${path}`;
}

export const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-library-read',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'app-remote-control'
].join(' ');

// Generate a random string for state & code verifier
export function generateRandomString(length = 64) {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const values = crypto.getRandomValues(new Uint8Array(length));
  return values.reduce((acc, x) => acc + possible[x % possible.length], '');
}

// Calculate SHA-256 hash
async function sha256(plain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return window.crypto.subtle.digest('SHA-256', data);
}

// Base64URL encode buffer
function base64encode(input) {
  return btoa(String.fromCharCode(...new Uint8Array(input)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Initiates the Spotify authorization redirect
 */
export async function redirectToSpotifyAuthorize(clientId = SPOTIFY_CLIENT_ID) {
  const codeVerifier = generateRandomString(64);
  const hashed = await sha256(codeVerifier);
  const codeChallenge = base64encode(hashed);
  const redirectUri = getRedirectUri();

  window.localStorage.setItem('spotify_code_verifier', codeVerifier);
  window.localStorage.setItem('spotify_active_redirect_uri', redirectUri);

  const authUrl = new URL('https://accounts.spotify.com/authorize');
  const params = {
    response_type: 'code',
    client_id: clientId,
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
    redirect_uri: redirectUri
  };

  authUrl.search = new URLSearchParams(params).toString();
  console.log('[SpotifyAuth] Redirecting to:', authUrl.toString(), 'with redirect_uri:', redirectUri);
  window.location.href = authUrl.toString();
}

let isExchanging = false;

/**
 * Exchanges the authorization code for an Access Token
 */
export async function exchangeCodeForToken(code, clientId = SPOTIFY_CLIENT_ID) {
  if (isExchanging) {
    console.warn('[SpotifyAuth] Exchange already in flight, skipping duplicate call');
    return null;
  }
  isExchanging = true;

  const codeVerifier = window.localStorage.getItem('spotify_code_verifier');
  const redirectUri = window.localStorage.getItem('spotify_active_redirect_uri') || getRedirectUri();

  if (!codeVerifier) {
    isExchanging = false;
    throw new Error('Code verifier is missing from localStorage. Please try connecting again.');
  }

  const url = 'https://accounts.spotify.com/api/token';
  const payload = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier
    })
  };

  console.log('[SpotifyAuth] Exchanging code for token with redirect_uri:', redirectUri);

  try {
    const response = await fetch(url, payload);
    const data = await response.json();

    if (!response.ok) {
      console.error('[SpotifyAuth] Token exchange failed response:', data);
      const detail = data.error_description || data.error || 'Failed to exchange token';
      throw new Error(`${detail} (Status: ${response.status})`);
    }

    saveTokenData(data);
    // Once successful, clear verifier
    window.localStorage.removeItem('spotify_code_verifier');
    return data;
  } finally {
    isExchanging = false;
  }
}

/**
 * Refreshes an expired access token using the refresh_token
 */
export async function refreshAccessToken(clientId = SPOTIFY_CLIENT_ID) {
  const refreshToken = window.localStorage.getItem('spotify_refresh_token');
  if (!refreshToken) return null;

  const url = 'https://accounts.spotify.com/api/token';
  const payload = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    })
  };

  try {
    const response = await fetch(url, payload);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error_description || data.error || 'Token refresh failed');
    saveTokenData(data);
    return data.access_token;
  } catch (err) {
    console.error('Error refreshing token:', err);
    clearStoredToken();
    return null;
  }
}

function saveTokenData(data) {
  const expiresAt = Date.now() + (data.expires_in || 3600) * 1000;
  window.localStorage.setItem('spotify_access_token', data.access_token);
  if (data.refresh_token) {
    window.localStorage.setItem('spotify_refresh_token', data.refresh_token);
  }
  window.localStorage.setItem('spotify_token_expires_at', expiresAt.toString());
  console.log('[SpotifyAuth] Token saved successfully. Expires in:', data.expires_in, 's');
}

/**
 * Returns a valid access token if available, refreshing if expired
 */
export async function getValidAccessToken(clientId = SPOTIFY_CLIENT_ID) {
  const token = window.localStorage.getItem('spotify_access_token');
  const expiresAt = window.localStorage.getItem('spotify_token_expires_at');

  if (!token) return null;

  // Refresh if less than 1 minute remains
  if (expiresAt && Date.now() > Number(expiresAt) - 60 * 1000) {
    return await refreshAccessToken(clientId);
  }

  return token;
}

export function clearStoredToken() {
  window.localStorage.removeItem('spotify_access_token');
  window.localStorage.removeItem('spotify_refresh_token');
  window.localStorage.removeItem('spotify_token_expires_at');
  window.localStorage.removeItem('spotify_code_verifier');
  window.localStorage.removeItem('spotify_active_redirect_uri');
}
