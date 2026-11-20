# Dice Roller

A desktop dice roller for tabletop games, part of the NIMVORO utility suite. Throw D4, D6, D8, D10, D12, D20 and D100 on a felt table and watch them tumble with real physics.
Tauri 2: Rust shell, TypeScript front end (no UI framework), three.js for rendering and Rapier for physics. A single executable that works fully offline, on Windows and Linux.

## Platforms

- **Windows 10/11 x64.** Needs the WebView2 runtime (preinstalled on Windows 11).
- **Linux x86_64**, X11 or Wayland. Built on Ubuntu 22.04, so it runs on that and newer distributions. The window is a WebKitGTK view, so the system needs `libwebkit2gtk-4.1` and GTK 3 (on Ubuntu/Debian: `sudo apt install libwebkit2gtk-4.1-0`; most desktops have them already). 3D rendering uses WebGL; without a GPU driver, Mesa software rendering works, only slower.

### Linux install and run

The easiest way is the NIMVORO launcher, which installs and updates the tool and adds an application menu entry.
By hand: download `DiceRoller-linux-x64.tar.gz` from the latest release, unpack it and run the binary:

```bash
tar -xzf DiceRoller-linux-x64.tar.gz
./dice-roller
```

The archive holds the `dice-roller` executable and `icon.png`; nothing needs installing. Links open through `xdg-open`.

Known Linux notes:

- The window has its own title bar (no system decorations), so it looks the same everywhere. On Wayland, dragging and resizing are handled by the toolkit; very old compositors may not support moving by dragging.
- Window position is saved but not restored on Wayland, where applications cannot place their own windows. Size and maximised state are restored.
- If the table is black on a very old or virtual GPU, start with `WEBKIT_DISABLE_COMPOSITING_MODE=1 ./dice-roller`.

## Languages

The interface is available in English (default), Russian and Ukrainian. Pick the language in Settings; it applies immediately.
The starting language is taken from the app config (`language`), then from the `.nimvoro.json` marker next to the exe (written by the NIMVORO launcher), and falls back to English.
The choice is saved to the config.

## Theme

Settings → Theme: System (default, follows the Windows or desktop theme), Light or Dark.

## Features

- **Dice.** D4, D6, D8, D10, D12, D20 and D100 (a tens die plus a units die). Proper polyhedra with slightly rounded edges, PBR materials, soft shadows and crisp numbers drawn in code. No external art assets.
- **Throw many at once.** Pick how many of each die to throw (up to 50 in total) and throw them together. Press **Space**, click **Roll**, or flick the mouse across the table to throw in that direction.
- **Fair results.** The value shown is always the face that is up (for the D4, the number at the top corner). The result appears only after the dice have stopped.
- **Dice tray.** One button per die type. Click to add a die, right-click to remove one, or use the − and + buttons. **Clear** empties the tray.
- **Notation.** Type into the field and the tray follows. Errors are shown right under the field.
- **Presets.** Save the current setup (dice, modifier and rules), rename, delete and roll with one click. Three examples ship built in.
- **History.** The last 500 rolls with time, values and total. Copy an entry as text, roll the same setup again, or clear the history. A stats tab shows the roll count, the average against the expected value and a distribution chart per die, for the session and for all time.
- **Result panel.** Every die is listed. Dropped dice are greyed and struck through, exploded and rerolled dice are marked, critical dice glow. Click a die on the table or in the list to highlight it; if no rule chains dice together you can reroll just that die.
- **Skins.** Six presets (ivory, obsidian, ruby, sapphire, emerald, gold) plus a custom body and number colour, for all dice or per die type. The D6 can show numbers or pips.
- **Quick roll.** Skips the animation and uses `crypto.getRandomValues`.
- **Sound.** An optional dice clatter generated with WebAudio (off by default).
- **Idle is free.** The scene is drawn only while something moves, so a still window uses no CPU.

## Notation

| Notation | Meaning |
|---|---|
| `3d6+2` | three six-sided dice plus 2 |
| `d100` | one percentile die |
| `1d8+1d6+3` | several dice types in one roll |
| `2d20kh1` | roll 2d20, keep the highest one (advantage) |
| `2d20kl1` | keep the lowest one (disadvantage) |
| `4d6dl1` | roll 4d6, drop the lowest |
| `4d6dh1` | drop the highest |
| `4d6k3` | same as `kh3` |
| `3d6!` | exploding dice |

Dice sizes are d4, d6, d8, d10, d12, d20 and d100. At most 50 dice per roll. Keep and drop apply per die type.

## Rules

