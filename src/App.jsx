import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Play,
  Pause,
  Plus,
  LogIn,
  LogOut,
  Disc,
  Music,
  Library,
  Radio,
  Loader2,
  Sparkles,
  AlertTriangle,
  X,
  Upload
} from 'lucide-react';

import { ARCHIVE_ITEMS } from './mockData.js';
import {
  SPOTIFY_CLIENT_ID,
  getRedirectUri,
  redirectToSpotifyAuthorize,
  exchangeCodeForToken,
  getValidAccessToken,
  clearStoredToken
} from './spotifyAuth.js';
import {
  getCurrentUserProfile,
  getUserPlaylists,
  getUserSavedAlbums,
  getUserSavedTracks,
  getUserSavedShows,
  getPlaylistTracks,
  getAlbumTracks,
  getShowEpisodes,
  getSpotifyQueue,
  formatDurationMs
} from './spotifyApi.js';
import {
  initWebPlaybackSDK,
  playSpotifyItem,
  playTrackUris,
  getPlayerInstance,
  disconnectPlayer
} from './spotifyPlayer.js';
import {
  startSynthPlayback,
  stopSynthPlayback
} from './synthEngine.js';

/**
 * Pure Cover Artwork renderer:
 * Strictly 0px border-radius, ZERO borders, ZERO hover overlays.
 * Only the pure cover image or procedural SVG artwork.
 */
