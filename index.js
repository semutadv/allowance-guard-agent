#!/usr/bin/env node
/*
 * Allowance Guard — a read-only BSC token-approval auditor.
 *
 * Given a wallet address it:
 *   1. scans the wallet's recent ERC-20 `Approval` event history,
 *   2. reads the *current* allowance for every distinct (token, spender) pair,
 *   3. classifies each standing permission and prints a risk report.
 *
 * The tool is strictly read-only: it never builds, signs, or sends a
 * transaction. Revoking an allowance is a separate, human-approved step
 * that happens outside this tool.
 *
 * Usage:
 *   node index.js <walletAddress> [--blocks 300000] [--rpc <url>] [--json]
 */
'use strict';

const { JsonRpcProvider, Contract, id, zeroPadValue, formatUnits } = require('ethers');

const CHAIN_ID = 56; // BNB Smart Chain
const DEFAULT_RPCS = [
  'https://bsc-rpc.publicnode.com',
  'https://rpc-bsc.48.club',
  'https://bsc-dataseed2.binance.org',
];
const MAX_CHUNK = 49000; // stay inside public-RPC eth_getLogs range limits
const APPROVAL_TOPIC = id('Approval(address,address,uint256)');
const ERC20_ABI = [
  'function allowance(address owner, address spender) view returns (uint256)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
];

const shorten = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function parseArgs(argv) {
  const args = { blocks: 300000, rpc: null, json: false, wallet: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--blocks') args.blocks = parseInt(argv[++i], 10);
    else if (a === '--rpc') args.rpc = argv[++i];
    else if (!a.startsWith('--')) args.wallet = a;
  }
  return args;
}

function makeProviders(rpcOverride) {
  const urls = rpcOverride ? [rpcOverride] : DEFAULT_RPCS;
  return urls.map(
    (u) => new JsonRpcProvider(u, CHAIN_ID, { staticNetwork: true })
  );
}

// Fetch Approval logs for [from, to]; on a range/limit error, split the
// range in half and retry, so wide scans survive strict public RPCs.
async function fetchRange(providers, filter, from, to) {
  let lastErr;
  for (const p of providers) {
    try {
      return await p.getLogs({ ...filter, fromBlock: from, toBlock: to });
    } catch (e) {
      lastErr = e;
      const msg = String((e && e.message) || e);
      if (/limit|range|too large|exceed|size/i.test(msg) && to - from > 1000) {
        const mid = Math.floor((from + to) / 2);
        const left = await fetchRange(providers, filter, from, mid);
        const right = await fetchRange(providers, filter, mid + 1, to);
        return left.concat(right);
      }
    }
  }
  throw lastErr;
}

async function scanApprovals(providers, owner, blocksBack) {
  const latest = await providers[0].getBlockNumber();
  const from = Math.max(0, latest - blocksBack + 1);
  const filter = { topics: [APPROVAL_TOPIC, zeroPadValue(owner, 32)] };
  const logs = [];
  for (let start = from; start <= latest; start += MAX_CHUNK) {
    const end = Math.min(latest, start + MAX_CHUNK - 1);
    logs.push(...(await fetchRange(providers, filter, start, end)));
  }
  return { logs, from, to: latest };
}

// ERC-20 Approval has exactly 3 topics (signature, owner, spender) and the
// value in data. ERC-721 Approval shares the signature but has 4 topics —
// those are filtered out here.
function collectPairs(logs) {
  const pairs = new Map();
  for (const log of logs) {
    if (!log.topics || log.topics.length !== 3) continue;
    const token = log.address.toLowerCase();
    const spender = ('0x' + log.topics[2].slice(26)).toLowerCase();
    const key = `${token}|${spender}`;
    const prev = pairs.get(key) || { token, spender, events: 0, lastBlock: 0 };
    prev.events += 1;
    prev.lastBlock = Math.max(prev.lastBlock, log.blockNumber);
    pairs.set(key, prev);
  }
  return [...pairs.values()];
}

