# YoutubeWatcher

Lightweight OBS overlay that shows what you're listening to on YouTube Music.

Shows the song you're playing on music.youtube.com in OBS: cover art, title, artist, progress bar and an animated equalizer driven by the real audio.

## How it works

```
music.youtube.com (userscript) ──POST──▶ server.js (127.0.0.1:8974) ──SSE──▶ OBS Browser Source (overlay.html)
```

The userscript reads the track info and taps the player's audio with the Web Audio API to get a 32-band spectrum. The tiny Node server relays it to the overlay. No dependencies, nothing leaves your machine.

## Setup (about 3 minutes)

1. **Install Node.js 18+** (https://nodejs.org) if you don't have it.
2. **Start the server**: double-click `start-windows.bat` (Windows) or run `./start.sh` (macOS/Linux). Leave the window open.
3. **Install the userscript**: install the Tampermonkey or Violentmonkey browser extension, create a new script and paste in `yt-music-now-playing.user.js`. In Chrome, Tampermonkey also needs "Allow User Scripts" enabled on its extension details page.
4. **Add it to OBS**: Sources → + → Browser. URL `http://127.0.0.1:8974/`, width `620`, height `200`. Clear the default "Custom CSS".
5. Open (or reload) music.youtube.com, play something and **click anywhere on the page once**. That click lets the script start the real-audio equalizer (browsers require a user gesture before Web Audio can run). Until then the bars use a simulated animation.

## Options (add to the OBS URL)

| Option | Example | Effect |
|---|---|---|
| `theme` | `?theme=vinyl` | `classic` (default), `glass` (Apple-style liquid glass tinted by the cover), `vinyl` (spinning record with the cover as its label), `retro` (hi-fi LCD with LED level meters) or `minimal` (one-line pill) |
| `bars` | `?bars=24` | Number of equalizer bars (default 32) |
| `accent` | `?accent=00e5ff` | Fixed color instead of one picked from the cover |
| `hidePaused` | `?hidePaused=1` | Fade the overlay out while paused |
| `card` | `?card=0` | No background card, just the content |
| `progress` | `?progress=0` | Hide the progress bar |

Combine with `&`, e.g. `http://127.0.0.1:8974/?bars=24&hidePaused=1`.

Port: set `PORT=9000` before starting the server, and change `SERVER` at the top of the userscript to match.

## Troubleshooting

- **Overlay is empty**: the server isn't running, or the userscript isn't active on music.youtube.com (the Tampermonkey icon should show "1").
- **Bars move but don't follow the music**: you haven't clicked the YT Music page since loading it. Click once.
- **YT Music goes silent**: click the page once (resumes the audio engine). If it persists, disable the script, reload, and report it.
