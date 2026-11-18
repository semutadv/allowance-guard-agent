# Binance Agent ID Hackathon — submission packet

Prepared answers for the Agent ID Hackathon submission (Binance Wallet ×
BNB Chain, submission period 2026-11-18 → 2026-12-09 UTC). Everything
below matches the public repository and the live deployment.

---

**Project name:** Allowance Guard

**Website:** https://semutadv.github.io/allowance-guard-agent/

**Repository (open source, MIT):**
https://github.com/semutadv/allowance-guard-agent

**Contract address(es) — BNB Smart Chain (56):**

- AllowanceGuardRegistry: `0x795c0c9Be98fFb872339fFc8100E9b8a66378496`
  - Deployed 2026-11-18 via the deterministic deployment proxy from the
    project's Agentic Wallet (`0x32E506B0767c85B830a8c34f80B4B18affE176E9`,
    Agent ID `morg.ai`); creation tx
    `0x73f04d6d38659270710a1aa61e199b05be3a5eef22e7f8e2cfea6f9ccd0b8ed0`.
  - Source verified: Sourcify exact match (creation + runtime),
    2026-11-18; mirrored on BscScan.
  - No owner, no admin functions, holds no funds, requests no approvals.
- Agent ID registry it gates on (SPACE ID, not ours):
  `0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F`

**Agent ID usage description:**

Allowance Guard is a read-only security agent that audits a BSC wallet's
live ERC-20 approvals and reports who can currently move the wallet's
tokens. Agent ID is integrated as the identity and access layer of its
on-chain component, the AllowanceGuardRegistry:

1. **Access control (identity gating).** After running an audit, a
   wallet owner anchors the audit summary on-chain via
   `recordCheck(approvalsScanned, riskyApprovals, reportHash)`. The call
   reverts unless the caller holds an Agent ID
   (`balanceOf(caller) > 0` on the SPACE ID Agent ID registry). Only
   Agent ID holders can write to the registry — the record is therefore
   a verifiable statement by an identified agent-ecosystem participant,
   not an anonymous address.
2. **Reputation primitive for the agent ecosystem.** The registry keeps
   per-holder check counts, last-check timestamps, and last risky counts,
   plus global counters (total checks, unique guardians). Any dApp can
   read `isGuardian(agentIdHolder)` / `checksOf(...)` to see whether an
   Agent ID holder actively audits the approvals its agent accumulates —
   a concrete, on-chain hygiene signal for agent-operated wallets, which
   collect approvals from many small projects by design.
3. **Real-world anchor.** The product grew out of a real incident
   (2026-11-14): after a Telegram bot session, the agent found three
   live allowances a bot had obtained from its operator's Agentic Wallet
   (97.656 USDT, 12.66 USDT, ≈39.9M game tokens), and all three were
   revoked and verified back to exactly 0 after the operator's explicit
   approval. Agent ID holders are precisely the users exposed to this
   risk class.

The contract deliberately never resolves an Agent ID name to a wallet
and never looks anyone up; it checks only the caller's own Agent ID
balance. It holds no funds, moves no funds, asks for no token approvals,
has no owner and no admin functions, and the registry address is an
immutable fixed at deployment.

**How to try it:**

1. Run the scanner: `node index.js <your address> --json` (read-only).
2. Open the Guardian Portal, connect the wallet holding your Agent ID,
   paste the JSON report, and record the check from your own wallet.

**Reward receiving address:** the project's Agentic Wallet,
`0x32E506B0767c85B830a8c34f80B4B18affE176E9` (Agent ID `morg.ai`).
