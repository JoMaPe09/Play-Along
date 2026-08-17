const CLIENT_ID = "4f8f52747c01479c9f3e1db6ac56aa22";
const SCOPES = "user-read-currently-playing user-read-playback-state";

async function loadVar() {
    const response = await fetch("redirect-uri.txt");
    const REDIRECT_URI = await response.text();
}

loadVar();

const loginView = document.getElementById("login-view");
const playerView = document.getElementById("player-view");

function generateRandomString(length) {
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    return Array.from(crypto.getRandomValues(new Uint8Array(length)))
        .map((x) => possible[x % possible.length]).join("");
}

async function sha256(plain) {
    const data = new TextEncoder().encode(plain);
    return crypto.subtle.digest("SHA-256", data);
}

function base64encode(input) {
    return btoa(String.fromCharCode(...new Uint8Array(input)))
        .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function login() {
    const codeVerifier = generateRandomString(64);
    const hashed = await sha256(codeVerifier);
    const codeChallenge = base64encode(hashed);

    localStorage.setItem("sp_code_verifier", codeVerifier);

    const params = new URLSearchParams({
        client_id: CLIENT_ID,
        response_type: "code",
        redirect_uri: REDIRECT_URI,
        scope: SCOPES,
        code_challenge_method: "S256",
        code_challenge: codeChallenge,
    });

    window.location = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

async function exchangeCodeForToken(code) {
    const codeVerifier = localStorage.getItem("sp_code_verifier");

    const params = new URLSearchParams({
        client_id: CLIENT_ID,
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        code_verifier: codeVerifier,
    });

    const res = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params,
    });

    if (!res.ok) throw new Error("Token-Austausch fehlgeschlagen");

    const data = await res.json();
    saveTokens(data);
    return data.access_token;
}

async function refreshAccessToken() {
    const refreshToken = localStorage.getItem("sp_refresh_token");
    if (!refreshToken) return null;

    const params = new URLSearchParams({
        client_id: CLIENT_ID,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
    });

    const res = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params,
    });

    if (!res.ok) return null;
    const data = await res.json();
    saveTokens(data);
    return data.access_token;
}

function saveTokens(data) {
    localStorage.setItem("sp_access_token", data.access_token);
    if (data.refresh_token) localStorage.setItem("sp_refresh_token", data.refresh_token);
    localStorage.setItem("sp_expires_at", Date.now() + data.expires_in * 1000);
}

async function getValidAccessToken() {
    const expiresAt = Number(localStorage.getItem("sp_expires_at") || 0);
    if (Date.now() > expiresAt - 10000) {
        return await refreshAccessToken();
    }
    return localStorage.getItem("sp_access_token");
}

async function getCurrentlyPlaying() {
    const token = await getValidAccessToken();
    if (!token) return null;

    const res = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
        headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 204 || res.status === 202) return { empty: true };
    if (!res.ok) return null;

    const data = await res.json();
    if (!data || !data.item) return { empty: true };

    return {
        songId: data.item.id,
        name: data.item.name,
        artist: data.item.artists.map((a) => a.name).join(", "),
        albumImage: data.item.album.images[0]?.url || "",
        progressMs: data.progress_ms || 0,
        durationMs: data.item.duration_ms,
        isPlaying: data.is_playing,
    };
}

function formatTime(ms) {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = String(totalSec % 60).padStart(2, "0");
    return `${min}:${sec}`;
}

let localProgress = 0;
let durationMs = 0;
let tickTimer = null;
let lastSong = "";

function renderTrack(track) {
    const body = document.body;

    document.getElementById("track-name").textContent = track.name;
    document.getElementById("track-artist").textContent = track.artist;
    document.getElementById("album-art").src = track.albumImage;
    body.style.backgroundImage = `url('${track.albumImage}')`;
    //document.getElementById("track-id-display").textContent = `Spotify Track ID: ${track.songId}`;

    if (lastSong != track.songId) {
        loadLyrics(track.name, track.artist, track.album, track.duration_ms / 1000);
    }

    lastSong = track.songId;

    localProgress = track.progressMs;
    durationMs = track.durationMs;
    updateProgressBar();

    clearInterval(tickTimer);
    if (track.isPlaying) {
        tickTimer = setInterval(() => {
            localProgress = Math.min(localProgress + 1000, durationMs);

            updateProgressBar();
        }, 1000);
    }
}

function updateProgressBar() {
    const percent = durationMs ? (localProgress / durationMs) * 100 : 0;
    document.getElementById("progress-fill").style.width = `${percent}%`;
    //document.getElementById("time-current").textContent = formatTime(localProgress);
    updateLyricsTime(localProgress / 1000);
}

function showEmptyState() {
    clearInterval(tickTimer);
    document.getElementById("track-name").textContent = "Nothing is running right now...";
    document.getElementById("track-artist").textContent = "";
    document.getElementById("track-id-display").textContent = "";
    document.getElementById("progress-fill").style.width = "0%";
}

let pollTimer = null;

async function pollNowPlaying() {
    const track = await getCurrentlyPlaying();
    if (!track) return;
    if (track.empty) {
        showEmptyState();
    } else {
        renderTrack(track);
    }
}

function logout() {
    clearInterval(tickTimer);
    clearInterval(pollTimer);
    localStorage.removeItem("sp_access_token");
    localStorage.removeItem("sp_refresh_token");
    localStorage.removeItem("sp_expires_at");
    localStorage.removeItem("sp_code_verifier");

    playerView.classList.remove("active");
    loginView.style.display = "block";

    document.getElementById("track-name").textContent = "-";
    document.getElementById("track-artist").textContent = "-";
    document.getElementById("album-art").src = "";
    document.getElementById("track-id-display").textContent = "";
    document.getElementById("progress-fill").style.width = "0%";
    document.getElementById("time-current").textContent = "0:00";
    document.getElementById("time-total").textContent = "0:00";
}

async function init() {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("code");

    if (code) {
        await exchangeCodeForToken(code);
        window.history.replaceState({}, document.title, REDIRECT_URI);
    }

    const token = localStorage.getItem("sp_access_token");
    if (token) {
        loginView.style.display = "none";
        playerView.classList.add("active");
        pollNowPlaying();
        pollTimer = setInterval(pollNowPlaying, 3000);
    }
}

document.getElementById("login-btn").addEventListener("click", login);
document.getElementById("logout-btn").addEventListener("click", logout);
init();