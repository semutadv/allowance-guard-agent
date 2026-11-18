// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AllowanceGuardRegistry, IAgentIdRegistry} from "../contracts/AllowanceGuardRegistry.sol";

/// @notice Minimal cheatcode interface (avoids a forge-std dependency).
interface Vm {
    function prank(address msgSender) external;
}

/// @notice Stand-in for the SPACE ID Agent ID registry: balanceOf only.
contract MockAgentIdRegistry {
    mapping(address => uint256) private _bal;

    function setBalance(address who, uint256 v) external {
        _bal[who] = v;
    }

    function balanceOf(address who) external view returns (uint256) {
        return _bal[who];
    }
}

contract AllowanceGuardRegistryTest {
    Vm private constant vm =
        Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    MockAgentIdRegistry private mock;
    AllowanceGuardRegistry private registry;

    address private constant ALICE = address(0xA11CE);
    address private constant BOB = address(0xB0B);

    function setUp() public {
        mock = new MockAgentIdRegistry();
        registry = new AllowanceGuardRegistry(address(mock));
    }

    function testHolderCanRecord() public {
        mock.setBalance(ALICE, 1);
        vm.prank(ALICE);
        registry.recordCheck(3, 0, bytes32(uint256(42)));
        require(registry.totalChecks() == 1, "totalChecks");
        require(registry.uniqueGuardians() == 1, "uniqueGuardians");
        require(registry.checksOf(ALICE) == 1, "checksOf");
        require(registry.lastRiskyApprovals(ALICE) == 0, "lastRisky");
        require(registry.lastCheckAt(ALICE) > 0, "lastCheckAt");
        require(registry.isGuardian(ALICE), "isGuardian");
        require(registry.holdsAgentId(ALICE), "holdsAgentId");
    }

    function testSecondCheckDoesNotDoubleCountGuardian() public {
        mock.setBalance(ALICE, 1);
        vm.prank(ALICE);
        registry.recordCheck(3, 1, bytes32(uint256(1)));
        vm.prank(ALICE);
        registry.recordCheck(5, 2, bytes32(uint256(2)));
        require(registry.totalChecks() == 2, "totalChecks");
        require(registry.uniqueGuardians() == 1, "uniqueGuardians");
        require(registry.checksOf(ALICE) == 2, "checksOf");
        require(registry.lastRiskyApprovals(ALICE) == 2, "lastRisky updated");
    }

    function testNonHolderReverts() public {
        require(!registry.holdsAgentId(BOB), "bob holds nothing");
        vm.prank(BOB);
        try registry.recordCheck(1, 1, bytes32(uint256(7))) {
            revert("expected NotAgentIdHolder revert");
        } catch (bytes memory reason) {
            require(reason.length == 36, "error payload length");
            require(
                bytes4(reason) ==
                    AllowanceGuardRegistry.NotAgentIdHolder.selector,
                "wrong error"
            );
        }
        require(registry.totalChecks() == 0, "nothing recorded");
    }

    function testTwoHoldersCountedSeparately() public {
        mock.setBalance(ALICE, 1);
        mock.setBalance(BOB, 1);
        vm.prank(ALICE);
        registry.recordCheck(1, 0, bytes32(0));
        vm.prank(BOB);
        registry.recordCheck(2, 1, bytes32(0));
        require(registry.uniqueGuardians() == 2, "uniqueGuardians 2");
        require(registry.totalChecks() == 2, "totalChecks 2");
    }

    function testZeroRegistryRejected() public {
        try new AllowanceGuardRegistry(address(0)) {
            revert("expected constructor revert");
        } catch {
            // expected
        }
    }
}
