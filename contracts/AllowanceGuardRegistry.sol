// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Minimal read interface of the SPACE ID Agent ID registry
/// (ERC-721, non-transferable). Mainnet BNB Chain deployment:
/// 0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F.
interface IAgentIdRegistry {
    function balanceOf(address owner) external view returns (uint256);
}

/// @title AllowanceGuardRegistry
/// @notice On-chain security-check registry for Binance Agent ID holders.
///
/// Allowance Guard is a read-only agent that audits a wallet's live ERC-20
/// approvals on BNB Smart Chain and reports who can currently move the
/// wallet's tokens. This contract is the Agent ID layer of that product:
/// after running an audit, an Agent ID holder anchors the audit's summary
/// on-chain by calling {recordCheck}. The call is gated on actually
/// holding an Agent ID, so the registry doubles as a public, verifiable
/// record of how many distinct Agent ID holders actively guard their
/// wallets — and when each of them last checked.
///
/// Design constraints (deliberate, and part of the security story):
/// - The contract holds no funds, moves no funds, and never asks for any
///   token approval. `recordCheck` is the only state-changing function.
/// - There is no owner and there are no admin functions: nothing can be
///   paused, upgraded, re-pointed, or withdrawn, by anyone, ever. The
///   Agent ID registry address is fixed at deployment as an immutable.
/// - The contract never resolves an Agent ID name to a wallet or looks
///   anyone up; it only checks the caller's own Agent ID balance.
/// - The report hash is an opaque commitment to an off-chain audit
///   report (see the Allowance Guard CLI in this repository). The
///   contract stores counts and the hash, never report contents.
contract AllowanceGuardRegistry {
    /// @notice The Agent ID registry this deployment gates on.
    IAgentIdRegistry public immutable agentIdRegistry;

    /// @notice Total number of security checks recorded, all holders.
    uint256 public totalChecks;

    /// @notice Number of distinct Agent ID holders who recorded a check.
    uint256 public uniqueGuardians;

    /// @notice Number of checks recorded by each holder.
    mapping(address => uint256) public checksOf;

    /// @notice Block timestamp of each holder's most recent check.
    mapping(address => uint256) public lastCheckAt;

    /// @notice Risky (live, non-zero) approvals in each holder's last check.
    mapping(address => uint256) public lastRiskyApprovals;

    /// @notice Emitted on every recorded security check.
    event SecurityCheck(
        address indexed holder,
        uint256 approvalsScanned,
        uint256 riskyApprovals,
        bytes32 reportHash,
        uint256 checkedAt
    );

    /// @notice Reverted when a caller that holds no Agent ID tries to record.
    error NotAgentIdHolder(address caller);

    /// @param agentIdRegistry_ Address of the SPACE ID Agent ID registry.
    constructor(address agentIdRegistry_) {
        require(agentIdRegistry_ != address(0), "registry is zero address");
        agentIdRegistry = IAgentIdRegistry(agentIdRegistry_);
    }

    /// @notice Record that the caller ran an Allowance Guard audit.
    /// @dev Caller must hold an Agent ID (registry balanceOf > 0).
    /// @param approvalsScanned Distinct (token, spender) pairs the audit found.
    /// @param riskyApprovals Pairs whose live allowance is non-zero.
    /// @param reportHash Commitment hash of the off-chain audit report.
    function recordCheck(
        uint256 approvalsScanned,
        uint256 riskyApprovals,
        bytes32 reportHash
    ) external {
        if (agentIdRegistry.balanceOf(msg.sender) == 0) {
            revert NotAgentIdHolder(msg.sender);
        }
        if (checksOf[msg.sender] == 0) {
            uniqueGuardians += 1;
        }
        checksOf[msg.sender] += 1;
        totalChecks += 1;
        lastCheckAt[msg.sender] = block.timestamp;
        lastRiskyApprovals[msg.sender] = riskyApprovals;
        emit SecurityCheck(
            msg.sender,
            approvalsScanned,
            riskyApprovals,
            reportHash,
            block.timestamp
        );
    }

    /// @notice True if `account` currently holds an Agent ID.
    function holdsAgentId(address account) external view returns (bool) {
        return agentIdRegistry.balanceOf(account) > 0;
    }

    /// @notice True if `account` has recorded at least one security check.
    function isGuardian(address account) external view returns (bool) {
        return checksOf[account] > 0;
    }
}
