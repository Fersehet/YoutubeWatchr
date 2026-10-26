<h1>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/logo/logo-animated.svg">
    <img src="docs/logo/logo-animated-light.svg" alt="YoutubeWatchr" height="72">
  </picture>
</h1>

Show the song you're playing on **YouTube Music** in your OBS stream: cover, title, artist, progress and an equalizer that moves with the music.

<p align="center">
  <img src="docs/themes.gif" alt="The overlay cycling through all eight themes: Classic, Liquid glass, Vinyl, Retro hi-fi, True Damage, League of Legends, Counter-Strike and FACEIT, each with a live equalizer" width="720">
</p>

- 8 designs, from a clean card to a spinning record, plus game styles for League of Legends, Counter-Strike and FACEIT
- An editor in your browser to change colors, fonts, size and more, with a live preview
- Works with just a browser extension through OBS WebSocket, or with a small local server
- Runs on your own computer. No account, no API key, nothing is sent anywhere

## Setup

There are two ways to get your music into OBS. Pick one:

- **Browser extension** (easiest): nothing to install besides the extension. It talks to OBS through OBS's own WebSocket server.
- **Local server**: a userscript plus a small Node server. Use this if you can't use OBS WebSocket.

First download YoutubeWatchr: click **Code → Download ZIP** on this page and unzip it, or run:

```bash
git clone https://github.com/Fersehet/YoutubeWatcher.git
```

### Option A: browser extension

You need **OBS 28 or newer**, which has WebSocket built in.

1. **Turn on OBS WebSocket.** In OBS, open **Tools → WebSocket Server Settings**, tick **Enable WebSocket server** and click **Show Connect Info** to see the port (usually `4455`) and the password.
2. **Load the extension.**
   - **Chrome, Edge, Brave, Opera:** open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick the `extension` folder.
   - **Firefox:** open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on** and pick `extension/manifest.json`. Firefox removes it again when it closes.
