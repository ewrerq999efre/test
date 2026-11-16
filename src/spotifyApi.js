/**
 * Spotify Web API integration & item formatters
 */

const BASE_URL = 'https://api.spotify.com/v1';

async function fetchSpotify(endpoint, token, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${BASE_URL}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  if (res.status === 401) {
    throw new Error('UNAUTHORIZED');
  }

  // 204 No Content for playback controls like play/pause
  if (res.status === 204) {
    return null;
  }

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Spotify API Error: ${res.status}`);
  }

  return res.json();
}

/**
 * Format milliseconds to MM:SS
 */
export function formatDurationMs(ms) {
  if (!ms || ms <= 0 || isNaN(ms)) return '00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Parse string duration "MM:SS" back to milliseconds
 */
export function parseDurationToMs(str) {
  if (!str) return 180000;
  const parts = str.split(':').map(Number);
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return (parts[0] * 60 + parts[1]) * 1000;
  }
  return 180000;
}

/**
 * Get current user profile
 */
export async function getCurrentUserProfile(token) {
  return fetchSpotify('/me', token);
}

/**
 * Get user's playlists
 */
export async function getUserPlaylists(token, limit = 30) {
  const data = await fetchSpotify(`/me/playlists?limit=${limit}`, token);
  return (data.items || []).filter(Boolean).map((pl, idx) => {
    const trackCount = pl.tracks?.total ?? 0;
    // Default estimated 3.5 minutes per track for playlist estimation or 3:30 for single
    const estDurationMs = 210000; 
    return {
      id: pl.id,
      tracksHref: pl.tracks?.href || null,
      catalog: `PL-${String(idx + 1).padStart(3, '0')}`,
      title: pl.name || 'UNTITLED PLAYLIST',
      artist: pl.owner?.display_name ? `BY ${pl.owner.display_name.toUpperCase()}` : 'SPOTIFY USER',
      year: 'PLAYLIST',
      genre: `${trackCount} TRACKS`,
      countLabel: `${trackCount} TRACKS`,
      durationMs: estDurationMs,
      duration: formatDurationMs(estDurationMs),
      accent: '#1DB954',
      image: pl.images?.[0]?.url || null,
      artType: 'horizon',
      previewUrl: null,
      uri: pl.uri,
      contextUri: pl.uri,
      spotifyUrl: pl.external_urls?.spotify || `https://open.spotify.com/playlist/${pl.id}`,
      type: 'playlist'
    };
  });
}

/**
 * Get user's saved albums
 */
export async function getUserSavedAlbums(token, limit = 30) {
  const data = await fetchSpotify(`/me/albums?limit=${limit}`, token);
  return (data.items || []).filter(Boolean).map(({ album }, idx) => {
    const year = album.release_date ? album.release_date.slice(0, 4) : '----';
    const artist = (album.artists || []).map((a) => a.name).join(', ').toUpperCase() || 'UNKNOWN';
    const firstTrack = album.tracks?.items?.[0];
    const durationMs = firstTrack?.duration_ms || 210000;
    const trackCount = album.total_tracks ?? 0;

    return {
      id: album.id,
      catalog: `ALB-${String(idx + 1).padStart(3, '0')}`,
      title: album.name || 'UNTITLED ALBUM',
      artist,
      year,
      genre: album.album_type ? album.album_type.toUpperCase() : 'ALBUM',
      countLabel: `${trackCount} TRACKS`,
      durationMs,
      duration: formatDurationMs(durationMs),
      accent: '#FFFFFF',
      image: album.images?.[0]?.url || null,
      artType: 'isometric',
      previewUrl: firstTrack?.preview_url || null,
      uri: firstTrack?.uri || album.uri,
      contextUri: album.uri,
      spotifyUrl: album.external_urls?.spotify || `https://open.spotify.com/album/${album.id}`,
      type: 'album'
    };
  });
}

/**
 * Get user's saved tracks (Liked Songs)
 */
