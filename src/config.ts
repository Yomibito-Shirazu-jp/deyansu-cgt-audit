export const CHAIN_CONFIG = {
  l1: {
    chainId: 1,
    name: "Ethereum Mainnet",
    rpcUrl: "http://10.2.0.2:8545",
    dysTokenAddress: "0x0000000000000000000000000000000000000000",
    optimismPortal2Address: "0x0000000000000000000000000000000000000000",
  },
  l2: {
    chainId: 9110,
    name: "Deyansu CGT Chain",
    rpcUrl: "http://10.2.0.2:9645",
    l2ToL1MessagePasserAddress: "0x4200000000000000000000000000000000000016",
    swapRouterAddress: "0x0000000000000000000000000000000000000000",
    wDysAddress: "0x0000000000000000000000000000000000000000",
  },
  token: {
    name: "Deyansu",
    symbol: "1DYS",
    decimals: 18,
  },
};

export function updateConfig(updates: Partial<typeof CHAIN_CONFIG>) {
  Object.assign(CHAIN_CONFIG, updates);
}
