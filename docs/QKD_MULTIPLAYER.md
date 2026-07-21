# QKD Multiplayer (same network)

Quantum Intercept can be played by up to 3 students on the same Wi‑Fi/LAN.

## Host
1. On one machine run `python app.py` (serves on `0.0.0.0:8000`).
2. Find that machine's LAN IP (e.g. `ipconfig` on Windows → `192.168.x.y`).
3. Everyone opens `http://<that-ip>:8000/qkd` in a browser on the same network.

## Play
1. One student picks **Multiplayer**, chooses a role (Alice/Bob/Eve) → a 4‑letter **code** appears.
2. The others pick **Multiplayer**, type the code, and claim a free role. Any empty seat is played by the computer, so 1–3 humans all work.
3. The host clicks **Start**. Each round plays out on a **network-map stage** — Alice's laptop → a fiber "quantum channel" → Bob's laptop, with Eve's tap on the wire. **Alice** sets the key length + check sample **and picks a payload file**; **Eve taps individual qubits on the wire and picks a measuring basis (⊕/⊗)** — a wrong guess disturbs the qubit — and can deploy botnet workers; **Bob** watches the intrusion meter and decides **KEEP** or **ABORT**. On resolve, **every player sees a synchronized replay** of the interception on the shared map, then the file de-scrambles for whoever earned the key. After the last round, scores post to the QKD leaderboard.

The replay is **server-authoritative and secrecy-safe**: only public BB84 info (all bases — which are announced during sifting — plus the sampled error positions and Eve's taps) is sent to clients. The secret key bits never leave the server.

Notes: same-network only (no accounts, no internet server). If a player stalls, the computer takes their turn after a minute so the game never freezes.

## File heist + botnet

A real file is the stake of every round — in both **Solo** and same-network **multiplayer**.

**Alice** stakes one of the bundled "classified" samples (mission.txt, codes.txt, photo.png).
**Eve** deploys a botnet of 0–100 workers to brute-force the captured ciphertext, shown as an
animated worker grid with a live keys/sec · crack-ETA · detection readout; more workers crack a
short key faster, but a full-length key stays out of reach ("heat death"). On resolve, each
player sees a **per-seat reveal**: whoever ends the round holding a working key sees the file
decrypt in the clear, everyone else sees scrambled bytes.

- **Bob** decrypts the file when he KEEPs on a clean channel; a tampered or aborted round shows
  scrambled bytes ("no delivery").
- **Eve** sees the file if her botnet finished cracking it in time, and banks a **heist bonus**
  when she also intercepted and Bob kept the key.

The reveal is **server-authoritative**: the server decides per seat who earned the file and
sends the real sample only to that seat — no key material or another player's payload ever
leaks over the wire. (Multiplayer ships bundled samples only; Solo also allows a personal
upload.)
