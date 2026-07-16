# XOR and the one-time pad

Modern symmetric crypto is built on **XOR**. XOR each bit of the message with a
key bit: `c = m ⊕ k`. Because XOR is its own inverse, `c ⊕ k = m` — the same key
both encrypts and decrypts.

If the key is **truly random, as long as the message, and never reused**, this
is a **one-time pad** — provably unbreakable. The catch is practicality: you
need to securely share a key as long as everything you'll ever send. Reuse the
key, or use a short repeating key, and the guarantee collapses.

Here, a message was XOR'd with a **single repeating byte** — only 256
possibilities. The tool below decrypts hex with a key you choose, or tries all
256 keys at once. Recover the flag:

```
242e2325393a2d301d2b311d3027342730312b202e273f
```
