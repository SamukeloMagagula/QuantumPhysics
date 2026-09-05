import { Exam } from './labExam';

/**
 * The section tests.
 *
 * Written to be failed honestly. Nearly every wrong option is something a
 * reasonable person actually believes — "HTTPS means the site is safe",
 * "the attacker needs more bandwidth than you", "quantum key distribution
 * stops the interception" — because a distractor nobody would pick tests
 * nothing. The `why` on each question is the real payload; it is shown
 * after marking whether the answer was right or wrong.
 */

export const EXAMS: Exam[] = [
  // ------------------------------------------------------------ foundations
  {
    id: 'exam-foundations',
    section: 'Foundations',
    title: 'Foundations Test',
    blurb: 'Why encryption exists, what it does and does not protect, and why one shared key is not enough.',
    passPercent: 70,
    questions: [
      {
        kind: 'choose',
        id: 'f1',
        prompt: 'A message crosses the internet unencrypted. Who can read it?',
        options: [
          { id: 'a', text: 'Only the intended recipient' },
          { id: 'b', text: 'Anyone who handles it along the way — every network it crosses' },
          { id: 'c', text: 'Only someone with physical access to the recipient’s machine' },
          { id: 'd', text: 'Nobody, because internet traffic is split into packets' },
        ],
        answer: 'b',
        why:
          'Traffic is relayed hop by hop, and every hop can read what it forwards — your network, your ISP, the ' +
          'transit networks in between, the destination’s host. Splitting it into packets changes nothing: whoever ' +
          'carries the packets can reassemble them. That is the problem encryption was invented to solve.',
      },
      {
        kind: 'choose',
        id: 'f2',
        prompt: 'Encryption protects confidentiality. Which of these does it NOT give you on its own?',
        options: [
          { id: 'a', text: 'Certainty about who actually sent the message' },
          { id: 'b', text: 'Protection from someone reading the contents' },
          { id: 'c', text: 'Protection from a passive eavesdropper on the wire' },
          { id: 'd', text: 'Scrambling that is useless without the key' },
        ],
        answer: 'a',
        why:
          'Encryption hides content. It does not, by itself, tell you who encrypted it — anyone holding the key can ' +
          'produce a valid-looking message. Knowing the sender is authentication, and it is a separate mechanism ' +
          '(signatures, MACs, certificates). Confusing the two is how people end up trusting an encrypted message ' +
          'from an attacker.',
      },
      {
        kind: 'choose',
        id: 'f3',
        prompt: 'Alice and Bob share one secret key. What is the problem this creates?',
        options: [
          { id: 'a', text: 'Symmetric encryption is too slow for real messages' },
          { id: 'b', text: 'They have to get the key to each other secretly first — and that is the same problem again' },
          { id: 'c', text: 'A shared key can only be used once' },
          { id: 'd', text: 'Shared keys cannot be longer than the message' },
        ],
        answer: 'b',
        why:
          'This is the key distribution problem, and it is circular: to send the key securely you need a secure ' +
          'channel, which is what you were trying to build. Symmetric encryption is in fact fast — speed is not the ' +
          'issue. Getting the key there is.',
      },
      {
        kind: 'choose',
        id: 'f4',
        prompt: 'How does asymmetric (public-key) encryption break that circle?',
        options: [
          { id: 'a', text: 'The key is short enough to read out over the phone' },
          { id: 'b', text: 'Everyone agrees on a key in advance at the factory' },
          { id: 'c', text: 'The key that locks is public and the key that unlocks is private, so the public half can be published' },
          { id: 'd', text: 'The message is encrypted twice, so intercepting it once is useless' },
        ],
        answer: 'c',
        why:
          'The pair is asymmetric: what the public key locks, only the private key opens. So the public half can be ' +
          'shouted from the rooftops — Eve reading it gains nothing, because reading the lock does not give her the ' +
          'means to open it. Nothing secret ever has to travel.',
      },
      {
        kind: 'multi',
        id: 'f5',
        prompt: 'Select every statement that is true of symmetric encryption.',
        options: [
          { id: 'a', text: 'The same key both encrypts and decrypts' },
          { id: 'b', text: 'It is fast and well suited to bulk data' },
          { id: 'c', text: 'The key can safely be published' },
          { id: 'd', text: 'Everyone who can read must be trusted with the ability to write' },
        ],
        answer: ['a', 'b', 'd'],
        why:
          'One key doing both jobs is exactly what makes it fast and exactly what makes it awkward: publishing the ' +
          'key would hand over the ability to decrypt, and anyone you give read access to can also produce ' +
          'ciphertext. Real systems use both kinds — asymmetric to agree on a key, symmetric to carry the traffic.',
      },
      {
        kind: 'choose',
        id: 'f6',
        prompt: 'A site shows a padlock and https://. What has it actually proven?',
        options: [
          { id: 'a', text: 'The site is run by a legitimate business' },
          { id: 'b', text: 'The connection is encrypted and the certificate matches the domain in the bar' },
          { id: 'c', text: 'The site has been checked for malware' },
          { id: 'd', text: 'The data you submit will be stored securely' },
        ],
        answer: 'b',
        why:
          'The padlock is a statement about the pipe, not about who is at the other end of it or what they do with ' +
          'what you send. A phishing site can hold a perfectly valid certificate for its own lookalike domain — and ' +
          'most do. The useful question is never "is there a padlock" but "is that the domain I meant".',
      },
    ],
  },

  // ------------------------------------------------------------ web attacks
  {
    id: 'exam-web',
    section: 'Web Attacks',
    title: 'Web Attacks Test',
    blurb: 'Injection and cross-site scripting: what actually causes them, and what actually fixes them.',
    passPercent: 70,
    questions: [
      {
        kind: 'choose',
        id: 'w1',
        prompt: 'What is the root cause of SQL injection?',
        options: [
          { id: 'a', text: 'Weak database passwords' },
          { id: 'b', text: 'Untrusted input being built into a query as code rather than passed as data' },
          { id: 'c', text: 'Using an old version of the database' },
          { id: 'd', text: 'Failing to encrypt the database at rest' },
        ],
        answer: 'b',
        why:
          'The database does exactly what it is told; the bug is that the attacker got to write part of the ' +
          'instruction. Once input is concatenated into a query string, the quote marks the attacker supplies end ' +
          'your string and start their code. Nothing about passwords, versions or disk encryption touches that.',
      },
      {
        kind: 'choose',
        id: 'w2',
        prompt: 'Which defence actually stops injection, rather than making it harder?',
        options: [
          { id: 'a', text: 'Stripping quote characters from input' },
          { id: 'b', text: 'Blocking requests containing the word SELECT' },
          { id: 'c', text: 'Parameterised queries, where input can never be parsed as SQL' },
          { id: 'd', text: 'Hiding database errors from the user' },
        ],
        answer: 'c',
        why:
          'Parameterised queries send the code and the data down separate channels, so the input is never parsed as ' +
          'instructions no matter what it contains. Filters are a losing game — there is always another encoding — ' +
          'and hiding errors only makes the same vulnerability quieter to exploit.',
      },
      {
        kind: 'choose',
        id: 'w3',
        prompt: 'A stored XSS payload runs in another user’s browser. Whose privileges does it get?',
        options: [
          { id: 'a', text: 'The attacker’s' },
          { id: 'b', text: 'The victim’s — it runs as them, in their session' },
          { id: 'c', text: 'The web server’s' },
          { id: 'd', text: 'None; browsers sandbox all injected script' },
        ],
        answer: 'b',
        why:
          'That is what makes XSS serious. The script is delivered by the site the victim trusts, so it runs inside ' +
          'their session with their cookies and their permissions — it can act as them. An admin viewing the page is ' +
          'an admin-privileged attack.',
      },
      {
        kind: 'choose',
        id: 'w4',
        prompt: 'Where must output encoding be applied to prevent XSS?',
        options: [
          { id: 'a', text: 'When the data is first received, before storing it' },
          { id: 'b', text: 'At the point the data is written into the page, encoded for that exact context' },
          { id: 'c', text: 'In the database schema' },
          { id: 'd', text: 'Only on data that came from a form' },
        ],
        answer: 'b',
        why:
          'What counts as dangerous depends on where it lands: HTML body, an attribute, a URL and inside a script ' +
          'block all need different escaping. Encoding on the way in mangles the stored data and still gets it wrong ' +
          'somewhere, because the same value may be rendered in several contexts.',
      },
      {
        kind: 'multi',
        id: 'w5',
        prompt: 'Select every input a web application should treat as untrusted.',
        options: [
          { id: 'a', text: 'Form fields' },
          { id: 'b', text: 'URL parameters' },
          { id: 'c', text: 'HTTP headers, including User-Agent and Referer' },
          { id: 'd', text: 'Values in a hidden field the app itself set' },
        ],
        answer: ['a', 'b', 'c', 'd'],
        why:
          'All of it. Anything that arrives over the network is under the sender’s control, whatever the app put ' +
          'there originally — a hidden field is hidden from the user interface, not from the person editing the ' +
          'request. The only trustworthy state is state the server kept.',
      },
    ],
  },

  // --------------------------------------------- social engineering & creds
  {
    id: 'exam-social',
    section: 'Social Engineering & Passwords',
    title: 'Phishing & Passwords Test',
    blurb: 'Spotting a phish for the right reasons, and why some password advice is backwards.',
    passPercent: 70,
    questions: [
      {
        kind: 'choose',
        id: 's1',
        prompt: 'Which single detail most reliably identifies a phishing message?',
        options: [
          { id: 'a', text: 'Spelling mistakes' },
          { id: 'b', text: 'The real destination of the link or sender domain' },
          { id: 'c', text: 'The message being unexpected' },
          { id: 'd', text: 'An attachment being present' },
        ],
        answer: 'b',
        why:
          'The domain is the one thing the attacker cannot fake — they can copy the logo, the wording and the ' +
          'layout perfectly, but they cannot own the real domain, so they use a lookalike. Spelling has improved, ' +
          'plenty of legitimate mail is unexpected, and attachments are normal. Check where it actually goes.',
      },
      {
        kind: 'choose',
        id: 's2',
        prompt: 'Why do phishing messages impose deadlines — "within 1 hour", "account closes today"?',
        options: [
          { id: 'a', text: 'Their infrastructure is taken down quickly, so they need a fast response' },
          { id: 'b', text: 'To stop you verifying through another channel before you act' },
          { id: 'c', text: 'To make the message look more official' },
          { id: 'd', text: 'To get past spam filters' },
        ],
        answer: 'b',
        why:
          'Urgency is not decoration, it is the attack. Verifying takes a few minutes — phoning the helpdesk, ' +
          'checking the log, asking a colleague — and the deadline exists to make those few minutes feel too ' +
          'expensive. Treat manufactured time pressure as the tell it is.',
      },
      {
        kind: 'choose',
        id: 's3',
        prompt: 'You get a message that genuinely does relate to a real security incident at your organisation. What follows?',
        options: [
          { id: 'a', text: 'It is probably legitimate — attackers would not know about the incident' },
          { id: 'b', text: 'Nothing. A message referencing something true is exactly what a convincing phish looks like' },
          { id: 'c', text: 'It must be phishing, since real incidents are never emailed about' },
          { id: 'd', text: 'It is safe to reply as long as you do not click any links' },
        ],
        answer: 'b',
        why:
          'Attackers read the same news, and incidents leak. Plausibility is what a good phish is built from, so ' +
          '"this refers to something real" is not evidence either way. Verify through a channel you chose yourself, ' +
          'not one the message handed you — and replying is itself an action worth withholding.',
      },
      {
        kind: 'choose',
        id: 's4',
        prompt: 'Which password is hardest for an offline cracker to recover?',
        options: [
          { id: 'a', text: 'P@ssw0rd!2024' },
          { id: 'b', text: 'Tr0ub4dor&3' },
          { id: 'c', text: 'correct horse battery staple' },
          { id: 'd', text: 'X7q!' },
        ],
        answer: 'c',
        why:
          'Cracking tools do not guess character by character; they run dictionaries and known mangling rules. ' +
          'Substituting a for @ and o for 0 is the first rule they try, so the "complex-looking" options fall fast. ' +
          'Length from several unrelated words wins because it multiplies the search space instead of decorating it.',
      },
      {
        kind: 'multi',
        id: 's5',
        prompt: 'A password database is stolen. Select every measure that limits the damage.',
        options: [
          { id: 'a', text: 'Hashing with a slow algorithm designed for passwords, such as bcrypt or Argon2' },
          { id: 'b', text: 'A unique random salt per password' },
          { id: 'c', text: 'Storing passwords encrypted with a key held on the same server' },
          { id: 'd', text: 'Requiring a second factor to sign in' },
        ],
        answer: ['a', 'b', 'd'],
        why:
          'Slow hashing makes each guess expensive; per-password salts stop one precomputed table breaking every ' +
          'account at once; a second factor means a recovered password is not enough on its own. Encryption with a ' +
          'key kept beside the data is not protection — whoever took the database took the key too.',
      },
    ],
  },

  // -------------------------------------------------------------- wireless
  {
    id: 'exam-wireless',
    section: 'Wireless',
    title: 'Wireless Test',
    blurb: 'Why a network name proves nothing, and what an evil twin actually gets.',
    passPercent: 70,
    questions: [
      {
        kind: 'choose',
        id: 'r1',
        prompt: 'What does an evil twin access point actually impersonate?',
        options: [
          { id: 'a', text: 'The hardware address of the real router, which cannot be changed' },
          { id: 'b', text: 'The network name — which anyone can broadcast, because it is just a string' },
          { id: 'c', text: 'The internet service provider' },
          { id: 'd', text: 'The victim’s device' },
        ],
        answer: 'b',
        why:
          'An SSID is an advertised name with nothing behind it. Anyone can broadcast "Airport_Free_WiFi", and ' +
          'devices that remember the name will happily reconnect. Hardware addresses are equally forgeable — the ' +
          'name is simply the easiest thing to copy.',
      },
      {
        kind: 'choose',
        id: 'r2',
        prompt: 'You connect to an attacker’s access point but only browse HTTPS sites. What can they still see?',
        options: [
          { id: 'a', text: 'Nothing at all' },
          { id: 'b', text: 'Which sites you visit, and how much traffic goes where' },
          { id: 'c', text: 'The full contents of every page' },
          { id: 'd', text: 'Your saved passwords' },
        ],
        answer: 'b',
        why:
          'HTTPS protects the contents, not the fact of the connection. The operator of the network still sees the ' +
          'destinations you reach, the timing and the volume — enough to know you visited a bank, a clinic or a job ' +
          'site. That metadata is often the sensitive part.',
      },
      {
        kind: 'choose',
        id: 'r3',
        prompt: 'Which habit most reduces evil-twin risk?',
        options: [
          { id: 'a', text: 'Only joining networks with a password' },
          { id: 'b', text: 'Turning off automatic reconnection to remembered networks' },
          { id: 'c', text: 'Choosing the access point with the strongest signal' },
          { id: 'd', text: 'Renaming your device' },
        ],
        answer: 'b',
        why:
          'Automatic reconnection is what makes the attack effortless: your device announces the names it trusts and ' +
          'joins whatever answers to one. A password on the attacker’s network proves nothing — they chose it — and ' +
          'the strongest signal is usually the one closest to you, which is the attacker.',
      },
      {
        kind: 'multi',
        id: 'r4',
        prompt: 'Select every warning sign that a network may not be what it claims.',
        options: [
          { id: 'a', text: 'A captive portal asking for an email password' },
          { id: 'b', text: 'A certificate warning on a site that normally has none' },
          { id: 'c', text: 'Two networks with the same name and different signal strengths' },
          { id: 'd', text: 'The network being open, with no password' },
        ],
        answer: ['a', 'b', 'c'],
        why:
          'A portal that wants credentials for an unrelated service, a certificate error appearing out of nowhere, ' +
          'and duplicate names are all things a normal network does not do. Open networks are merely unencrypted — ' +
          'common and not suspicious by itself, which is exactly why attackers offer them.',
      },
    ],
  },

  // ------------------------------------------------- network & availability
  {
    id: 'exam-availability',
    section: 'Network & Availability',
    title: 'Availability Test',
    blurb: 'Denial of service: what makes it work, and what actually holds a service up.',
    passPercent: 70,
    questions: [
      {
        kind: 'choose',
        id: 'd1',
        prompt: 'What makes a denial-of-service attack "distributed"?',
        options: [
          { id: 'a', text: 'The traffic is spread across several of the target’s services' },
          { id: 'b', text: 'It comes from many sources at once, so blocking one address achieves nothing' },
          { id: 'c', text: 'It runs from several countries' },
          { id: 'd', text: 'It attacks several layers of the network stack' },
        ],
        answer: 'b',
        why:
          'The distribution is in the sources. One attacking address is a firewall rule; a hundred thousand ' +
          'addresses, each looking like a plausible visitor, is a problem you cannot solve by blocking — which is ' +
          'precisely why attackers use botnets.',
      },
      {
        kind: 'choose',
        id: 'd2',
        prompt: 'Which security property does a DDoS attack target?',
        options: [
          { id: 'a', text: 'Confidentiality' },
          { id: 'b', text: 'Integrity' },
          { id: 'c', text: 'Availability' },
          { id: 'd', text: 'All three equally' },
        ],
        answer: 'c',
        why:
          'Nothing is read and nothing is altered — the data is exactly as it was. It simply cannot be reached, and ' +
          'a service nobody can use has failed just as surely as one that leaked. Availability is the third leg of ' +
          'the triad and the one most often treated as an operations problem rather than a security one.',
      },
      {
        kind: 'choose',
        id: 'd3',
        prompt: 'An amplification attack sends small requests to third-party servers with a spoofed source address. Why?',
        options: [
          { id: 'a', text: 'To hide which country the attacker is in' },
          { id: 'b', text: 'Because the replies are far larger than the requests, and they all land on the victim' },
          { id: 'c', text: 'To bypass the victim’s firewall rules' },
          { id: 'd', text: 'To make the traffic look encrypted' },
        ],
        answer: 'b',
        why:
          'The attacker is borrowing bandwidth. A small query can trigger a reply tens of times larger, and because ' +
          'the source address was forged as the victim’s, every one of those replies is delivered to the victim. A ' +
          'modest connection can generate a flood far beyond its own capacity.',
      },
      {
        kind: 'choose',
        id: 'd4',
        prompt: 'Under attack, why is rate limiting per source better than simply raising the traffic ceiling?',
        options: [
          { id: 'a', text: 'It costs nothing to run' },
          { id: 'b', text: 'It removes abusive senders while leaving normal users inside their normal limits' },
          { id: 'c', text: 'It makes the attack traffic disappear before it reaches your network' },
          { id: 'd', text: 'It works against any volume of traffic' },
        ],
        answer: 'b',
        why:
          'Rate limiting discriminates: a real visitor making a few requests a minute never notices, while a source ' +
          'making thousands is cut off. Raising the ceiling helps everyone equally, attacker included. Note that ' +
          'the traffic still arrives at your edge — if the pipe itself is full, filtering has to happen upstream.',
      },
      {
        kind: 'multi',
        id: 'd5',
        prompt: 'Select every measure that genuinely improves resilience to a volumetric attack.',
        options: [
          { id: 'a', text: 'Absorbing and filtering traffic upstream, before it reaches your link' },
          { id: 'b', text: 'Caching so most requests never touch the application' },
          { id: 'c', text: 'Automatically scaling capacity with demand' },
          { id: 'd', text: 'Hiding the server’s address and hoping it is not found' },
        ],
        answer: ['a', 'b', 'c'],
        why:
          'Filtering upstream is the only thing that helps once your own link is saturated; caching and scaling ' +
          'raise how much you can absorb. Concealing the address is not resilience — it is a secret that leaks via ' +
          'DNS history, certificates and a single misconfigured service, and it fails exactly when tested.',
      },
    ],
  },

  // ---------------------------------------------------------- cryptography
  {
    id: 'exam-crypto',
    section: 'Cryptography',
    title: 'Cryptography & QKD Test',
    blurb: 'Classical ciphers, public keys, and what quantum key distribution really promises.',
    passPercent: 70,
    questions: [
      {
        kind: 'choose',
        id: 'c1',
        prompt: 'Why does a Caesar cipher fall to frequency analysis?',
        options: [
          { id: 'a', text: 'The key is too short to remember' },
          { id: 'b', text: 'Each letter always maps to the same letter, so the language’s letter pattern survives' },
          { id: 'c', text: 'It only works on English text' },
          { id: 'd', text: 'The shift is always three' },
        ],
        answer: 'b',
        why:
          'A fixed substitution moves the alphabet but preserves its shape: whatever is commonest in the plaintext ' +
          'is commonest in the ciphertext. That is enough to recover the shift without trying a single key. The ' +
          'lesson generalises — any cipher that leaks structure leaks the message.',
      },
      {
        kind: 'choose',
        id: 'c2',
        prompt: 'RSA’s security rests on which hard problem?',
        options: [
          { id: 'a', text: 'Reversing a hash function' },
          { id: 'b', text: 'Factoring a large number into its two prime factors' },
          { id: 'c', text: 'Guessing a long random password' },
          { id: 'd', text: 'Sorting very large datasets' },
        ],
        answer: 'b',
        why:
          'Multiplying two large primes is trivial; splitting the product back apart is not, and the public key ' +
          'hands you the product. Small keys fall in seconds precisely because that gap closes as the numbers get ' +
          'smaller — the difficulty is a property of size, not of secrecy.',
      },
      {
        kind: 'choose',
        id: 'c3',
        prompt: 'In BB84, what does Eve’s measurement of a photon actually do?',
        options: [
          { id: 'a', text: 'Copies it silently, leaving no trace' },
          { id: 'b', text: 'Disturbs it, so measuring in the wrong basis introduces errors Alice and Bob can detect' },
          { id: 'c', text: 'Blocks it, so Bob receives nothing' },
          { id: 'd', text: 'Slows the transmission enough to be noticed' },
        ],
        answer: 'b',
        why:
          'She has to guess a basis, and half the time she guesses wrong — which randomises what Bob then measures. ' +
          'Comparing a sample of their results reveals an error rate that honest noise does not explain. The physics ' +
          'does not prevent her listening; it prevents her listening *unnoticed*.',
      },
      {
        kind: 'choose',
        id: 'c4',
        prompt: 'What does QKD actually deliver?',
        options: [
          { id: 'a', text: 'Encrypted messages that cannot be decrypted' },
          { id: 'b', text: 'A shared secret key, plus evidence of whether anyone listened while it was established' },
          { id: 'c', text: 'Authentication of who is at the other end of the fibre' },
          { id: 'd', text: 'Immunity from all future attacks on the encrypted traffic' },
        ],
        answer: 'b',
        why:
          'It is key *distribution* — it produces a key and a tamper indication, and the traffic is then encrypted ' +
          'classically with that key. Notably it does not authenticate: without a separate mechanism proving who ' +
          'is on the other end, you may have established an impeccably secure key with an impostor.',
      },
      {
        kind: 'order',
        id: 'c5',
        prompt: 'Put a BB84 key exchange in order.',
        items: [
          { id: 'i1', text: 'Alice sends photons, each in a randomly chosen basis' },
          { id: 'i2', text: 'Bob measures each photon in a basis he picks at random' },
          { id: 'i3', text: 'They publicly compare which bases they used and discard the mismatches' },
          { id: 'i4', text: 'They compare a sample of the remaining bits to estimate the error rate' },
          { id: 'i5', text: 'If the error rate is low enough, the remaining bits become the shared key' },
        ],
        answer: ['i1', 'i2', 'i3', 'i4', 'i5'],
        why:
          'Note what is public and when: the bases are compared openly, which is safe because a basis reveals ' +
          'nothing about the bit. The sample bits are sacrificed to measure interference and then thrown away. Only ' +
          'what is left, never transmitted and never discussed, becomes the key.',
      },
      {
        kind: 'multi',
        id: 'c6',
        prompt: 'Select every statement that is true of a real BB84 deployment.',
        options: [
          { id: 'a', text: 'A high error rate means the key must be discarded' },
          { id: 'b', text: 'Some errors occur naturally, from imperfect equipment and fibre loss' },
          { id: 'c', text: 'The key is used with ordinary symmetric encryption to protect the traffic' },
          { id: 'd', text: 'It removes the need to authenticate the other party' },
        ],
        answer: ['a', 'b', 'c'],
        why:
          'Real fibre is noisy, so a threshold — not zero errors — separates "acceptable" from "assume ' +
          'interception". Above it you throw the key away and start again. The key then feeds a conventional cipher. ' +
          'Authentication remains your problem, and unauthenticated QKD can be run end to end against an impostor.',
      },
    ],
  },
];

export function getExam(id: string): Exam | undefined {
  return EXAMS.find((e) => e.id === id);
}

export function examForSection(section: string): Exam | undefined {
  return EXAMS.find((e) => e.section === section);
}
