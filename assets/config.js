/* ============================================================
   ONE place to rebrand and point the site at Elysium.
   Change these values before launch; nothing else needs editing.
   ============================================================ */
window.SITE = {
  name: 'Fields',            // project name shown on the site
  ticker: 'FIELDS',          // token ticker without $
  contract: '',             // token CA — filled in at launch
  rewards:  '',              // FieldsRewards address (deploy.mjs prints it)
  swapper:  '',              // TaxSwapper: sells the tax for HYPE (optional)
  buyUrl: '',                // Buy link; {ca} is replaced with the contract address
  xUrl: 'https://x.com/fieldsdotfun',                  // X/Twitter profile URL (empty = hidden)
  minHold: 100000,           // min bag to appear on the board (shown before the keeper's first round)

  network: 'mainnet',        // 'mainnet' | 'testnet'
  chains: {
    mainnet: {
      chainId: 99901,
      name: 'Elysium',
      rpc: 'https://rpc.elysium.kinetiq.xyz',
      explorer: 'https://elysium.kinetiq.xyz/explorer',
    },
    testnet: {
      chainId: 99801,
      name: 'Elysium Testnet',
      rpc: 'https://testnet-rpc.elysium.kinetiq.xyz',
      explorer: 'https://elysium.kinetiq.xyz/testnet-explorer',
    },
  },
};