const CoverArtwork = ({ item }) => {
  const { artType, title, accent, image } = item;

  if (image) {
    return (
      <div className="w-full h-full bg-[#111111] overflow-hidden">
        <img
          src={image}
          alt={title}
          crossOrigin="anonymous"
          className="w-full h-full object-cover transition-transform duration-500"
          loading="lazy"
        />
      </div>
    );
  }

  // Procedural SVG fallback
  switch (artType) {
    case 'monolith':
      return (
        <svg viewBox="0 0 300 300" className="w-full h-full block bg-[#0d0d0d]">
          <defs>
            <pattern id="grid-1" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="300" height="300" fill="url(#grid-1)" />
          <rect x="105" y="45" width="90" height="210" fill="#FFFFFF" />
          <rect x="115" y="55" width="70" height="190" fill="#0A0A0A" />
          <rect x="135" y="85" width="30" height="130" fill="#FFFFFF" />
        </svg>
      );
    case 'horizon':
      return (
        <svg viewBox="0 0 300 300" className="w-full h-full block bg-[#111111]">
          <rect x="0" y="0" width="300" height="150" fill="#181818" />
          <rect x="110" y="70" width="80" height="80" fill="#FFFFFF" />
          <line x1="0" y1="150" x2="300" y2="150" stroke="#FFFFFF" strokeWidth="2" />
          {[162, 178, 198, 224, 256, 292].map((y, idx) => (
            <line key={idx} x1="0" y1={y} x2="300" y2={y} stroke="rgba(255,255,255,0.45)" strokeWidth="1" />
          ))}
        </svg>
      );
    case 'waveform':
      return (
        <svg viewBox="0 0 300 300" className="w-full h-full block bg-[#090909]">
          {Array.from({ length: 18 }).map((_, i) => {
            const y = 45 + i * 12;
            const peak = i % 3 === 0 ? 42 : i % 2 === 0 ? 22 : 10;
            return (
              <polyline
                key={i}
                fill="none"
                stroke={i === 8 || i === 9 ? (accent || '#FFFFFF') : 'rgba(255,255,255,0.65)'}
                strokeWidth={i === 8 || i === 9 ? '2' : '1'}
                points={`20,${y} 95,${y} 120,${y - peak} 150,${y + peak * 0.7} 180,${y - peak * 0.5} 205,${y} 280,${y}`}
              />
            );
          })}
        </svg>
      );
    case 'isometric':
      return (
        <svg viewBox="0 0 300 300" className="w-full h-full block bg-[#121212]">
          <polygon points="150,40 250,95 150,150 50,95" fill="#FFFFFF" />
          <polygon points="50,95 150,150 150,260 50,205" fill="#525252" />
          <polygon points="250,95 150,150 150,260 250,205" fill="#262626" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 300 300" className="w-full h-full block bg-[#0E0E0E]">
          {Array.from({ length: 64 }).map((_, idx) => {
            const col = idx % 8;
            const row = Math.floor(idx / 8);
            const active = (col * 7 + row * 3) % 5 === 0 || col === row;
            return (
              <rect
                key={idx}
                x={26 + col * 31}
                y={26 + row * 31}
                width="26"
                height="26"
                fill={active ? '#FFFFFF' : 'rgba(255,255,255,0.07)'}
              />
            );
          })}
        </svg>
      );
  }
};

export default function App() {
  const [activeCategory, setActiveCategory] = useState('playlists');
  const [items, setItems] = useState(ARCHIVE_ITEMS);
  const [activeIndex, setActiveIndex] = useState(0);

  // Playback & Timing state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPositionMs, setCurrentPositionMs] = useState(0);
  const [totalDurationMs, setTotalDurationMs] = useState(210000);
  const [webPlayerDeviceId, setWebPlayerDeviceId] = useState(null);

  // Liked songs display mode: 'list' (default) or 'cover' (after selection)
  const [likedViewMode, setLikedViewMode] = useState('list');

  // Tracklist view for Playlists/Albums/Podcasts (iPod right side style)
  const [isTracklistOpen, setIsTracklistOpen] = useState(false);
  const [tracklistItems, setTracklistItems] = useState([]);
  const [isLoadingTracklist, setIsLoadingTracklist] = useState(false);
  const autoCloseTimerRef = useRef(null);

  // Custom User Uploaded Local Songs
  const [customTracks, setCustomTracks] = useState([]);
  const fileInputRef = useRef(null);
  const coverInputRef = useRef(null);
  const pendingCoverUrlRef = useRef(null);
  const localAudioRef = useRef(null);

  // Auth & Profile
  const [userProfile, setUserProfile] = useState(null);
  const [authToken, setAuthToken] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const authProcessedRef = useRef(false);
  const smoothTimerRef = useRef(null);

  // CoverFlow interaction refs
  const stageRef = useRef(null);
  const dragStartX = useRef(null);
  const dragLastStepX = useRef(null);
  const isDragging = useRef(false);
  const wheelAccumulator = useRef(0);
  const wheelTimeout = useRef(null);

  // Merge loaded items with custom uploaded tracks if in custom category
  const currentItem = items[activeIndex] || null;

  // Sync duration with active item
  useEffect(() => {
    if (currentItem?.durationMs) {
      setTotalDurationMs(currentItem.durationMs);
    } else {
      setTotalDurationMs(210000);
    }
    setCurrentPositionMs(0);
  }, [currentItem]);

  // Compute playback percentage
  const progressPercent = useMemo(() => {
    if (!totalDurationMs || totalDurationMs <= 0) return 0;
    return Math.min(100, Math.max(0, (currentPositionMs / totalDurationMs) * 100));
  }, [currentPositionMs, totalDurationMs]);

  // Stop any ongoing playback
  const stopAllPlayback = useCallback(() => {
    stopSynthPlayback();
    if (localAudioRef.current) {
      localAudioRef.current.pause();
    }
    const player = getPlayerInstance();
    if (player) {
      player.pause().catch(() => {});
    }
    if (smoothTimerRef.current) {
      clearInterval(smoothTimerRef.current);
      smoothTimerRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  // Initialize Spotify Web Playback SDK
  useEffect(() => {
    if (!authToken) return;

    initWebPlaybackSDK({
      token: authToken,
      onReady: (deviceId) => {
        setWebPlayerDeviceId(deviceId);
      },
      onStateChange: (state) => {
        if (!state) return;
        setIsPlaying(!state.paused);
        setCurrentPositionMs(state.position);
        if (state.duration) {
          setTotalDurationMs(state.duration);
        }
      },
      onError: (msg) => {
        setErrorMessage(msg);
      }
    });
  }, [authToken]);

  // Smooth timing progress ticker
  useEffect(() => {
    if (!isPlaying) {
      if (smoothTimerRef.current) {
        clearInterval(smoothTimerRef.current);
        smoothTimerRef.current = null;
      }
      return;
    }

    const intervalMs = 250;
    smoothTimerRef.current = setInterval(() => {
      setCurrentPositionMs((prev) => {
        if (prev >= totalDurationMs) {
          return totalDurationMs;
        }
        return prev + intervalMs;
      });
    }, intervalMs);

    return () => {
      if (smoothTimerRef.current) {
        clearInterval(smoothTimerRef.current);
        smoothTimerRef.current = null;
      }
    };
  }, [isPlaying, totalDurationMs]);

  // Load items inside an album/playlist/podcast into iPod right-side tracklist
  const loadItemTracklist = useCallback(async (item) => {
    if (!item || !authToken || activeCategory === 'demo') return;

    setIsLoadingTracklist(true);
    setIsTracklistOpen(true);
    setTracklistItems([]);

    try {
      let tracks = [];
      if (item.type === 'playlist') {
        tracks = await getPlaylistTracks(authToken, item.tracksHref || item.id);
        // Fallback for third-party playlists: retrieve from active queue
        if (tracks.length === 0) {
          const queue = await getSpotifyQueue(authToken);
          if (queue.length > 0) {
            tracks = queue;
          }
        }
      } else if (item.type === 'album') {
        tracks = await getAlbumTracks(authToken, item.id, item.image);
      } else if (item.type === 'show') {
        tracks = await getShowEpisodes(authToken, item.id, item.image);
      }
      console.log(`[loadItemTracklist] Loaded ${tracks.length} tracks for:`, item.title);
      setTracklistItems(tracks);
    } catch (err) {
      console.error('Failed to load tracklist:', err);
      // Try queue fallback even if API threw error
      try {
        const queue = await getSpotifyQueue(authToken);
        if (queue.length > 0) {
          setTracklistItems(queue);
          return;
        }
      } catch (qErr) {}
      setErrorMessage(`載入內容失敗: ${err.message}`);
    } finally {
      setIsLoadingTracklist(false);
    }
  }, [authToken, activeCategory]);

  // Load category data
  const loadCategoryData = useCallback(async (category, token = authToken) => {
    stopAllPlayback();
    setCurrentPositionMs(0);
    setIsTracklistOpen(false);

    if (category === 'tracks') {
      setLikedViewMode('list'); // Default to list view for Liked songs
    }

    if (!token || category === 'demo') {
      setActiveCategory('demo');
      setItems(ARCHIVE_ITEMS);
      setActiveIndex(0);
      return;
    }

    if (category === 'custom') {
      setActiveCategory('custom');
      setItems(customTracks);
      setActiveIndex(0);
      return;
    }

    setIsLoading(true);
    setActiveCategory(category);
    setStatusMessage(`FETCHING ${category.toUpperCase()} FROM SPOTIFY...`);
    setErrorMessage('');

    try {
      let fetched = [];
      if (category === 'playlists') {
        fetched = await getUserPlaylists(token);
      } else if (category === 'albums') {
        fetched = await getUserSavedAlbums(token);
      } else if (category === 'tracks') {
        fetched = await getUserSavedTracks(token);
      } else if (category === 'shows') {
        fetched = await getUserSavedShows(token);
      }

      if (fetched.length > 0) {
        setItems(fetched);
        setActiveIndex(0);
      } else {
        setItems([]);
        setStatusMessage(`YOUR ${category.toUpperCase()} LIBRARY IS EMPTY`);
      }
    } catch (err) {
      console.error(`Error loading ${category}:`, err);
      if (err.message === 'UNAUTHORIZED') {
        setErrorMessage('Spotify 登入憑證已過期，請重新連接。');
        clearStoredToken();
        setAuthToken(null);
        setUserProfile(null);
      } else {
        setErrorMessage(`載入 ${category.toUpperCase()} 失敗: ${err.message}`);
      }
    } finally {
      setIsLoading(false);
    }
  }, [authToken, customTracks, stopAllPlayback]);

  // Handle URL Code Exchange
  useEffect(() => {
    if (authProcessedRef.current) return;
    authProcessedRef.current = true;

    async function initAuth() {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      const urlError = urlParams.get('error');

      if (urlError) {
        setErrorMessage(`Spotify 授權拒絕: ${urlError}`);
        window.history.replaceState({}, document.title, window.location.pathname);
      } else if (code) {
        setIsLoading(true);
        setStatusMessage('EXCHANGING CODE FOR ACCESS TOKEN...');
        try {
          const tokenData = await exchangeCodeForToken(code, SPOTIFY_CLIENT_ID);
          window.history.replaceState({}, document.title, window.location.pathname);

          if (tokenData?.access_token) {
            setAuthToken(tokenData.access_token);
            const profile = await getCurrentUserProfile(tokenData.access_token);
            setUserProfile(profile);
            await loadCategoryData('playlists', tokenData.access_token);
            setIsLoading(false);
            return;
          }
        } catch (err) {
          console.error('Failed to exchange code:', err);
          setErrorMessage(`授權失敗: ${err.message}`);
          setIsLoading(false);
          return;
        }
      }

      const token = await getValidAccessToken(SPOTIFY_CLIENT_ID);
      if (token) {
        setAuthToken(token);
        try {
          const profile = await getCurrentUserProfile(token);
          setUserProfile(profile);
          loadCategoryData('playlists', token);
        } catch (err) {
          console.error('Failed to load profile with stored token:', err);
          clearStoredToken();
          setAuthToken(null);
          setItems(ARCHIVE_ITEMS);
        }
      } else {
        setItems(ARCHIVE_ITEMS);
        setActiveIndex(3);
      }
      setIsLoading(false);
    }

    initAuth();
  }, [loadCategoryData]);

  // Navigation handlers
  const goToIndex = useCallback(
    (index) => {
      if (items.length === 0) return;
      stopAllPlayback();
      const clamped = Math.max(0, Math.min(items.length - 1, index));
      setActiveIndex(clamped);
      setCurrentPositionMs(0);
      setIsTracklistOpen(false);
    },
    [items.length, stopAllPlayback]
  );

  const goPrev = useCallback(() => {
    goToIndex(activeIndex - 1);
  }, [activeIndex, goToIndex]);

  const goNext = useCallback(() => {
    goToIndex(activeIndex + 1);
  }, [activeIndex, goToIndex]);

  // Play third-party playlist and sync its live tracks from Spotify Queue
  const handlePlayAndSyncQueue = useCallback(async () => {
    if (!currentItem || !authToken) return;
    setIsLoadingTracklist(true);
    try {
      await playSpotifyItem(authToken, webPlayerDeviceId, {
        contextUri: currentItem.contextUri || currentItem.uri
      });
      setIsPlaying(true);
      setTimeout(async () => {
        const queue = await getSpotifyQueue(authToken);
        if (queue.length > 0) {
          setTracklistItems(queue);
        }
        setIsLoadingTracklist(false);
      }, 600);
    } catch (err) {
      console.error('Play and sync queue failed:', err);
      setIsLoadingTracklist(false);
    }
  }, [currentItem, authToken, webPlayerDeviceId]);
  const playTrackDirectly = useCallback(async (trackItem, allList = items) => {
    if (!trackItem) return;

    // Local custom track playback
    if (trackItem.isLocal && trackItem.audioUrl) {
      if (localAudioRef.current) {
        localAudioRef.current.src = trackItem.audioUrl;
        localAudioRef.current.play();
        setIsPlaying(true);
        setTotalDurationMs(trackItem.durationMs || 180000);
      }
      return;
    }

    // Spotify playback
    if (authToken && trackItem.uri) {
      try {
        setErrorMessage('');
        const trackUris = allList.filter(t => t.uri && t.uri.startsWith('spotify:track:')).map(t => t.uri);

        if (trackUris.length > 0) {
          await playTrackUris(authToken, webPlayerDeviceId, trackUris, trackItem.uri);
        } else {
          // Strictly send as single track uri, never as context_uri (fixes Liked Songs bug)
          await playSpotifyItem(authToken, webPlayerDeviceId, { uri: trackItem.uri });
        }
        setIsPlaying(true);
      } catch (err) {
        console.error('Play track failed:', err);
        setErrorMessage(`播放失敗: ${err.message}`);
      }
    }
  }, [authToken, webPlayerDeviceId, items]);

  // Play a track from inside an Album or Playlist
  const handleSelectTrackFromList = useCallback(async (track) => {
    if (!track) return;

    if (track.durationMs) setTotalDurationMs(track.durationMs);
    setCurrentPositionMs(0);

    await playTrackDirectly(track, tracklistItems);

    // Auto close tracklist in 3 seconds as requested
    if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
    autoCloseTimerRef.current = setTimeout(() => {
      setIsTracklistOpen(false);
    }, 3000);
  }, [playTrackDirectly, tracklistItems]);

  // Select a Liked Song from the initial list view
  const handleSelectLikedSong = useCallback((track, index) => {
    setActiveIndex(index);
    setLikedViewMode('cover'); // Animate upward to 3D Cover Flow view with reflection
    playTrackDirectly(track);
  }, [playTrackDirectly]);

  // Master Playback Toggle
  const togglePlay = useCallback(async () => {
    if (!currentItem) return;

    const player = getPlayerInstance();

    // 1. If currently playing, pause
    if (isPlaying) {
      if (currentItem.isLocal && localAudioRef.current) {
        localAudioRef.current.pause();
      } else if (player && activeCategory !== 'demo') {
        await player.pause().catch(() => {});
      } else {
        stopSynthPlayback();
      }
      setIsPlaying(false);
      return;
    }

    // 2. Play local audio
    if (currentItem.isLocal && currentItem.audioUrl && localAudioRef.current) {
      localAudioRef.current.play();
      setIsPlaying(true);
      return;
    }

    // 3. Play Spotify
    if (authToken && activeCategory !== 'demo' && currentItem.uri) {
      try {
        setErrorMessage('');
        if (currentItem.type === 'track') {
          // Liked Song / Track playback (Fixed)
          await playTrackDirectly(currentItem);
        } else {
          // Album / Playlist / Show
          await playSpotifyItem(authToken, webPlayerDeviceId, {
            contextUri: currentItem.contextUri || currentItem.uri
          });
        }
        setIsPlaying(true);
        return;
      } catch (err) {
        console.error('Spotify play error:', err);
        setErrorMessage(`播放提示: ${err.message}`);
        return;
      }
    }

    // 4. Demo SVGS fallback
    if (activeCategory === 'demo') {
      startSynthPlayback(currentItem.artType || 'waveform');
      setIsPlaying(true);
    }
  }, [
    currentItem,
    isPlaying,
    authToken,
    activeCategory,
    webPlayerDeviceId,
    playTrackDirectly
  ]);

  // Handle timeline seek
  const handleSeek = (newPercent) => {
    const targetMs = (newPercent / 100) * totalDurationMs;
    setCurrentPositionMs(targetMs);

    if (currentItem?.isLocal && localAudioRef.current) {
      localAudioRef.current.currentTime = targetMs / 1000;
      return;
    }

    const player = getPlayerInstance();
    if (player && activeCategory !== 'demo') {
      player.seek(Math.floor(targetMs)).catch(() => {});
    }
  };

  // Handle cover image selection → then trigger audio picker
  const handleCoverSelect = (e) => {
    const file = e.target.files?.[0];
    // Reset input so same file can be re-selected
    if (coverInputRef.current) coverInputRef.current.value = '';
    if (file) {
      pendingCoverUrlRef.current = URL.createObjectURL(file);
    } else {
      pendingCoverUrlRef.current = null;
    }
    // Always proceed to audio picker
    setTimeout(() => fileInputRef.current?.click(), 100);
  };

  // Handle local user audio file upload
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileInputRef.current) fileInputRef.current.value = '';

    const audioUrl = URL.createObjectURL(file);
    const fileName = file.name.replace(/\.[^/.]+$/, '');
    const coverUrl = pendingCoverUrlRef.current;
    pendingCoverUrlRef.current = null;

    const newTrack = {
      id: `local-${Date.now()}`,
      catalog: `MY-${String(customTracks.length + 1).padStart(3, '0')}`,
      title: fileName.toUpperCase(),
      artist: 'USER UPLOAD',
      year: 'LOCAL',
      genre: 'AUDIO FILE',
      durationMs: 180000,
      duration: '03:00',
      accent: '#FFFFFF',
      image: coverUrl || null,
      artType: coverUrl ? 'image' : 'horizon',
      audioUrl: audioUrl,
      isLocal: true,
      type: 'track'
    };

    const updated = [newTrack, ...customTracks];
    setCustomTracks(updated);
    setItems(updated);
    setActiveCategory('custom');
    setActiveIndex(0);
    setLikedViewMode('cover');

    // Auto play uploaded track
    setTimeout(() => {
      if (localAudioRef.current) {
        localAudioRef.current.src = audioUrl;
        localAudioRef.current.play();
        setIsPlaying(true);
      }
    }, 200);
  };

  // Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goNext();
      } else if (e.key === ' ') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (activeCategory === 'tracks') {
          setLikedViewMode('list');
        } else {
          loadItemTracklist(currentItem);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goPrev, goNext, togglePlay, activeCategory, currentItem, loadItemTracklist]);

  // Wheel scrubbing
  const handleWheel = useCallback(
    (e) => {
      if (items.length <= 1 || isTracklistOpen || (activeCategory === 'tracks' && likedViewMode === 'list')) return;
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      wheelAccumulator.current += delta;

      const threshold = 48;
      if (Math.abs(wheelAccumulator.current) >= threshold) {
        const steps = Math.trunc(wheelAccumulator.current / threshold);
        wheelAccumulator.current = 0;
        goToIndex(activeIndex + (steps > 0 ? 1 : -1));
      }

      clearTimeout(wheelTimeout.current);
      wheelTimeout.current = setTimeout(() => {
        wheelAccumulator.current = 0;
      }, 140);
    },
    [items.length, activeIndex, goToIndex, isTracklistOpen, activeCategory, likedViewMode]
  );

  const handlePointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (isTracklistOpen || (activeCategory === 'tracks' && likedViewMode === 'list')) return;
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragLastStepX.current = e.clientX;
  };

  const handlePointerMove = (e) => {
    if (!isDragging.current || dragLastStepX.current === null) return;
    const diffX = e.clientX - dragLastStepX.current;
    const stepThreshold = 55;

    if (Math.abs(diffX) >= stepThreshold) {
      const direction = diffX < 0 ? 1 : -1;
      goToIndex(activeIndex + direction);
      dragLastStepX.current = e.clientX;
    }
  };

  const handlePointerUp = () => {
    isDragging.current = false;
    dragStartX.current = null;
    dragLastStepX.current = null;
  };

  const formattedCounter =
    items.length > 0
      ? `${String(activeIndex + 1).padStart(2, '0')} / ${String(items.length).padStart(2, '0')}`
      : '00 / 00';

  return (
    <div
      className="min-h-screen w-full flex flex-col justify-between bg-[#0a0a0a] text-white select-none overflow-hidden"
      style={{
        fontFamily: "'Helvetica Neue', Helvetica, 'PingFang TC', 'Microsoft JhengHei', 'Heiti TC', Arial, sans-serif",
        backgroundImage: 'radial-gradient(circle at 50% 42%, #141414 0%, #0a0a0a 60%, #050505 100%)'
      }}
    >
      {/* Hidden local audio player */}
      <audio
        ref={localAudioRef}
        onTimeUpdate={() => {
          if (localAudioRef.current) {
            setCurrentPositionMs(localAudioRef.current.currentTime * 1000);
          }
        }}
        onEnded={() => {
          setIsPlaying(false);
          goNext();
        }}
      />

      {/* Hidden File Input for Custom Upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* Hidden Cover Image Input — triggered first before audio picker */}
      <input
        ref={coverInputRef}
        type="file"
        accept="image/*"
        onChange={handleCoverSelect}
        className="hidden"
      />

      {/* =====================================================================
          TOP HUD BAR (HELVETICA TYPOGRAPHY)
         ===================================================================== */}
      <header className="w-full z-30 border-b border-white/10 bg-[#0a0a0a]/90 backdrop-blur-md px-4 sm:px-8 py-3 flex flex-wrap items-center justify-between gap-3">
        {/* Left Branding */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold tracking-wider uppercase text-white">
              COVERFLOW
            </span>
          </div>

          <div className="text-xs tracking-wider text-white/50 border border-white/15 px-2.5 py-0.5">
            {formattedCounter}
          </div>
        </div>

        {/* Center: Spotify Category Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-1">
          {authToken ? (
            <>
              <button
                onClick={() => loadCategoryData('playlists')}
                className={`px-3 py-1 text-xs tracking-wider uppercase transition-colors flex items-center gap-1.5 ${
                  activeCategory === 'playlists'
                    ? 'bg-white text-black font-semibold'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                <Library className="w-3.5 h-3.5" />
                <span>PLAYLISTS</span>
              </button>

              <button
                onClick={() => loadCategoryData('albums')}
                className={`px-3 py-1 text-xs tracking-wider uppercase transition-colors flex items-center gap-1.5 ${
                  activeCategory === 'albums'
                    ? 'bg-white text-black font-semibold'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                <Disc className="w-3.5 h-3.5" />
                <span>ALBUMS</span>
              </button>

              <button
                onClick={() => loadCategoryData('tracks')}
                className={`px-3 py-1 text-xs tracking-wider uppercase transition-colors flex items-center gap-1.5 ${
                  activeCategory === 'tracks'
                    ? 'bg-white text-black font-semibold'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                <Music className="w-3.5 h-3.5" />
                <span>LIKED SONGS</span>
              </button>

              <button
                onClick={() => loadCategoryData('shows')}
                className={`px-3 py-1 text-xs tracking-wider uppercase transition-colors flex items-center gap-1.5 ${
                  activeCategory === 'shows'
                    ? 'bg-white text-black font-semibold'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                <Radio className="w-3.5 h-3.5" />
                <span>PODCASTS</span>
              </button>
            </>
          ) : (
            <div className="flex items-center gap-1.5 text-xs tracking-wider text-white/40">
              <Sparkles className="w-3.5 h-3.5 text-[#1DB954]" />
              <span>DEMO MODE — CONNECT SPOTIFY 存取你的音樂庫</span>
            </div>
          )}

          {/* Add Own Audio Button */}
          <button
            onClick={() => coverInputRef.current?.click()}
            title="上傳本地音樂到網站（先選封面，再選音訊）"
            className="px-2.5 py-1 text-xs tracking-wider uppercase transition-colors border border-white/20 text-white/80 hover:bg-white hover:text-black flex items-center gap-1 ml-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>MY MUSIC ON COMPUTER</span>
          </button>


        </div>

        {/* Right: Auth Action */}
        <div className="flex items-center gap-3">
          {userProfile ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/70 tracking-wide font-medium">
                {userProfile.display_name}
              </span>
              <button
                onClick={() => {
                  stopAllPlayback();
                  disconnectPlayer();
                  clearStoredToken();
                  setAuthToken(null);
                  setUserProfile(null);
                  setActiveCategory('demo');
                  setItems(ARCHIVE_ITEMS);
                  setActiveIndex(3);
                }}
                title="登出 Spotify"
                className="p-1.5 border border-white/15 text-white/60 hover:text-white transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => redirectToSpotifyAuthorize(SPOTIFY_CLIENT_ID)}
              className="flex items-center gap-2 px-3 py-1.5 bg-[#1DB954] hover:bg-[#1ed760] text-black text-xs font-semibold tracking-wider uppercase transition-colors"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>CONNECT SPOTIFY</span>
            </button>
          )}
        </div>
      </header>

      {/* Global Error Banner */}
      {errorMessage && (
        <div className="w-full bg-red-950/80 border-b border-red-500/50 px-4 py-2 flex items-center justify-between text-xs text-red-200 z-40 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage('')} className="p-1 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* =====================================================================
          CENTER STAGE:
          Condition A: Liked Songs Initial List View (iPod Style Fullscreen List)
          Condition B: 3D Cover Flow (Pure Album Art + Floor Reflection)
         ===================================================================== */}
      <main
        ref={stageRef}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="relative flex-1 w-full flex items-center justify-center overflow-hidden touch-pan-y"
      >
        {/* VIEW A: LIKED SONGS INITIAL LIST VIEW (Left: Title, Right: Artist) */}
        {activeCategory === 'tracks' && likedViewMode === 'list' ? (
          <div className="w-full max-w-3xl h-[420px] flex flex-col border border-white/10 bg-[#0d0d0d]/80 backdrop-blur-md px-6 py-4 shadow-2xl animate-fadeIn">
            {/* List Header */}
            <div className="flex items-center justify-between border-b border-white/15 pb-2.5 mb-2 text-xs font-semibold tracking-wider text-white/50 uppercase">
              <span>TITLE // LIKED SONGS</span>
              <span>ARTIST</span>
            </div>

            {/* List Items */}
            <div className="flex-1 overflow-y-auto space-y-1 pr-1">
              {items.map((item, idx) => (
                <div
                  key={item.id}
                  onClick={() => handleSelectLikedSong(item, idx)}
                  className={`group flex items-center justify-between px-3 py-2 text-xs tracking-wide cursor-pointer transition-colors ${
                    idx === activeIndex
                      ? 'bg-white text-black font-semibold'
                      : 'text-white/80 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-3 truncate max-w-[65%]">
                    <span className="text-[10px] text-white/40 w-5 text-right font-mono">
                      {idx + 1}
                    </span>
                    <span className="truncate">{item.title}</span>
                  </div>
                  <span className={`text-xs truncate max-w-[32%] text-right ${idx === activeIndex ? 'text-black/80' : 'text-white/50 group-hover:text-white/80'}`}>
                    {item.artist}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* VIEW B: 3D COVER FLOW STAGE (STRICTLY PURE COVER ART + FLOOR REFLECTION) */
          <div className="relative w-full h-[400px] flex items-center justify-center">
            {/* Surrounding 3D Cards */}
            <div
              className={`relative w-full h-full flex items-center justify-center transition-all duration-500 ${
                isTracklistOpen ? 'translate-x-[-140px] sm:translate-x-[-180px]' : ''
              }`}
              style={{
                perspective: '1200px',
                transformStyle: 'preserve-3d'
              }}
            >
              {items.map((item, index) => {
                const offset = index - activeIndex;
                const absOffset = Math.abs(offset);

                if (absOffset > 5) return null;

                const isCenter = offset === 0;
                const isLeft = offset < 0;

                const baseGap = 160;
                const stackStep = 55;
                const translateX = isCenter
                  ? 0
                  : isLeft
                  ? -baseGap + (offset + 1) * stackStep
                  : baseGap + (offset - 1) * stackStep;

                const translateZ = isCenter ? 90 : -50 - absOffset * 20;
                const rotateY = isCenter ? 0 : isLeft ? 55 : -55;
                const scale = isCenter ? 1.15 : 0.85;
                const zIndex = 50 - absOffset;

                // When tracklist is open, fade out surrounding extra covers to opacity 0 as requested
                const opacity = isTracklistOpen
                  ? (isCenter ? 1 : 0)
                  : (absOffset > 4 ? Math.max(0, 1 - (absOffset - 4) * 0.45) : 1);

                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      if (!isCenter) {
                        goToIndex(index);
                        loadItemTracklist(item);
                      } else {
                        // Clicking center album toggles its iPod style tracklist
                        if (isTracklistOpen) {
                          setIsTracklistOpen(false);
                        } else {
                          loadItemTracklist(item);
                        }
                      }
                    }}
                    style={{
                      position: 'absolute',
                      transform: `translate3d(${translateX}px, -20px, ${translateZ}px) rotateY(${rotateY}deg) scale(${scale})`,
                      zIndex,
                      opacity,
                      transition: 'transform 480ms cubic-bezier(0.22, 1, 0.36, 1), opacity 380ms ease',
                      transformStyle: 'preserve-3d'
                    }}
                    className="w-[220px] h-[220px] sm:w-[260px] sm:h-[260px] cursor-pointer"
                  >
                    {/* Primary Pure Cover Card (ZERO BORDERS, ZERO OVERLAY BOXES) */}
                    <div
                      className={`w-full h-full relative transition-all duration-300 ${
                        isCenter ? 'shadow-[0_28px_70px_rgba(0,0,0,0.95)]' : 'brightness-75 hover:brightness-95'
                      }`}
                    >
                      <CoverArtwork item={item} />
                    </div>

                    {/* Pure Mirrored Floor Reflection (ZERO BORDERS) */}
                    <div
                      aria-hidden="true"
                      className="pointer-events-none w-full h-full mt-[2px] overflow-hidden opacity-35"
                      style={{
                        transform: 'scaleY(-1)',
                        maskImage:
                          'linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.12) 45%, transparent 78%)',
                        WebkitMaskImage:
                          'linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.12) 45%, transparent 78%)'
                      }}
                    >
                      <CoverArtwork item={item} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* IPOD STYLE TRACKLIST EXPANSION ON ALBUM RIGHT SIDE */}
            {isTracklistOpen && (
              <div
                className="absolute right-4 sm:right-16 top-1/2 -translate-y-1/2 w-[300px] sm:w-[380px] h-[340px] bg-[#0c0c0c]/95 border border-white/15 p-4 shadow-2xl z-50 flex flex-col transition-all duration-300 animate-fadeIn"
              >
                <div className="flex items-center justify-between border-b border-white/15 pb-2 mb-2">
                  <span className="text-xs font-semibold tracking-wider text-white uppercase truncate">
                    {currentItem?.title || 'TRACKS'}
                  </span>
                  <button
                    onClick={() => setIsTracklistOpen(false)}
                    className="text-white/50 hover:text-white p-1"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {isLoadingTracklist ? (
                  <div className="flex-1 flex items-center justify-center">
                    <Loader2 className="w-5 h-5 animate-spin text-white/50" />
                  </div>
                ) : tracklistItems.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-xs text-white/70 p-4 text-center gap-3">
                    <div className="space-y-1">
                      <p className="font-medium text-white">他人建立的公開清單</p>
                      <p className="text-[11px] text-white/40 leading-relaxed">
                        受 Spotify 隱私政策保護，點擊下方播放按鈕即可自動載入曲目隊列
                      </p>
                    </div>
                    <button
                      onClick={handlePlayAndSyncQueue}
                      className="px-4 py-2 bg-[#1DB954] hover:bg-[#1ed760] text-black font-semibold text-xs tracking-wider uppercase transition-colors flex items-center gap-1.5"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>播放並同步曲目</span>
                    </button>
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto space-y-0.5 pr-1">
                    {tracklistItems.map((track) => (
                      <div
                        key={track.id}
                        onClick={() => handleSelectTrackFromList(track)}
                        className="group flex items-center justify-between px-2.5 py-1.5 text-xs cursor-pointer hover:bg-white hover:text-black transition-colors"
                      >
                        <div className="flex items-center gap-2.5 truncate max-w-[70%]">
                          <span className="text-[10px] text-white/40 group-hover:text-black/60 w-4 text-right font-mono">
                            {track.index}
                          </span>
                          <span className="truncate">{track.title}</span>
                        </div>
                        <span className="text-[11px] text-white/50 group-hover:text-black/70 font-mono">
                          {track.duration}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* =====================================================================
          BOTTOM COMPACT HUD:
          Strictly only: Previous, Play/Pause, Next, Up Icon (to reopen tracklist)
          + Accurate MM:SS timeline
         ===================================================================== */}
      <footer className="w-full z-30 border-t border-white/10 bg-[#0a0a0a]/95 px-4 sm:px-8 py-3">
        <div className="max-w-2xl mx-auto flex flex-col gap-2.5">
          {/* Metadata Display — title + ChevronUp side by side */}
          <div className="flex items-center justify-center gap-2">
            <div className="text-center min-w-0">
              <h1 className="text-sm sm:text-base font-semibold tracking-wide text-white uppercase truncate">
                {currentItem ? currentItem.title : 'NO SELECTION'}
              </h1>
              <p className="text-xs tracking-wider text-white/50 uppercase truncate mt-0.5">
                {currentItem ? currentItem.artist : '—'}
              </p>
            </div>
            {/* ChevronUp: Toggle tracklist / liked view */}
            <button
              onClick={() => {
                if (activeCategory === 'tracks') {
                  setLikedViewMode(prev => prev === 'list' ? 'cover' : 'list');
                } else if (currentItem) {
                  if (isTracklistOpen) {
                    setIsTracklistOpen(false);
                  } else {
                    loadItemTracklist(currentItem);
                  }
                }
              }}
              title="重新選取曲目列表"
              aria-label="Reopen track list"
              className="flex-shrink-0 p-1.5 text-white/50 hover:text-white transition-colors"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
          </div>

          {/* Precision Audio Timeline (MM:SS) */}
          <div className="flex items-center gap-3 text-xs tracking-wider text-white/70">
            <span className="w-12 text-left font-mono font-medium text-white">
              {formatDurationMs(currentPositionMs)}
            </span>

            {/* Clickable Seek Bar */}
            <div
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const newPercent = (clickX / rect.width) * 100;
                handleSeek(newPercent);
              }}
              className="flex-1 h-[4px] bg-white/15 relative overflow-hidden cursor-pointer group"
            >
              <div
                className="h-full bg-white transition-all duration-100"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <span className="w-12 text-right font-mono font-medium text-white/70">
              {formatDurationMs(totalDurationMs)}
            </span>
          </div>

          {/* Transport Controls: ONLY Previous, Play/Pause, Next, Up Icon */}
          <div className="flex items-center justify-center gap-6 pt-1">
            {/* Previous */}
            <button
              onClick={goPrev}
              disabled={activeIndex <= 0 || items.length === 0}
              aria-label="Previous track"
              className="p-2 text-white/70 hover:text-white disabled:opacity-20 transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            {/* Play / Pause */}
            <button
              onClick={togglePlay}
              disabled={items.length === 0}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              className="w-10 h-10 rounded-full border border-white/40 flex items-center justify-center text-white hover:bg-white hover:text-black transition-colors"
            >
              {isPlaying ? (
                <Pause className="w-4 h-4 fill-current" />
              ) : (
                <Play className="w-4 h-4 fill-current ml-0.5" />
              )}
            </button>

            {/* Next */}
            <button
              onClick={goNext}
              disabled={activeIndex >= items.length - 1 || items.length === 0}
              aria-label="Next track"
              className="p-2 text-white/70 hover:text-white disabled:opacity-20 transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