3. **Enter the password.** Click the YoutubeWatchr icon in the browser toolbar and type the OBS WebSocket password (and the port, if it isn't 4455).
4. **Make the overlay URL.** Double-click `editor.html` in the download. Under **Connection**, choose **Extension** and enter the same port and password. Pick a design and click **Copy URL**.
5. **Add it to OBS.** Click **+** under Sources and choose **Browser**. Untick **Local file**, paste the URL, set the width and height the editor shows (`620` × `200` by default) and delete the text in **Custom CSS**.
6. **Play music.** Open [music.youtube.com](https://music.youtube.com) (reload it if it was already open), start a song and **click once anywhere on the page**. The extension icon shows **Connected to OBS**, and the overlay appears.

The click is needed because browsers only allow reading the audio after you interact with the page. Until then the equalizer plays a made-up animation.

### Option B: local server

You need **[Node.js](https://nodejs.org)** (version 18 or newer) and a browser extension for userscripts: **[Tampermonkey](https://www.tampermonkey.net)** or **[Violentmonkey](https://violentmonkey.github.io)**.

1. **Start the server.** On Windows, double-click `start-windows.bat`. On macOS or Linux, run `./start.sh` in a terminal. A window opens and says the overlay is running. Keep it open while you stream.
2. **Install the userscript.** With Tampermonkey or Violentmonkey installed, open this link and click **Install**: **[Install yt-music-now-playing.user.js](https://raw.githubusercontent.com/Fersehet/YoutubeWatchr/main/yt-music-now-playing.user.js)**

   > Chrome only: open the Tampermonkey extension details (`chrome://extensions`) and turn on **Allow User Scripts**, otherwise the script won't run.

3. **Add it to OBS.** Click **+** under Sources and choose **Browser**. URL: `http://127.0.0.1:8974/`, width `620`, height `200`. Delete the text in **Custom CSS**.
4. **Play music.** Open [music.youtube.com](https://music.youtube.com), start a song and **click once anywhere on the page**.

## Customize it

Double-click `editor.html` in the download, or with the server running, open **[http://127.0.0.1:8974/editor](http://127.0.0.1:8974/editor)**.

![The editor: a preview of the overlay in a sample stream scene on the left, settings for theme, layout, colors, text and equalizer on the right](docs/editor.png)

1. Pick a theme and change whatever you like. The preview updates right away. Untick **Demo songs** to see your own music.
2. Click **Copy URL**.
3. In OBS, open your Browser source, paste the URL and set the width and height the editor shows under the URL.

The editor remembers your settings.

## Compact version

Every theme also has a **compact** version, a slim one-line bar where the progress runs around the cover:

<p align="center">
  <img src="docs/compact.png" alt="Compact versions of the Liquid glass and Vinyl themes">
</p>

Most themes take their colors from the album cover. The game themes use their own colors.

## All options

The editor writes these for you. If you prefer, add them to the OBS URL yourself, starting with `?` and joined with `&`, for example `http://127.0.0.1:8974/?theme=vinyl&compact=1`.

**Look**

| Option | Example | What it does |
|---|---|---|
| `theme` | `?theme=vinyl` | `classic` (default), `glass`, `vinyl`, `retro`, `truedamage`, `lol`, `cs` or `faceit` |
| `compact` | `?compact=1` | Slim one-line version |
| `width` | `?compact=1&width=380` | Width of the compact bar in pixels (default 460). Long names scroll inside |
| `scale` | `?scale=1.5` | Make everything bigger or smaller (0.3 to 3). Multiply the OBS width and height by the same number |
| `card` | `?card=0` | No background, just the content |
| `still` | `?still=1` | No animations: no equalizer, no scrolling text, no spinning record |

**Colors and text**

| Option | Example | What it does |
|---|---|---|
| `accent` | `?accent=00e5ff` | Your own main color instead of one from the cover |
| `accent2` | `?accent2=ffb000` | Second color for gradients, used with `accent` |
| `text` | `?text=ffffff` | Title color |
| `bg`, `bgAlpha` | `?bg=101218&bgAlpha=0.6` | Background color and how see-through it is (0 to 1) |
| `radius` | `?radius=4` | Corner rounding in pixels |
| `font` | `?font=Poppins` | Any font from [Google Fonts](https://fonts.google.com) |
| `label` | `?label=On+air` | Text instead of "Now Playing" |
| `showLabel` | `?showLabel=0` | Hide that text |

**What to show**

| Option | Example | What it does |
|---|---|---|
| `album`, `cover`, `eq`, `progress` | `?album=0` | Set to `0` to hide the album name, cover, equalizer or progress bar |
| `bars` | `?bars=24` | Number of equalizer bars (default 32) |
| `hidePaused` | `?hidePaused=1` | Hide the overlay while the music is paused |
| `demo` | `?demo=1` | Show demo songs instead of your music, for testing |

**Connection**

| Option | Example | What it does |
|---|---|---|
| `obs` | `?obs=1` | Get the music from the browser extension through OBS WebSocket |
| `port` | `?obs=1&port=4455` | OBS WebSocket port (default 4455) |
| `pw` | `?obs=1&pw=abc123` | OBS WebSocket password |

## Troubleshooting

- **The extension says "OBS not reachable":** check that OBS is open and that **Enable WebSocket server** is ticked under Tools → WebSocket Server Settings, with the same port as in the extension.
- **The extension says "Wrong password":** copy the password again from **Show Connect Info** in OBS. If authentication is off in OBS, leave the password empty.
- **Nothing shows up in OBS (extension):** check that the OBS URL has `obs=1` and the same password, and that **Local file** is unticked. Reload YouTube Music.
- **Nothing shows up in OBS (server):** check that the server window is still open, and that the userscript is on for music.youtube.com (the Tampermonkey icon shows a "1" on that tab). Reload YouTube Music.
- **The equalizer moves but not with the music:** click once on the YouTube Music page.
- **YouTube Music goes quiet:** click once on the page. If it stays quiet, turn the extension or userscript off, reload, and open an issue.
- **Port 8974 is already in use:** start the server with another port, for example `PORT=9000` (on Windows: `set PORT=9000` before `node server.js`), and change `SERVER` at the top of the userscript to the same port.

## How it works

```
Extension:  YouTube Music tab  ──▶  OBS WebSocket (built into OBS)  ──▶  OBS Browser Source (overlay.html?obs=1)
Server:     YouTube Music tab  ──▶  server.js on your computer       ──▶  OBS Browser Source (overlay.html)
```

The extension (or the userscript) reads the song info from the YouTube Music page and measures the audio with the browser's Web Audio API. The extension sends both to OBS as a WebSocket custom event, which the overlay listens for. The userscript sends them to `server.js`, a small Node server with no dependencies, which passes them on to the overlay. The cover is loaded straight from YouTube Music. Everything else stays on `127.0.0.1`.
