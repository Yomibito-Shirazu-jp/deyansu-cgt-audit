const PLACEHOLDER = "0x0000000000000000000000000000000000000000";

export const CHAIN_CONFIG = Object.freeze({
  l1: {
    chainId: 1,
    name: "Ethereum Mainnet",
    rpcUrl: "https://mainnet.infura.io/v3/YOUR_API_KEY",
    dysTokenAddress: PLACEHOLDER,
    optimismPortal2Address: PLACEHOLDER,
  },
  l2: {
    chainId: 9110,
    name: "Deyansu CGT Chain",
    rpcUrl: "https://rpc.deyansu.chain",
    l2ToL1MessagePasserAddress: "0x4200000000000000000000000000000000000016",
    swapRouterAddress: PLACEHOLDER,
    wDysAddress: PLACEHOLDER,
    wethAddress: PLACEHOLDER,
    factoryAddress: PLACEHOLDER,
  },
  token: {
    name: "Deyansu",
    symbol: "1DYS",
    decimals: 18,
    totalSupply: "340000000000",
  },
  railgun: {
    railgunAddress: PLACEHOLDER,
  },
});