The panel is on the **Rules** tab. By default the dice are simply added up. The rules belong to the current roll and are saved with presets.

- **Modifier.** A flat number added to the total.
- **Keep or drop.** Keep highest, keep lowest, drop highest or drop lowest N, set for each die type. **Advantage** and **Disadvantage** are shortcuts for 2d20 keeping the highest or the lowest.
- **Exploding dice.** A die showing its maximum is rolled again and added, up to 10 times per die. The extra dice are thrown as a second throw.
- **Reroll.** Dice showing up to a chosen value are replaced by a new throw, once or until they show more (up to 10 times).
- **Count successes.** Count the dice that reach a target instead of adding them up. Optionally every 1 removes a success. The modifier is added to the count.
- **Critical highlights.** A natural maximum glows gold and a natural 1 glows red, on the die and in the result. Choose which die types take part (the D20 by default).
- **Totals.** One total for the whole roll, or a subtotal per die type.

The rules are implemented as pure TypeScript in `src/rules/`, separate from rendering, and covered by unit tests.

## Files

Settings live in `%APPDATA%\Dice Roller` on Windows and in `~/.config/Dice Roller` (`$XDG_CONFIG_HOME`) on Linux:

- `config.json`: settings, the current selection and rules, presets;
- `history.json`: the last 500 rolls;
- `stats.json`: all-time statistics;
- `window.json`: window size and position, restored only onto a connected monitor.

Files are written atomically (temporary file, then rename) and read tolerantly (a UTF-8 BOM is accepted). The environment variable `DICEROLLER_DATA_DIR` points the app at another folder.

## Updates

The app checks the latest GitHub release on start (switch it off in Settings) and has a **Check now** button. An update is handed to the NIMVORO launcher (`<launcher> --update dice-roller`, found through `%APPDATA%\NIMVORO\launcher.json` on Windows or `~/.config/NIMVORO/launcher.json` on Linux).
Without the launcher, the releases page opens in the browser. This is the only network use.

Without the launcher, the **Update** button updates the app by itself: it downloads the release archive from GitHub, checks its SHA-256 against the digest GitHub publishes for the asset, swaps the files (the old ones become `*.old`, are removed on the next start, and any failure rolls back) and restarts. If the app folder is not writable, the release page opens instead. Settings and the launcher language marker are never replaced.

Without the launcher, **Update** updates the app by itself with a progress bar in the window: it downloads the release archive, checks its SHA-256 against the digest GitHub publishes for the asset, swaps the files (the old ones become `*.old` and are removed on the next start; any failure rolls back) and restarts. If the app folder is not writable, the release page opens instead.

## Physics and fairness

Dice are convex rigid bodies simulated with [Rapier](https://rapier.rs) (WebAssembly, deterministic, bundled into the exe). Each throw gives every die a random start position, velocity and spin. The simulation runs until every die rests; a die that stays cocked on another die or a rail is nudged. The result is the face whose normal points most nearly up.

A fairness check is built in. It throws dice through the real physics without rendering and compares the distribution of faces with the uniform one (chi-square test, p = 0.001):

```text
DiceRoller.exe --dev-fairness 1200      # on Linux: ./dice-roller --dev-fairness 1200
```

It writes `fairness.txt` to the settings folder (or to the path given with `--out <file>`) and exits. The same code runs in the unit tests.

## Development

```bash
npm install
npm run dev          # Vite dev server (the UI also works in a plain browser, settings go to localStorage)
npm test             # vitest: rules, notation, dice geometry, physics and fairness
npm run build        # type check and bundle the UI
npx tauri build --no-bundle   # builds src-tauri/target/release/DiceRoller.exe (DiceRoller on Linux)
cargo test --manifest-path src-tauri/Cargo.toml
```

Locally there is no MSVC linker, so the GNU (MinGW) toolchain is used; CI builds with MSVC. `src-tauri/build.rs` hides MinGW's default manifest so that the Tauri manifest is kept.

On Linux, install the build packages first: `build-essential pkg-config libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev libssl-dev libxdo-dev`.

Dependencies are pinned to exact versions: three.js 0.187.0 and `@dimforge/rapier3d-compat` 0.21.0 are bundled into the executable; nothing is loaded from a CDN.

## Release

A tag `vX.Y.Z` runs `.github/workflows/release.yml`: it checks that the versions in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml` match the tag, runs the tests, builds on `windows-latest` and `ubuntu-22.04` in parallel, and publishes one release with `DiceRoller-win-x64.zip` and `DiceRoller-linux-x64.tar.gz`.

## Support

If you find Dice Roller useful, you can support its development: https://donatello.to/MicsGame
