/**
 * Spotify Web Playback SDK Manager
 * Enables full high-fidelity in-browser streaming for Spotify Premium users.
 */

let playerInstance = null;
let currentDeviceId = null;

export function getPlayerInstance() {
  return playerInstance;
}

export function getCurrentDeviceId() {
  return currentDeviceId;
}

export function initWebPlaybackSDK({ token, onReady, onStateChange, onError }) {
  if (typeof window === 'undefined') return;

  const createPlayer = () => {
    if (!window.Spotify) {
      console.warn('[SpotifySDK] window.Spotify not found');
      return;
    }

    if (playerInstance) {
      playerInstance.disconnect();
      playerInstance = null;
    }

    const player = new window.Spotify.Player({
      name: 'CoverFlow 3D Web Player',
      getOAuthToken: (cb) => {
        cb(token);
      },
      volume: 0.8
    });

    player.addListener('ready', ({ device_id }) => {
      console.log('[SpotifySDK] Ready with Device ID:', device_id);
      currentDeviceId = device_id;
      if (onReady) onReady(device_id);
    });

    player.addListener('not_ready', ({ device_id }) => {
      console.warn('[SpotifySDK] Device ID went offline:', device_id);
      currentDeviceId = null;
    });

    player.addListener('player_state_changed', (state) => {
      if (onStateChange) onStateChange(state);
    });

    player.addListener('initialization_error', ({ message }) => {
      console.error('[SpotifySDK] Initialization Error:', message);
      if (onError) onError('初始化錯誤: ' + message);
    });

    player.addListener('authentication_error', ({ message }) => {
      console.error('[SpotifySDK] Authentication Error:', message);
      if (onError) onError('認證過期或無效，請重新登入');
    });

    player.addListener('account_error', ({ message }) => {
      console.error('[SpotifySDK] Account Error:', message);
      if (onError) onError('此功能需要 Spotify Premium 會員: ' + message);
    });

    player.connect().then((success) => {
      if (success) {
        console.log('[SpotifySDK] The Web Playback SDK successfully connected!');
      }
    });

    playerInstance = player;
  };

  if (window.Spotify) {
    createPlayer();
  } else {
    window.onSpotifyWebPlaybackSDKReady = () => {
      createPlayer();
    };
  }
}

export async function playSpotifyItem(token, deviceId, { uri, contextUri }) {
  const url = deviceId
    ? `https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`
    : `https://api.spotify.com/v1/me/player/play`;

  const body = {};

  // If uri is a track
  if (uri && uri.startsWith('spotify:track:')) {
    if (contextUri && (contextUri.startsWith('spotify:album:') || contextUri.startsWith('spotify:playlist:') || contextUri.startsWith('spotify:artist:'))) {
      body.context_uri = contextUri;
      body.offset = { uri };
    } else {
      body.uris = [uri];
    }
  } else if (contextUri && !contextUri.startsWith('spotify:track:')) {
    body.context_uri = contextUri;
  } else if (uri && !uri.startsWith('spotify:track:')) {
    body.context_uri = uri;
  } else if (uri) {
    body.uris = [uri];
  }

  console.log('[SpotifySDK] Sending play command with body:', body);

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (res.status === 204 || res.status === 200) {
    return true;
  }

  const errorData = await res.json().catch(() => ({}));
  throw new Error(errorData.error?.message || `播放失敗 (HTTP ${res.status})`);
}

export async function playTrackUris(token, deviceId, uris, offsetUri) {
  const url = deviceId
    ? `https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`
    : `https://api.spotify.com/v1/me/player/play`;

  const body = {
    uris: uris
  };
  if (offsetUri) {
    body.offset = { uri: offsetUri };
  }

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (res.status === 204 || res.status === 200) {
    return true;
  }
  const errorData = await res.json().catch(() => ({}));
  throw new Error(errorData.error?.message || `播放失敗 (HTTP ${res.status})`);
}

export function disconnectPlayer() {
  if (playerInstance) {
    playerInstance.disconnect();
    playerInstance = null;
    currentDeviceId = null;
  }
}
