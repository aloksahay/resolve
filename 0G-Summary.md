# 0G Infrastructure Summary

> **Mission:** "Make AI a Public Good" — democratized, transparent, fair, and secure infrastructure for AI applications.

---

## Core Components

### 1. 0G Chain

The fastest modular AI chain with full EVM compatibility.

| Spec | Value |
|------|-------|
| TPS | 11,000 per shard |
| Finality | Sub-second |
| Consensus | Optimized CometBFT |
| EVM | Full compatibility |
| Native Precompiles | DA + Wrapped tokens |

**Networks:**

| Network | Chain ID | RPC | Explorer |
|---------|----------|-----|----------|
| Testnet (Galileo) | 16602 | `https://evmrpc-testnet.0g.ai` | https://chainscan-galileo.0g.ai |
| Mainnet (Aristotle) | 16661 | `https://evmrpc.0g.ai` | https://chainscan.0g.ai |

**Faucet:** https://faucet.0g.ai (0.1 0G/day on testnet)

---

### 2. 0G Storage

Decentralized storage with 95% lower costs than AWS and instant retrieval.

- **Architecture:** Two layers — immutable Log + mutable Key-Value
- **Speed:** 200 Mbps retrieval
- **Consensus:** Proof of Random Access (PoRA)
- **Scale:** TB-scale proven operations

**Testnet Contracts:**

| Contract | Address |
|----------|---------|
| Flow | `0x22E03a6A89B950F1c82ec5e74F8eCa321a105296` |
| Mine | `0x00A9E9604b0538e06b268Fb297Df333337f9593b` |
| Reward | `0xA97B57b4BdFEA2D0a25e535bd849ad4e6C440A69` |

**Mainnet Contracts:**

| Contract | Address |
|----------|---------|
| Flow | `0x62D4144dB0F0a6fBBaeb6296c785C71B3D57C526` |
| Mine | `0xCd01c5Cd953971CE4C2c9bFb95610236a7F414fe` |
| Reward | `0x457aC76B58ffcDc118AABD6DbC63ff9072880870` |
| Start Block | 2387557 |

**SDKs:**

```bash
# TypeScript
npm install @0glabs/0g-ts-sdk ethers

# Python
pip install 0g-storage-client

# Go
go get github.com/0gfoundation/0g-storage-client
```

**Storage Node Hardware:** 32 GB RAM, 8-core CPU, 500GB-1TB SSD, 100 Mbps

---

### 3. 0G Compute

Decentralized GPU marketplace — 90% cheaper AI workloads, OpenAI SDK compatible.

- **Pricing:** Pay-per-use (no subscriptions)
- **Latency:** 50-100ms inference
- **Payments:** Smart contract escrow (trustless)
- **Security:** TEE (Trusted Execution Environment)
- **Workloads:** LLM chatbot, text-to-image, speech-to-text

**DePIN Partners:**
- **io.net:** 300,000+ GPUs across 139 countries
- **Aethir:** 43,000+ enterprise-grade GPUs, 3,000+ H100s/H200s

**Testnet Contracts:**

| Contract | Address |
|----------|---------|
| Compute Ledger | `0xE70830508dAc0A97e6c087c75f402f9Be669E406` |
| Compute Inference | `0xa79F4c8311FF93C06b8CfB403690cc987c93F91E` |
| Compute FineTuning | `0xaC66eBd174435c04F1449BBa08157a707B6fa7b1` |

**Quick Start:**

```bash
pnpm add @0glabs/0g-serving-broker -g
0g-compute-cli ui start-web  # Web UI at http://localhost:3090
```

**OpenAI-Compatible Usage:**

```python
from openai import OpenAI

client = OpenAI(
    api_key="app-sk-<YOUR_SECRET>",
    base_url="<service_url>/v1/proxy"
)
```

---

### 4. 0G DA (Data Availability)

Scalable data availability layer for rollups.

- **Throughput:** 50 Gbps
- **Node Selection:** VRF-based
- **Security:** Inherits from Ethereum
- **Integrations:** OP Stack, Arbitrum Nitro

**Testnet Contracts:**

| Contract | Address |
|----------|---------|
| DAEntrance | `0xE75A073dA5bb7b0eC622170Fd268f35E675a957B` |
| DASigners (precompile) | `0x0000000000000000000000000000000000001000` |

**DA Node Hardware:** 16 GB RAM, 8-core CPU, 1 TB NVMe, 100 Mbps