function classify(allowance, decimals) {
  if (allowance === 0n) {
    return {
      risk: 'NONE',
      verdict:
        'Allowance is zero — no current exposure. An approval existed in the history and has been revoked or fully used.',
    };
  }
  if (allowance >= 1n << 255n) {
    return {
      risk: 'UNLIMITED',
      verdict:
        'Effectively unlimited approval: this spender can move your entire balance of this token at any time, with no further signature from you. Revoke immediately if you do not recognise it.',
    };
  }
  const whole = Number(formatUnits(allowance, decimals));
  if (whole >= 100000) {
    return {
      risk: 'HIGH',
      verdict:
        'Large standing allowance: the spender can move up to this amount without asking again. Revoke if you do not recognise it.',
    };
  }
  if (whole >= 1000) {
    return {
      risk: 'MEDIUM',
      verdict:
        'Material standing allowance. A live permission — revoke if you do not recognise the spender.',
    };
  }
  return {
    risk: 'LOW',
    verdict:
      'Small standing allowance. Still a live permission — revoke if you do not recognise the spender.',
  };
}

const RISK_ORDER = { UNLIMITED: 0, HIGH: 1, MEDIUM: 2, LOW: 3, NONE: 4 };

async function auditPair(provider, owner, pair) {
  const token = new Contract(pair.token, ERC20_ABI, provider);
  let symbol = 'UNKNOWN';
  let decimals = 18;
  try { symbol = await token.symbol(); } catch { /* non-standard token */ }
  try { decimals = Number(await token.decimals()); } catch { /* keep 18 */ }
  const allowance = await token.allowance(owner, pair.spender);
  let spenderType = 'contract';
  try {
    const code = await provider.getCode(pair.spender);
    if (code === '0x') spenderType = 'EOA (plain wallet)';
  } catch { /* keep default */ }
  const { risk, verdict } = classify(allowance, decimals);
  return {
    token: symbol,
    tokenAddress: pair.token,
    spender: pair.spender,
    spenderType,
    allowanceRaw: allowance.toString(),
    allowance: formatUnits(allowance, decimals),
    decimals,
    approvalEvents: pair.events,
    lastApprovalBlock: pair.lastBlock,
    risk,
    verdict,
  };
}

function printTable(report) {
  console.log(`Allowance Guard — BSC approval audit`);
  console.log(`Wallet:        ${report.wallet} (shortened for safe sharing)`);
  console.log(`Blocks scanned: ${report.scannedBlocks.from} → ${report.scannedBlocks.to}`);
  console.log(`Read-only scan — no transaction was sent.\n`);
  if (!report.findings.length) {
    console.log('No ERC-20 Approval events found in the scanned window.');
    return;
  }
  const rows = report.findings.map((f) => [
    f.token,
    shorten(f.spender),
    f.spenderType.startsWith('EOA') ? 'EOA' : 'contract',
    f.allowance,
    f.risk,
  ]);
  const head = ['Token', 'Spender', 'Type', 'Current allowance', 'Risk'];
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells) => cells.map((c, i) => c.padEnd(widths[i])).join('  ');
  console.log(line(head));
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  rows.forEach((r) => console.log(line(r)));
  console.log('');
  for (const f of report.findings) {
    console.log(`- ${f.token} / spender ${shorten(f.spender)}: ${f.verdict}`);
  }
  const s = report.summary;
  console.log(
    `\nSummary: ${s.pairsFound} (token, spender) pair(s) in history, ` +
    `${s.activeAllowances} with a live allowance, ${s.unlimited} unlimited.`
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.wallet || !/^0x[0-9a-fA-F]{40}$/.test(args.wallet)) {
    console.error('Usage: node index.js <walletAddress> [--blocks N] [--rpc <url>] [--json]');
    process.exit(2);
  }
  const owner = args.wallet.toLowerCase();
  const providers = makeProviders(args.rpc);
  const { logs, from, to } = await scanApprovals(providers, owner, args.blocks);
  const pairs = collectPairs(logs);
  const findings = [];
  for (const pair of pairs) findings.push(await auditPair(providers[0], owner, pair));
  findings.sort((a, b) => RISK_ORDER[a.risk] - RISK_ORDER[b.risk] || a.token.localeCompare(b.token));
  const report = {
    tool: 'allowance-guard-agent',
    chain: 'BNB Smart Chain (chainId 56)',
    wallet: shorten(args.wallet),
    scannedBlocks: { from, to },
    generatedAt: new Date().toISOString(),
    note: 'Read-only scan — no transaction was built, signed, or sent.',
    findings,
    summary: {
      pairsFound: findings.length,
      activeAllowances: findings.filter((f) => f.allowanceRaw !== '0').length,
      unlimited: findings.filter((f) => f.risk === 'UNLIMITED').length,
    },
  };
  if (args.json) console.log(JSON.stringify(report, null, 2));
  else printTable(report);
}

main().catch((e) => {
  console.error('Scan failed:', (e && e.message) || e);
  process.exit(1);
});