export async function getUserSavedTracks(token, limit = 30) {
  const data = await fetchSpotify(`/me/tracks?limit=${limit}`, token);
  return (data.items || []).filter(Boolean).map(({ track }, idx) => {
    const year = track.album?.release_date ? track.album.release_date.slice(0, 4) : '----';
    const artist = (track.artists || []).map((a) => a.name).join(', ').toUpperCase() || 'UNKNOWN';
    const durationMs = track.duration_ms || 180000;

    return {
      id: track.id,
      catalog: `TRK-${String(idx + 1).padStart(3, '0')}`,
      title: track.name || 'UNTITLED TRACK',
      artist,
      year,
      genre: track.album?.name ? track.album.name.toUpperCase() : 'SINGLE',
      countLabel: 'TRACK',
      durationMs,
      duration: formatDurationMs(durationMs),
      accent: '#1DB954',
      image: track.album?.images?.[0]?.url || null,
      artType: 'waveform',
      previewUrl: track.preview_url || null,
      uri: track.uri,
      spotifyUrl: track.external_urls?.spotify || `https://open.spotify.com/track/${track.id}`,
      type: 'track'
    };
  });
}

/**
 * Get user's saved podcast shows
 */
export async function getUserSavedShows(token, limit = 30) {
  const data = await fetchSpotify(`/me/shows?limit=${limit}`, token);
  return (data.items || []).filter(Boolean).map(({ show }, idx) => {
    const epCount = show.total_episodes ?? 0;
    const estDurationMs = 1800000; // 30 min typical episode
    return {
      id: show.id,
      catalog: `POD-${String(idx + 1).padStart(3, '0')}`,
      title: show.name || 'UNTITLED SHOW',
      artist: show.publisher ? show.publisher.toUpperCase() : 'PODCAST',
      year: 'PODCAST',
      genre: show.media_type ? show.media_type.toUpperCase() : 'PODCAST',
      countLabel: `${epCount} EPISODES`,
      durationMs: estDurationMs,
      duration: formatDurationMs(estDurationMs),
      accent: '#FFD60A',
      image: show.images?.[0]?.url || null,
      artType: 'radar',
      previewUrl: null,
      uri: show.uri,
      contextUri: show.uri,
      spotifyUrl: show.external_urls?.spotify || `https://open.spotify.com/show/${show.id}`,
      type: 'show'
    };
  });
}

/**
 * Spotify Connect Playback APIs
 */
export async function getSpotifyDevices(token) {
  try {
    const data = await fetchSpotify('/me/player/devices', token);
    return data.devices || [];
  } catch (e) {
    return [];
  }
}

export async function getSpotifyPlaybackState(token) {
  try {
    return await fetchSpotify('/me/player', token);
  } catch (e) {
    return null;
  }
}

/**
 * Fetch current user playback queue (works for ANY playlist, including third-party ones!)
 */
export async function getSpotifyQueue(token) {
  try {
    const data = await fetchSpotify('/me/player/queue', token);
    const list = [];
    if (data.currently_playing) {
      list.push(data.currently_playing);
    }
    if (Array.isArray(data.queue)) {
      list.push(...data.queue);
    }
    return list.map((t, idx) => ({
      id: t.id || `queue-${idx}-${Date.now()}`,
      index: idx + 1,
      title: t.name || 'UNTITLED',
      artist: (t.artists || []).map(a => a.name).join(', ') || 'UNKNOWN',
      durationMs: t.duration_ms || 180000,
      duration: formatDurationMs(t.duration_ms),
      uri: t.uri,
      image: t.album?.images?.[0]?.url || null
    }));
  } catch (e) {
    console.warn('[getSpotifyQueue] Failed:', e);
    return [];
  }
}

export async function spotifyPlayTrack(token, { uri, contextUri }) {
  const body = {};
  if (contextUri) {
    body.context_uri = contextUri;
    if (uri && uri !== contextUri) {
      body.offset = { uri };
    }
  } else if (uri) {
    body.uris = [uri];
  }

  return fetchSpotify('/me/player/play', token, {
    method: 'PUT',
    body: JSON.stringify(body)
  });
}

export async function spotifyPauseTrack(token) {
  return fetchSpotify('/me/player/pause', token, {
    method: 'PUT'
  });
}

export async function spotifySeekPosition(token, positionMs) {
  return fetchSpotify(`/me/player/seek?position_ms=${Math.floor(positionMs)}`, token, {
    method: 'PUT'
  });
}

/**
 * Fetch tracks inside a Playlist with market=from_token support and multi-layer fallback
 */
