# 0G Storage SDK Feedback — Testnet Contract Mismatch

## TL;DR

**The TypeScript SDK (`@0glabs/0g-ts-sdk` v0.2.9–v0.3.3) is broken against the current Galileo testnet.** Every upload silently fails with an empty revert because the SDK sends the wrong function selector to the Flow contract. The contract was upgraded on-chain but the SDK ABI was not updated to match.

---

## The Problem

The Flow contract at `0x22E03a6A89B950F1c82ec5e74F8eCa321a105296` (Galileo testnet) is a **beacon proxy** whose implementation was upgraded to `0xF99cccc4B74F5dF79391EEa4E2A12Dae6084292F`.

The `submit` function signature changed in the new implementation:

| | Function Signature | Selector |
|---|---|---|
| **SDK (all versions)** | `submit((uint256,bytes,(bytes32,uint256)[]))` | `0xef3e12dc` |
| **Deployed contract** | `submit(((uint256,bytes,(bytes32,uint256)[]),address))` | `0xbc8c11f8` |

The SDK passes just `SubmissionData` (`{length, tags, nodes[]}`). The contract now expects the full `Submission` struct: `{SubmissionData data, address submitter}`. Because the selectors don't match, the call hits no function and reverts with empty data (`0x`), which ethers.js reports as `"likely require(false)"` — masking the real issue completely.

---

## Additional: Submit Event Signature Also Changed

The SDK's ABI declares the event as:
```
Submit(address indexed sender, bytes32 indexed digest, uint256 indexed submissionIndex, uint256 startPos, uint256 length, bytes data)
```

The actual on-chain event is:
```
Submit(address indexed submitter, bytes32 indexed digest, uint256 submissionIndex, uint256 startEntryIndex, uint256 length, (uint256,bytes,(bytes32,uint256)[]) data)
```

Two differences:
1. `submissionIndex` is **no longer indexed** (so it can't be read from topics — it's in the data field).
2. The last parameter type is the **`SubmissionData` struct** `(uint256,bytes,(bytes32,uint256)[])`, not raw `bytes`.

---

## Workaround (until SDK is updated)

Instead of using `indexer.upload()`, call the Flow contract directly with the correct ABI and include `submitter: wallet.address` in the submission struct. The rest of the SDK (segment upload via `StorageNode.uploadSegmentsByTxSeq`, download via `indexer.download`) still works fine.

```typescript
// Correct submit call
const flow = new ethers.Contract(flowAddress, CORRECTED_FLOW_ABI, wallet);
const tx = await flow.submit({
  data: submissionData,      // { length, tags, nodes }  — from zgFile.createSubmission()
  submitter: wallet.address, // required by upgraded contract
}, { value: fee });
```

---

## Contracts Involved

| Contract | Address |
|---|---|
| Flow Proxy | `0x22E03a6A89B950F1c82ec5e74F8eCa321a105296` |
| Beacon | `0x7fb56db44abed98c2388e2598852e4edb87f81dd` |
| Implementation | `0xF99cccc4B74F5dF79391EEa4E2A12Dae6084292F` |
| Market | `0x26c8f001C94b0fd287DB5397F05EF8Bd8EF2cF4B` |

---

## Suggested Fixes

1. **Update the SDK ABI** for `FixedPriceFlow__factory` to use the new `submit((SubmissionData, address))` signature.
2. **Update `Uploader.uploadFile`** to pass `{data: submission, submitter: signer.address}` when calling `submit`.
3. **Update the Submit event ABI** to reflect that `submissionIndex` is no longer indexed and that `data` is typed as the `SubmissionData` struct.
4. **Add a version check** or helpful error message when the on-chain selector doesn't match the SDK's expected selector, so developers get a clear error instead of a cryptic empty revert.
