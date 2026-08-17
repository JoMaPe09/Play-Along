let currentLyrics = [];
let activeLine = -1;

async function loadLyrics(trackName, artistName, albumName = '', duration = null) {
    const lyricsBox = document.getElementById('lyricsBox');
    lyricsBox.innerHTML = '<div class="lyrics-placeholder">Loading lyrics...</div>';
    currentLyrics = [];
    activeLine = -1;

    try {
        const params = new URLSearchParams({
            track_name: trackName,
            artist_name: artistName
        });
        if (albumName) params.append('album_name', albumName);
        if (duration) params.append('duration', Math.round(duration));

        const response = await fetch(`https://lrclib.net/api/get?${params.toString()}`);

        if (!response.ok) {
            throw new Error(`API-Fehler: ${response.status}`);
        }

        const data = await response.json();

        if (!data.syncedLyrics) {
            lyricsBox.innerHTML = '<div class="lyrics-placeholder">No lyrics found...</div>';
            return;
        }

        currentLyrics = parseLRC(data.syncedLyrics);
        renderLyrics();

    } catch (err) {
        console.error('Fehler beim Laden der Lyrics:', err);
        lyricsBox.innerHTML = '<div class="lyrics-placeholder">Error corrupted while loading lyrics....</div>';
    }
}

function parseLRC(lrcText) {
    const lines = lrcText.split('\n');
    const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;
    const result = [];

    for (const line of lines) {
        const match = line.match(timeRegex);
        if (!match) continue;

        const minutes = parseInt(match[1], 10);
        const seconds = parseInt(match[2], 10);
        const millis = parseInt(match[3].padEnd(3, '0'), 10);
        const time = minutes * 60 + seconds + millis / 1000;

        const text = line.replace(timeRegex, '').trim();
        result.push({ time, text: text || '♪' });
    }

    return result.sort((a, b) => a.time - b.time);
}

function renderLyrics() {
    const lyricsBox = document.getElementById('lyricsBox');

    if (currentLyrics.length === 0) {
        lyricsBox.innerHTML = '<div class="lyrics-placeholder">No lyrics available...</div>';
        return;
    }

    lyricsBox.innerHTML = currentLyrics
        .map((line, index) => `<div class="lyric-line" data-index="${index}">${escapeHtml(line.text)}</div>`)
        .join('');
}

function updateLyricsTime(currentTimeSeconds) {
    if (currentLyrics.length === 0) return;

    let newActiveLine = -1;
    for (let i = 0; i < currentLyrics.length; i++) {
        if (currentLyrics[i].time <= currentTimeSeconds) {
            newActiveLine = i;
        } else {
            break;
        }
    }

    if (newActiveLine === activeLine) return;

    const lyricsBox = document.getElementById('lyricsBox');
    const lines = lyricsBox.querySelectorAll('.lyric-line');

    if (activeLine >= 0 && lines[activeLine]) {
        lines[activeLine].classList.remove('active');
    }

    if (newActiveLine >= 0 && lines[newActiveLine]) {
        lines[newActiveLine].classList.add('active');
        lines[newActiveLine].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    activeLine = newActiveLine;
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}