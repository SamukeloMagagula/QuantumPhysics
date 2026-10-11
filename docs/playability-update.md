# Playability update

The subsequent [connected campus update](connected-campus.md) replaces the home
screen and separate facility scenes with one persistent map. The gameplay work
below remains available through that map's activity panels.

The main entry now starts with **Find the meeting place**, a short interception
mission. A player chooses between two tools, sees what happens to the signal,
retries freely, and unlocks a rendezvous clue. Completing it saves the first
assignment and an access card, then leads to the next headquarters assignment.
Existing facility progress is preserved on replay.

## Gameplay changes

- The four assignments form a short courier-and-blue-case story. Each successful
  target reveals a clue; the first mission and headquarters share the same rules.
- A winning capture must last at least 1,000 pulses and meet the target's key
  fraction goal. Short lucky captures no longer win. Both extraction and a
  successful natural exchange ending count toward the assigned mission.
- Headquarters credits a win while the result is visible. Its current mission
  console can be opened from the objective panel; walking remains available.
- The console opens on a signal view. Plain-language tool descriptions, strength
  sliders, a defence scan and next-burst risk estimates support decisions. The
  terminal remains available as an advanced view.
- Optional stories, labs and multiplayer live behind an expandable home section.
- The two story scenes offer choices that prevent interception: taking the key
  by a separate route, and verifying the supposed recipient's public key.
- RSA requires choosing the correct factor pair before revealing the vault code.
- Completing a lab leaves the experiment in place; explanations are expandable.
- Network Defender now offers 12 inspect-and-decide reviews per round, with
  plain-language evidence, paused traffic while reading, rewards for allowing
  real requests, and a restart. Colour and address ranges no longer reveal the
  answer. Accessible inspection buttons accompany the correctly scaled canvas.
- Room
  network/rate-limit failures no longer count as wrong answers. Multiplayer
  start/move failures release the busy state and report an error.

## Validation

- Full regression suite: 698 tests passed across 67 files.
- Production build passed. The existing large Three.js chunk warning remains.
- Desktop and mobile browser checks completed all 12 Network Defender decisions
  and restarted successfully, with no JavaScript errors or horizontal overflow.
- Browser checks at 1280×900 and 390×844 completed the first two missions,
  confirmed saved progress, and reported no JavaScript errors or horizontal
  page overflow.
- Mobile review moved the opening action above the fold and replaced nested
  console scrolling with a single mobile scroll flow. Console interaction tests
  passed after this adjustment.
- Seeded balance tests exercise 100 exchanges per target and require a viable
  strategy to succeed at least 95 times. This checks accessibility of a winning
  strategy, not whether a new player can discover it unaided.

## Next validation with players

The provisional reading level is ages 10–13. These changes still need observation
with the intended audience. Ask a new player to recover the first clue without
coaching, explain why a tool was detected, and try the next assignment. Watch for
where they stop reading, whether they change their strategy after failure, and
whether they choose to continue. Technical tests cannot establish that the game
is enjoyable, and the optional learning paths remain instructional.
