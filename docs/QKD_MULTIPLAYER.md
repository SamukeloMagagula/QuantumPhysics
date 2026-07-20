# QKD Multiplayer (same network)

Quantum Intercept can be played by up to 3 students on the same Wi‑Fi/LAN.

## Host
1. On one machine run `python app.py` (serves on `0.0.0.0:8000`).
2. Find that machine's LAN IP (e.g. `ipconfig` on Windows → `192.168.x.y`).
3. Everyone opens `http://<that-ip>:8000/qkd` in a browser on the same network.

## Play
1. One student picks **Multiplayer**, chooses a role (Alice/Bob/Eve) → a 4‑letter **code** appears.
2. The others pick **Multiplayer**, type the code, and claim a free role. Any empty seat is played by the computer, so 1–3 humans all work.
3. The host clicks **Start**. Each round: **Alice** sets the key length + check sample, **Eve** picks how much to intercept, **Bob** sees the error rate (QBER) and decides **KEEP** or **ABORT**. Play resolves and scores update. After the last round, scores post to the QKD leaderboard.

Notes: same-network only (no accounts, no internet server). If a player stalls, the computer takes their turn after a minute so the game never freezes.

## File heist + botnet (solo only, today)

In **Solo (vs computer)** play, Alice can stake a file on the round (one of the bundled
samples, or her own upload) — it rides along with her key setup. Eve can deploy a botnet of
workers to try to brute-force the captured ciphertext before Bob decides; more workers crack
faster but raise detection. Whichever side ends the round holding a working key gets the file
in the clear: Bob decrypts it if he KEEPs on a clean channel, and Eve decrypts it too if her
botnet finished cracking in time (earning a heist bonus). A garbled or aborted round means no
delivery — the pane shows scrambled bytes instead.

Same-network **multiplayer** does not have this yet. The server accepts and stores a file
handle from Alice's action and a worker count from Eve's action (`_clean_action` validates and
clamps both, so malformed or out-of-range values are dropped rather than bricking the round),
but `resolve_round`/`_resolve_scoring` never compute or set a crack result for them — there's
no `fileCracked` outcome in multiplayer, no heist bonus, and no file/botnet UI in the
multiplayer client (`qkd-multi.js`). Today that plumbing is inert storage, laid down for a
future multiplayer file UI.