---

### 5. INFT (Intelligent NFTs) — ERC-7857

Tokenizing AI agents with complete intelligence.

- Extends ERC-721 standard
- Encrypted metadata via 0G Storage
- Secure re-encryption for ownership transfer
- Oracle verification

**Use Cases:** Trading bots, personal assistants, game characters, content creation AI

---

## Smart Contract Deployment

**Hardhat:**

```javascript
networks: {
  testnet: {
    url: "https://evmrpc-testnet.0g.ai",
    chainId: 16602,
    accounts: ["YOUR_PRIVATE_KEY"]
  }
}
```

**Foundry:**

```bash
forge create --rpc-url https://evmrpc-testnet.0g.ai \
  --private-key YOUR_PRIVATE_KEY \
  src/MyContract.sol:MyContract
```

---

## Precompiled Contracts

**DASigners** (`0x0000...1000`):

- `getEpochNumber(uint256 blockNumber)`
- `getQuorum(uint256 epochNumber, uint256 quorumId)`
- `isSigner(uint256 epochNumber, address account)`

**WrappedOGBase** (`0x0000...1001`):

- `deposit()` / `withdraw(uint256)` / `balanceOf(address)`

---

## Node Requirements

| Node Type | RAM | CPU | Storage | Bandwidth |
|-----------|-----|-----|---------|-----------|
| Validator (Mainnet) | 64 GB | 8-core | 1 TB NVMe | 100 Mbps |
| Validator (Testnet) | 64 GB | 8-core | 4 TB NVMe | 100 Mbps |
| Storage | 32 GB | 8-core | 500GB-1TB SSD | 100 Mbps |
| DA | 16 GB | 8-core | 1 TB NVMe | 100 Mbps |

**Storage Node Sharding:** Configurable via `shard_position = "0/2"` (e.g., 50% data allocation).

---

## Developer Resources

### GitHub Repositories

| Component | Repository |
|-----------|------------|
| Storage Node | https://github.com/0gfoundation/0g-storage-node |
| Storage KV | https://github.com/0gfoundation/0g-storage-kv |
| Storage Client/CLI | https://github.com/0gfoundation/0g-storage-client |
| TypeScript SDK | https://github.com/0gfoundation/0g-ts-sdk |
| OP Stack Integration | https://github.com/0gfoundation/0g-da-op-plasma |
| Arbitrum Nitro | https://github.com/0gfoundation/nitro |
| Awesome 0G | https://github.com/0gfoundation/awesome-0g |

### API Endpoints

**Testnet (Galileo):**

| Service | URL |
|---------|-----|
| RPC | `https://evmrpc-testnet.0g.ai` |
| Storage Indexer | `https://indexer-storage-testnet-turbo.0g.ai` |
| Block Explorer | https://chainscan-galileo.0g.ai |
| Storage Explorer | https://storagescan-galileo.0g.ai |

**Mainnet (Aristotle):**

| Service | URL |
|---------|-----|
| RPC | `https://evmrpc.0g.ai` |
| Storage Indexer | `https://indexer-storage-turbo.0g.ai` |
| Block Explorer | https://chainscan.0g.ai |

### Mainnet Compute Contracts

| Contract | Address |
|----------|---------|
| Compute Ledger | `0x2dE54c845Cd948B72D2e32e39586fe89607074E3` |
| Compute Inference | `0x47340d900bdFec2BD393c626E12ea0656F938d84` |
| Compute FineTuning | `0x4e3474095518883744ddf135b7E0A23301c7F9c0` |

### CLI Tools

**Storage CLI:**

```bash
# Upload a file
0g-storage-client upload --url https://evmrpc-testnet.0g.ai --file /path/to/file

# Download a file
0g-storage-client download --root ROOT_HASH --file output.dat

# Upload a directory
0g-storage-client upload-dir --file /path/to/directory

# Download a directory
0g-storage-client download-dir --root HASH --file /output
```

**Compute CLI:**

```bash
# Initial setup
0g-compute-cli setup-network
0g-compute-cli login
0g-compute-cli deposit --amount 10

# List available providers
0g-compute-cli inference list-providers

# Launch web UI (http://localhost:3090)
0g-compute-cli ui start-web
```

### Code Examples

**TypeScript — Storage Upload:**

