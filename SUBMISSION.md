# Wildcard submission — Allowance Guard

Drafted answers for the Agent Games Season 01 (zkVerify) Wildcard form.
Everything below matches the public repository.

---

**Agent name:** Allowance Guard

**Agent link:**
https://github.com/semutadv/allowance-guard-agent

**Use case**

Token approvals are silent, standing permissions: once a wallet approves a
spender, that spender can move up to the approved amount at any later
moment, with no new signature and no notification. Bots, quest sites and
mini-games routinely obtain approvals during their flow, and the permission
outlives the session. Allowance Guard is a wallet-security agent for BNB
Smart Chain that answers one question for its operator at any time:
*right now, who can move my tokens, and how much?* It helps any
self-custody wallet user — especially agent-operated wallets, where an AI
agent touches many small projects and approvals accumulate fast. In a real
incident on 2026-11-14, the agent audited its operator's wallet after a
Telegram bot session, found three live allowances the bot had obtained
(97.656 USDT and 12,66 USDT to two unknown spenders, plus ≈ 39,9 million
units of a game token), and — after the operator's explicit approval —
revoked all three on-chain and verified each allowance read back as
exactly 0 (total fees ≈ Rp68).

**Build context**

The agent scans the wallet's ERC-20 `Approval` event history on BSC (log
ranges chunked at 49.000 blocks, split automatically when an RPC refuses
them), collects every distinct (token, spender) pair, then reads the
**live** `allowance()` for each pair — the key design decision: history
alone is not exposure, only the current on-chain allowance is. Each
spender is typed (plain wallet vs contract, via `eth_getCode`), unlimited
or large allowances are flagged, and the result is a structured report
(JSON + readable table) with a plain-language verdict per line. Signing is
human-in-the-loop by design: the scanner is strictly read-only and never
sends a transaction; a revocation is prepared as a preview and executed
only on the operator's explicit per-action approval, and afterwards the
agent re-reads the allowance and requires it to be exactly 0 before
reporting success ("verify-after-revoke"). Stack: Node.js + ethers v6,
public BSC RPCs, no backend, no keys held by the scanner.

**Endpoint**

PUBLIC ENDPOINT (demo page, GitHub Pages):
https://semutadv.github.io/allowance-guard-agent/

The scanner itself is a local Node.js CLI (no backend, no keys held); this
public page is its demo endpoint — it shows what the agent does, the real
2026-11-14 case study, and a sample post-revoke report, with run
instructions. A live scan runs on demand from the CLI in the repository.
Status: demo page committed (index.html); publish step (push + enable
GitHub Pages) to be completed before submitting the form — verify the URL
returns 200 first.

**zkVerify angle (optional)**

Each audit report is a structured, falsifiable claim — "at block N,
wallet W had exactly these allowances" — kept small and deterministic on
purpose. A planned extension (not yet implemented) is to hash each report
and commit that hash with a zkVerify proof at audit time, so a third
party can later check that the claim was made at that block and never
edited, without trusting the agent's operator.