export async function getPlaylistTracks(token, playlistIdOrHref, limit = 100) {
  let rawItems = [];
  let playlistId = playlistIdOrHref;

  // 1. If it's a full official Spotify tracks href
  if (typeof playlistIdOrHref === 'string' && playlistIdOrHref.startsWith('http')) {
    try {
      const urlWithMarket = playlistIdOrHref.includes('?')
        ? `${playlistIdOrHref}&market=from_token`
        : `${playlistIdOrHref}?market=from_token`;
      const data = await fetchSpotify(urlWithMarket, token);
      rawItems = data.items || [];
    } catch (e) {
      console.warn('[getPlaylistTracks] fetch by href failed:', e);
    }
  }

  // 2. If not fetched yet, extract clean ID and query with market=from_token
  if (rawItems.length === 0) {
    const cleanId = String(playlistId)
      .replace(/^spotify:playlist:/, '')
      .replace(/^https:\/\/api\.spotify\.com\/v1\/playlists\//, '')
      .split('?')[0]
      .split('/')[0]
      .trim();

    playlistId = cleanId;

    // Strategy A: /playlists/{id}/tracks?market=from_token&limit=100
    try {
      const data = await fetchSpotify(`/playlists/${cleanId}/tracks?limit=${limit}&market=from_token`, token);
      rawItems = data.items || [];
    } catch (err1) {
      console.warn(`[getPlaylistTracks] /tracks?market=from_token failed:`, err1.message);

      // Strategy B: /playlists/{id}?market=from_token (full object)
      try {
        const fullData = await fetchSpotify(`/playlists/${cleanId}?market=from_token`, token);
        rawItems = fullData?.tracks?.items || fullData?.items || [];
      } catch (err2) {
        console.warn(`[getPlaylistTracks] full playlist failed:`, err2.message);

        // Strategy C: legacy without market
        try {
          const fallbackData = await fetchSpotify(`/playlists/${cleanId}/tracks?limit=${limit}`, token);
          rawItems = fallbackData.items || [];
        } catch (err3) {
          console.error(`[getPlaylistTracks] All strategies failed:`, err3);
        }
      }
    }
  }

  console.log(`[getPlaylistTracks] Retrieved ${rawItems.length} rawItems for playlist:`, playlistId);

  return rawItems
    .map((item, index) => {
      if (!item) return null;
      const t = item.track || item.item || item;
      if (!t) return null;

      // Handle track name safely
      const trackTitle = t.name || t.title || (item.is_local ? 'LOCAL TRACK' : `TRACK ${index + 1}`);

      // Handle artists safely
      let artistName = 'UNKNOWN';
      if (Array.isArray(t.artists) && t.artists.length > 0) {
        artistName = t.artists.map(a => a?.name).filter(Boolean).join(', ') || 'UNKNOWN';
      } else if (t.show?.name) {
        artistName = t.show.name;
      } else if (t.publisher) {
        artistName = t.publisher;
      }

      const trackUri = t.uri || (t.id ? `spotify:track:${t.id}` : null);
      const durationMs = t.duration_ms || 180000;

      return {
        id: t.id || `pl-trk-${index}-${Date.now()}`,
        index: index + 1,
        title: trackTitle,
        artist: artistName,
        durationMs,
        duration: formatDurationMs(durationMs),
        uri: trackUri,
        image: t.album?.images?.[0]?.url || (Array.isArray(t.images) ? t.images[0]?.url : null),
        contextUri: `spotify:playlist:${playlistId}`
      };
    })
    .filter(Boolean);
}

/**
 * Fetch tracks inside an Album
 */
export async function getAlbumTracks(token, albumId, albumImage = null) {
  const data = await fetchSpotify(`/albums/${albumId}/tracks?limit=50`, token);
  return (data.items || []).filter(Boolean).map((t, index) => ({
    id: t.id || `alb-trk-${index}`,
    index: index + 1,
    title: t.name || 'UNTITLED',
    artist: (t.artists || []).map(a => a.name).join(', ') || 'UNKNOWN',
    durationMs: t.duration_ms || 180000,
    duration: formatDurationMs(t.duration_ms),
    uri: t.uri,
    image: albumImage,
    contextUri: `spotify:album:${albumId}`
  }));
}

/**
 * Fetch episodes inside a Podcast Show
 */
export async function getShowEpisodes(token, showId, showImage = null) {
  const data = await fetchSpotify(`/shows/${showId}/episodes?limit=50`, token);
  return (data.items || []).filter(Boolean).map((ep, index) => ({
    id: ep.id || `show-ep-${index}`,
    index: index + 1,
    title: ep.name || 'UNTITLED EPISODE',
    artist: ep.release_date || 'EPISODE',
    durationMs: ep.duration_ms || 1800000,
    duration: formatDurationMs(ep.duration_ms),
    uri: ep.uri,
    image: ep.images?.[0]?.url || showImage,
    contextUri: `spotify:show:${showId}`
  }));
}
