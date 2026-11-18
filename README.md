# Allowance Guard

A read-only wallet-security agent for BNB Smart Chain (BSC) that audits a
wallet's ERC-20 token approvals: it reconstructs who was ever granted
permission to spend the wallet's tokens, reads the allowance that is
**currently live** for each of them, and reports the standing exposure in
plain language — before a forgotten permission can be used against the
wallet.

## The problem

ERC-20 approvals are silent, standing permissions. When a wallet calls
`approve(spender, amount)`, that spender can move up to that amount of the
token at any later moment — no new signature, no notification, no expiry.
Bots, quest sites, mini-games and "claim" pages routinely ask for approvals
as part of their flow, and many users grant them without realising the
permission stays live after the session ends. One malicious or compromised
spender with a live allowance can drain a wallet days or weeks later, and
the owner usually finds out only when the balance is already gone.

## Who it helps

Any self-custody wallet user — and especially **agent-operated wallets**,
where an AI agent interacts with many small projects on its operator's
behalf and approvals accumulate quickly. The guard gives the operator a
single, verifiable answer to one question: *right now, who can move my
tokens, and how much?*

## What the agent does

1. **Scan** — walks the wallet's recent `Approval` event history on BSC
   (logs in chunks of at most 49.000 blocks, splitting ranges automatically
   when an RPC refuses them) and collects every distinct (token, spender)
   pair that ever received an approval.
2. **Classify** — for each pair it reads the live `allowance()` on-chain
   (history alone is not exposure; only the current allowance is), checks
   whether the spender is a plain wallet (EOA) or a contract via
   `eth_getCode`, and flags unlimited or very large allowances.
3. **Report** — prints a structured report (JSON, or a readable table)
   with a plain-language verdict per line.
4. **Human approves** — the agent never signs anything by itself. A
   revocation is prepared as a preview and executed only after the
   operator's explicit, per-action approval.
5. **Revoke & verify** — after approval, the allowance is set to zero
   on-chain, and the agent re-reads `allowance()` to confirm it is
   **exactly 0** before reporting success.

The scanner in this repository performs steps 1–3 and is **strictly
read-only: it never builds, signs, or sends a transaction.**

## Agent ID integration — the on-chain Guardian Registry

Built for the **Binance Agent ID Hackathon** (Binance Wallet × BNB Chain):
Allowance Guard's audit summary can be anchored on-chain by the wallet's
owner — but only if that wallet actually holds a **Binance Agent ID**.

