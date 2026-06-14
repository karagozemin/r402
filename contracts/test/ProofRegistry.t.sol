// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ProofRegistry} from "../src/ProofRegistry.sol";

contract ProofRegistryTest {
    ProofRegistry registry = new ProofRegistry();

    function testConsumesDigestOnce() public {
        bytes32 digest = keccak256("bound-request");
        registry.consumeRequest(digest);
        assert(registry.consumedRequestDigests(digest));
    }

    function testReplayReverts() public {
        bytes32 digest = keccak256("bound-request");
        registry.consumeRequest(digest);
        (bool ok,) = address(registry).call(
            abi.encodeCall(ProofRegistry.consumeRequest, (digest))
        );
        assert(!ok);
    }

    function testAnchorsProof() public {
        bytes32 jobId = keccak256("job");
        bytes32 proofHash = keccak256("proof");
        registry.anchorProof(jobId, keccak256("delegation"), proofHash);
        assert(registry.latestProofHashByJob(jobId) == proofHash);
    }
}
