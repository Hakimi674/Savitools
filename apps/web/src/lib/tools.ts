export const tools = [
  {
    href: "/inspector",
    label: "Inspector",
    description:
      "Decode any transaction hash, address, or XDR into a readable breakdown.",
    status: "MVP" as const,
  },
  {
    href: "/composer",
    label: "Composer",
    description:
      "Build multi-operation transactions visually — no SDK required.",
    status: "MVP" as const,
  },
  {
    href: "/sandbox",
    label: "Sandbox",
    description: "Generate testnet keypairs and fund wallets with one click.",
    status: "MVP" as const,
  },
  {
    href: "/sandbox/assetcontrol",
    label: "Asset Control",
    description:
      "Inspect issuer authorization flags, audit every trustline, and assemble SetTrustlineFlags, Clawback and SetOptions transactions.",
    status: "MVP" as const,
  },
  {
    href: "/simulator",
    label: "Simulator",
    description: "Find path payment routes and preview fees before you send.",
    status: "MVP" as const,
  },
  {
    href: "/playground",
    label: "Playground",
    description: "Explore and test the Fluxa and CrowdPay APIs interactively.",
    status: "MVP" as const,
  },
  {
    href: "/webhooks",
    label: "Webhooks",
    description:
      "Test CrowdPay and Fluxa webhook payloads against your endpoint.",
    status: "MVP" as const,
  },
  {
    href: "/contracts",
    label: "Contracts",
    description: "Deploy Soroban smart contracts to testnet from your browser.",
    status: "MVP" as const,
  },
  {
    href: "/monitor",
    label: "Monitor",
    description: "Watch addresses and contracts for live ledger activity.",
    status: "MVP" as const,
  },
  {
    href: "/inspector/federation",
    label: "Federation & TOML",
    description:
      "Resolve Stellar federation addresses, inspect stellar.toml files, and check SEP compliance.",
    status: "MVP" as const,
  },
  {
    href: "/simulator/orderbook",
    label: "Order Book",
    description:
      "Live DEX order book, spread analytics, and liquidity depth chart for any asset pair.",
    status: "MVP" as const,
  },
  {
    href: "/inspector/graph",
    label: "Account Graph",
    description:
      "Visualize signer networks, offers, and payment relationships with an interactive force-directed graph.",
    status: "MVP" as const,
  },
  {
    href: "/contracts/events",
    label: "Contract Events",
    description:
      "Decode, filter, and replay Soroban contract events from raw ScVal XDR.",
    status: "MVP" as const,
  },
  {
    href: "/sdk",
    label: "SDK Generator",
    description:
      "Generate copy-paste client code (JS, Python, Go, cURL) from Fluxa/CrowdPay endpoints.",
    status: "MVP" as const,
  },
  {
    href: "/network",
    label: "Network Status",
    description:
      "Live Stellar network health: ledger close time, fee tracker, Horizon latency.",
    status: "MVP" as const,
  },
  {
    href: "/rpc",
    label: "Soroban RPC",
    description:
      "Call read-only Soroban RPC methods with schema-aware inputs and inspect the raw JSON-RPC response.",
    status: "MVP" as const,
  },
  {
    href: "/qr-handoff",
    label: "QR Handoff",
    description:
      "Move an unsigned or partially signed transaction across an air gap with checksummed animated QR frames.",
    status: "MVP" as const,
  },
] as const;
