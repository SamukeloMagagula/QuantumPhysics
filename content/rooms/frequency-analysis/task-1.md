# When brute force isn't enough

A **substitution cipher** replaces each letter with a different fixed letter
(not just a shift). Now there are 26! ≈ 4×10²⁶ keys — far too many to brute
force. But the cipher leaks a pattern: **letter frequencies survive**.

In English, `e` is the most common letter, then `t`, `a`, `o`. Count letters in
the ciphertext, line the peaks up with the expected English order, and the
message falls apart. That is **frequency analysis**.

The tool below plots how often each letter appears. Analyse this intercept:

```
Of eknhzgukqhin yktjxtfen qfqsnlol ol zit lzxrn gy igv gyztf stzztkl qhhtqk.
Zit dglz egddgf stzztk of Tfusoli ol fgkdqssn zit stzztk t. Xlofu zitlt egxfzl
qf qzzqeatk eqf lsgvsn ktwxosr zit dqhhofu qfr ktqr zit dtllqut. Zit iorrtf
hqllvgkr ol tfzkghn.
```
