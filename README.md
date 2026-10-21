# GT

A browser-based platform game with 100 progressively harder levels, installable
as an app on desktop and mobile.

## Install GT on a device

Open <https://arkmediocre.github.io/GT/> in a supported browser while online.

- **Windows PC:** In Chrome or Edge, select **Install GT** in the game header
  (when shown), or use the browser's **Install this site as an app** menu.
- **Android phone/tablet:** Open the link in Chrome, tap **Install app** if
  offered, or use **⋮ → Install app** / **Add to Home screen**.
- **iPhone/iPad:** Open the link in Safari, tap **Share → Add to Home Screen**.

After the first visit, GT's game files are cached for offline use. Leaderboard
scores still need an internet connection. The app is installed by the browser;
this project cannot install it remotely onto your PC or phone.

## Play locally

Run a static web server from this folder:

```powershell
py -m http.server 8000
```

Then visit <http://localhost:8000>.

- Move: `A` / `D` or the arrow keys
- Jump: `Space`, `W`, or `Up`
- Mobile: hold the on-screen left/right arrows to move; tap **JUMP**
- Pause: `P`
- Restart level: `R` or the restart button
- Toggle AI auto-play: click **AI Pilot** or press `I`; press a movement key to take back control
- After a level is cleared, the next level starts automatically after a short celebration
- Choose an unlocked level: click **Levels** beside the game controls

AI Pilot uses the Python hazard planner when the backend is running and falls
back to the browser's built-in hazard-aware pilot otherwise. It collects every
level coin as it advances, retries automatically after a trap, and engages a
safety net after its first failed attempt so it can finish without repeated
resets.

Each of the 100 levels has its own distinct background palette and an original
procedural melody. The game also plays sound effects for jumps, coins, traps,
and level clears. Start the music with the **♫** button; browsers require a tap
before audio can play. On phones, use the rotate button
to request landscape orientation (browser and device support may be required).

The game automatically adapts its layout to desktop and mobile screens. On
phones, touch controls appear below the game; when the screen is enlarged or
fullscreen, movement, jump, AI, and level-selection buttons remain available
beside the playfield. Press a movement button to take control back from AI.

Use the **Size** slider above the game to resize the play screen from 70% to
150%; the selected size is saved in that browser. Use the fullscreen button
for a larger view, then use the exit button or `Escape` to return. On browsers
without native fullscreen support, the game opens in an in-page fullscreen
view instead. When enlarged on a small screen, swipe across the game to pan.

To play on a phone or tablet on the same Wi-Fi, open
`http://<computer-LAN-IP>:8000` on the device. Find the computer's IPv4 address
with `ipconfig`; allow Python through the computer's private-network firewall
if prompted. For a public link that works outside your Wi-Fi, deploy the
static game with GitHub Pages below.

Collect gold coins along the route. Coin totals and unlocked levels save in the
browser. Levels introduce new hazards as you progress: floor pits, fake exits,
exposed platform gaps, and crumbling ledges. The game now has a moving,
flower-filled countryside backdrop and an animated trail-going adventurer who
walks into the exit and disappears before the level-clear screen appears.

## Enable the worldwide leaderboard

The leaderboard records the best score for each anonymous player on each level.
Scores are ranked by coins collected, then by fastest completion. To connect a
Firebase project:

1. Create a Firebase project, add a **Web app**, and create a **Cloud Firestore**
   database.
2. In **Authentication → Sign-in method**, enable **Anonymous** sign-in. Add
   `localhost` and your published game domain to **Authorized domains**.
3. Copy the Web app's `apiKey`, `authDomain`, `projectId`, and `appId` into
   `firebase-config.js`, replacing the `REPLACE_WITH_...` values.
4. Install the Firebase CLI, run `firebase login`, then from this folder publish
   the security rules and leaderboard index with
   `firebase deploy --only firestore --project YOUR_PROJECT_ID`.
5. Serve or deploy the game over HTTPS, then finish a level to see its scores.

Until a Firebase project is configured, the game displays a setup message rather
than presenting sample results as worldwide scores. The AI pilot runs in the
browser without a backend. Firebase Web app config is public client
configuration; never put a service-account key in this project.

## Publish with GitHub Pages

The workflow in `.github/workflows/pages.yml` deploys this folder on
every push to the repository's `main` branch. To publish it:

1. Create a GitHub repository and add the contents of this folder to its root.
2. In the repository, open **Settings → Pages** and select **GitHub Actions** as
   the build and deployment source.
3. Push the files to `main`, or run **Deploy GT to GitHub Pages** from
   the **Actions** tab.

The published address appears on the workflow run and in **Settings → Pages**.
