// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract ProofRegistry {
    mapping(bytes32 requestDigest => bool consumed) public consumedRequestDigests;
    mapping(bytes32 jobId => bytes32 proofHash) public latestProofHashByJob;

    error RequestAlreadyConsumed(bytes32 requestDigest);

    event RequestConsumed(bytes32 indexed requestDigest);
    event ProofAnchored(bytes32 indexed jobId, bytes32 indexed delegationHash, bytes32 proofHash);

    function consumeRequest(bytes32 requestDigest) external {
        if (consumedRequestDigests[requestDigest]) revert RequestAlreadyConsumed(requestDigest);
        consumedRequestDigests[requestDigest] = true;
        emit RequestConsumed(requestDigest);
    }

    function anchorProof(bytes32 jobId, bytes32 delegationHash, bytes32 proofHash) external {
        latestProofHashByJob[jobId] = proofHash;
        emit ProofAnchored(jobId, delegationHash, proofHash);
    }
}