```typescript
import { ZgFile, Indexer } from "@0glabs/0g-ts-sdk";

const file = await ZgFile.fromFilePath("/path/to/file");
const [tree] = await file.merkleTree();
const [tx] = await indexer.upload(file, rpcUrl, signer);
```

**Python — Storage Upload:**

```python
from storage_client import ZgStorageClient

client = ZgStorageClient(rpc_endpoint="...", private_key="...")
root_hash = client.upload_file("/path/to/file")
```

**Python — Compute (OpenAI-compatible):**

```python
from openai import OpenAI

client = OpenAI(
    api_key="app-sk-<YOUR_SECRET>",
    base_url="<service_url>/v1/proxy"
)
response = client.chat.completions.create(
    model="<model_name>",
    messages=[{"role": "user", "content": "Hello!"}]
)
```

### Documentation Links

**Concepts:**
- Chain: https://docs.0g.ai/concepts/chain
- Storage: https://docs.0g.ai/concepts/storage
- Compute: https://docs.0g.ai/concepts/compute
- DA: https://docs.0g.ai/concepts/da
- INFT: https://docs.0g.ai/concepts/inft
- AI Alignment: https://docs.0g.ai/concepts/ai-alignment
- DePIN: https://docs.0g.ai/concepts/depin

**Developer Hub:**
- Getting Started: https://docs.0g.ai/developer-hub/getting-started
- Deploy Contracts: https://docs.0g.ai/developer-hub/building-on-0g/contracts-on-0g/deploy-contracts
- Storage SDK: https://docs.0g.ai/developer-hub/building-on-0g/storage/sdk
- Storage CLI: https://docs.0g.ai/developer-hub/building-on-0g/storage/storage-cli
- Compute Inference: https://docs.0g.ai/developer-hub/building-on-0g/compute-network/inference
- Compute Fine-tuning: https://docs.0g.ai/developer-hub/building-on-0g/compute-network/fine-tuning
- Precompiles: https://docs.0g.ai/developer-hub/building-on-0g/contracts-on-0g/precompiles/overview
- Goldsky Indexing: https://docs.0g.ai/developer-hub/building-on-0g/indexing/goldsky
- OP Stack on 0G DA: https://docs.0g.ai/developer-hub/building-on-0g/rollups-and-appchains/op-stack-on-0g-da
- Arbitrum Nitro on 0G DA: https://docs.0g.ai/developer-hub/building-on-0g/rollups-and-appchains/arbitrum-nitro-on-0g-da
- INFT Overview: https://docs.0g.ai/developer-hub/building-on-0g/inft/inft-overview
- ERC-7857: https://docs.0g.ai/developer-hub/building-on-0g/inft/erc7857

**Node Operations:**
- Validator Nodes: https://docs.0g.ai/run-a-node/validator-node
- Storage Nodes: https://docs.0g.ai/run-a-node/storage-node

### Third-Party RPC Providers

| Provider | Link |
|----------|------|
| QuickNode | https://quicknode.com/chains/0g |
| ThirdWeb (Testnet) | https://thirdweb.com/0g-galileo-testnet-16601 |
| ThirdWeb (Mainnet) | https://thirdweb.com/0g-aristotle |
| Ankr | https://ankr.com/rpc/0g/ |
| dRPC | https://drpc.org/chainlist/0g-galileo-testnet-rpc |

### Developer Tools & Integrations

- **Goldsky:** GraphQL indexing for smart contracts + real-time data streaming (Mirror)
- **Caldera:** Rollup-as-a-Service on 0G DA

### MetaMask Network Config

| Field | Testnet | Mainnet |
|-------|---------|---------|
| Chain ID (hex) | `0x40EA` | `0x4125` |
| Chain ID (decimal) | 16602 | 16661 |
| RPC URL | `https://evmrpc-testnet.0g.ai` | `https://evmrpc.0g.ai` |

---

## Community & Links

| Resource | Link |
|----------|------|
| Documentation | https://docs.0g.ai |
| GitHub | https://github.com/0gfoundation |
| Discord | https://discord.gg/0gLabs |
| Twitter/X | https://x.com/0g_Labs |
| Website | https://0g.ai |
| Blog | https://0g.ai/blog |
| Faucet | https://faucet.0g.ai |
| Testnet Explorer | https://chainscan-galileo.0g.ai |
| Mainnet Explorer | https://chainscan.0g.ai |
| Storage Explorer | https://storagescan-galileo.0g.ai |