- **Contract:** `AllowanceGuardRegistry`,
  [`0x795c0c9Be98fFb872339fFc8100E9b8a66378496`](https://bscscan.com/address/0x795c0c9Be98fFb872339fFc8100E9b8a66378496)
  on BNB Smart Chain. Source in [`contracts/AllowanceGuardRegistry.sol`](contracts/AllowanceGuardRegistry.sol),
  verified with an exact match (Sourcify; mirrored on BscScan).
- **Gate:** `recordCheck(approvalsScanned, riskyApprovals, reportHash)`
  reverts unless `balanceOf(caller) > 0` on the SPACE ID Agent ID registry
  (`0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F`). The contract never
  resolves an Agent ID name to a wallet; it only checks the caller's own
  balance.
- **What it stores:** per-holder check counts, last-check timestamp, the
  last report's risky-approval count, and an opaque hash commitment to
  the off-chain report — never report contents.
- **What it cannot do:** the contract holds no funds, moves no funds,
  asks for no token approvals, and has **no owner and no admin
  functions** — nothing can be paused, upgraded, re-pointed, or
  withdrawn by anyone. The Agent ID registry address is an immutable
  fixed at deployment.
- **Portal:** the GitHub Pages site for this repo is the live Guardian
  Portal — connect a wallet, see its Agent ID status, and record a check
  signed by your own wallet:
  https://semutadv.github.io/allowance-guard-agent/
- **Tests:** `forge test` (see `test/AllowanceGuardRegistry.t.sol`) —
  holder can record, non-holder reverts, guardian counting, zero-registry
  rejection.

Agent ID is the identity layer that makes the registry meaningful: a
check recorded here is proof that a specific Agent ID holder ran a
security audit at a specific time — the same "verify, don't trust"
principle the scanner applies to allowances, applied to the agent
ecosystem itself.

## Case study — 2026-11-14: the Telegram bot approvals

This agent works continuously for its operator, hunting free mints on BSC.
On 2026-11-14 the operator took part in a Telegram bot session that
involved the operator's agent wallet (`0x32E5…76E9`) and afterwards asked
for a revoke check. The audit found **three live ERC-20 allowances** the
bot session had obtained, all to unknown spenders:

- **97.656 USDT** to spender `0x4fd2…b7f9`
- **12,66 USDT** to spender `0x3643…2ab8`
- **≈ 39,9 million units of a game token (JAGENT)** to spender `0x4fd2…b7f9`

The agent presented a preview of each revocation; only after the
operator's explicit approval were all three revoked on-chain. Every
allowance was then re-read and verified as exactly 0. Total network fees
for the three revocations: ≈ Rp68 (about half a US cent).

A fresh scan of the same wallet after the cleanup — this is the sample
report shipped in [`examples/sample-report.json`](examples/sample-report.json),
300.000 blocks scanned:

```text
Allowance Guard — BSC approval audit
Wallet:        0x32E5…76E9 (shortened for safe sharing)
Blocks scanned: 133381049 → 133681048
Read-only scan — no transaction was sent.

Token   Spender      Type      Current allowance  Risk
------  -----------  --------  -----------------  ----
JAGENT  0x4fd2…b7f9  contract  0.0                NONE
USDT    0x4fd2…b7f9  contract  0.0                NONE
USDT    0x3643…2ab8  contract  0.0                NONE

Summary: 3 (token, spender) pair(s) in history, 0 with a live allowance, 0 unlimited.
```

The history still shows the approvals happened — and the live exposure is
zero. That difference is exactly what the guard exists to prove.

## How to run it

```bash
npm install
node index.js <walletAddress> [--blocks 300000] [--rpc <url>] [--json]
```

- `<walletAddress>` — any BSC wallet, `0x…` format.
- `--blocks N` — how many recent blocks of `Approval` history to scan
  (default 300.000).
- `--rpc <url>` — use a specific BSC RPC endpoint instead of the built-in
  public ones.
- `--json` — print the machine-readable report instead of the table.

Reports display the audited wallet in shortened form by default, so they
can be shared safely.

## What it cannot do (honest limits)

- **It never revokes anything.** The scanner is read-only by design;
  revocation is a separate transaction that a human must approve. Any
  tool that "cleans your wallet" in one click is asking for the very
  trust this agent is built to avoid.
- **It only sees the scanned window.** An approval granted before the
  window is missed unless `--blocks` is raised. Free public RPCs are
  slow and range-limited for deep log scans — the tool splits ranges
  automatically, but a dedicated RPC endpoint is recommended for wide
  windows.
- **ERC-20 only.** NFT permissions (`ApprovalForAll`) are a different
  check and are not covered here.
- **Zero today ≠ never touched.** A zero allowance proves there is no
  *current* exposure; it does not rewrite what a spender may already have
  moved while the allowance was live.

## Optional zkVerify angle (direction, not a shipped feature)

Each audit report is a structured, falsifiable claim: *"at block N,
wallet W had exactly these allowances to these spenders."* A natural
extension — **not implemented in this repository** — is to hash each
report and commit that hash with a zkVerify proof at audit time. A third
party (an insurer, a marketplace, a DAO paying an agent operator) could
then check later that the claim was made at that block and has not been
edited since, without having to trust the agent's operator or re-run the
scan. The report format in `examples/` was kept deliberately small and
deterministic with that commitment use case in mind.

## License

MIT — see [LICENSE](LICENSE).
