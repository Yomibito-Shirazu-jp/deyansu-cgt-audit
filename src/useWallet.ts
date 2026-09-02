import { useState, useEffect, useCallback, useRef } from "react";
import { BrowserProvider, JsonRpcProvider, Contract, formatEther, parseEther } from "ethers";
import { CHAIN_CONFIG } from "./config";

export interface TxLog {
  timestamp: number;
  type: string;
  hash: string;
  status: "pending" | "success" | "failed";
  details: string;
}

export function useWallet() {
  const [account, setAccount] = useState("");
  const [chainId, setChainId] = useState(0);
  const [l1Balance, setL1Balance] = useState("0.0");
  const [l2Balance, setL2Balance] = useState("0.0");
  const [l1TokenBalance, setL1TokenBalance] = useState("0.0");
  const [error, setError] = useState("");
  const [balanceError, setBalanceError] = useState("");
  const [txLogs, setTxLogs] = useState<TxLog[]>([]);
  const providerRef = useRef<BrowserProvider | null>(null);

  const addTxLog = useCallback((log: TxLog) => {
    setTxLogs((prev) => [log, ...prev].slice(0, 50));
  }, []);

  const fetchBalances = useCallback(async (addr: string) => {
    let hadError = false;
    try {
      const l1Provider = new JsonRpcProvider(CHAIN_CONFIG.l1.rpcUrl);
      const l1Bal = await l1Provider.getBalance(addr);
      setL1Balance(formatEther(l1Bal));
    } catch {
      setL1Balance("0.0");
      hadError = true;
    }
    try {
      const l2Provider = new JsonRpcProvider(CHAIN_CONFIG.l2.rpcUrl);
      const l2Bal = await l2Provider.getBalance(addr);
      setL2Balance(formatEther(l2Bal));
    } catch {
      setL2Balance("0.0");
      hadError = true;
    }
    try {
      const l1Provider = new JsonRpcProvider(CHAIN_CONFIG.l1.rpcUrl);
      const token = new Contract(
        CHAIN_CONFIG.l1.dysTokenAddress,
        [
          { inputs: [{ name: "account", type: "address" }], name: "balanceOf", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
        ],
        l1Provider
      );
      const tokenBal = await token.balanceOf(addr);
      setL1TokenBalance(formatEther(tokenBal));
    } catch {
      setL1TokenBalance("0.0");
      hadError = true;
    }
    setBalanceError(hadError ? "残高取得に失敗しました。RPC接続を確認してください。" : "");
  }, []);

  const connectWallet = useCallback(async (): Promise<string | null> => {
    if (!window.ethereum) {
      setError("MetaMaskが見つかりません");
      return null;
    }
    try {
      const provider = new BrowserProvider(window.ethereum);
      providerRef.current = provider;
      const accounts = await provider.send("eth_requestAccounts", []);
      const network = await provider.getNetwork();
      const cid = Number(network.chainId);
      setAccount(accounts[0]);
      setChainId(cid);
      setError("");
      await fetchBalances(accounts[0]);
      return accounts[0];
    } catch (e) {
      const msg = e instanceof Error ? e.message : "ウォレット接続エラー";
      setError(msg);
      return null;
    }
  }, [fetchBalances]);

  const switchToL2 = useCallback(async () => {
    if (!window.ethereum) return;
    const hexChainId = "0x" + CHAIN_CONFIG.l2.chainId.toString(16);
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: hexChainId }],
      });
    } catch (switchError: any) {
      if (switchError?.code === 4902) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: hexChainId,
              chainName: CHAIN_CONFIG.l2.name,
              nativeCurrency: {
                name: CHAIN_CONFIG.token.name,
                symbol: CHAIN_CONFIG.token.symbol,
                decimals: CHAIN_CONFIG.token.decimals,
              },
              rpcUrls: [CHAIN_CONFIG.l2.rpcUrl],
              blockExplorerUrls: [],
            },
          ],
        });
      } else {
        const msg = switchError instanceof Error ? switchError.message : "チェーン切り替えエラー";
        setError(msg);
      }
    }
  }, []);

  const switchToL1 = useCallback(async () => {
    if (!window.ethereum) return;
    const hexChainId = "0x" + CHAIN_CONFIG.l1.chainId.toString(16);
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: hexChainId }],
      });
    } catch (switchError: any) {
      if (switchError?.code === 4902) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: hexChainId,
              chainName: CHAIN_CONFIG.l1.name,
              nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
              rpcUrls: [CHAIN_CONFIG.l1.rpcUrl],
              blockExplorerUrls: [],
            },
          ],
        });
      } else {
        const msg = switchError instanceof Error ? switchError.message : "チェーン切り替えエラー";
        setError(msg);
      }
    }
  }, []);

  // 切替後に実チェーンをRPCで検証し、期待IDと一致した場合のみ true を返す。
  // 非同期更新される chainId state は信用せず、署名前のガードとして使う。
  const ensureChain = useCallback(
    async (expectedId: number): Promise<boolean> => {
      if (!window.ethereum) {
        setError("MetaMaskが見つかりません");
        return false;
      }
      try {
        let provider = new BrowserProvider(window.ethereum);
        let actual = Number((await provider.getNetwork()).chainId);

        if (actual !== expectedId) {
          if (expectedId === CHAIN_CONFIG.l1.chainId) {
            await switchToL1();
          } else if (expectedId === CHAIN_CONFIG.l2.chainId) {
            await switchToL2();
          } else {
            setError(`未知のチェーンID: ${expectedId}`);
            return false;
          }
          // 切替後に実チェーンを再取得（拒否・保留・失敗はここで検出）
          provider = new BrowserProvider(window.ethereum);
          actual = Number((await provider.getNetwork()).chainId);
        }

        providerRef.current = provider;
        setChainId(actual);

        if (actual !== expectedId) {
          setError(`チェーン切り替えに失敗しました (現在: ${actual} / 必要: ${expectedId})`);
          return false;
        }
        return true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "チェーン切り替えエラー";
        setError(msg);
        return false;
      }
    },
    [switchToL1, switchToL2]
  );

  const checkBalance = useCallback(
    (amount: string, balance: string): boolean => {
      try {
        const requested = parseEther(amount);
        const available = parseEther(balance);
        return requested <= available;
      } catch {
        return false;
      }
    },
    []
  );

  const getSigner = useCallback(async () => {
    if (!providerRef.current) {
      if (!window.ethereum) throw new Error("Wallet not connected");
      providerRef.current = new BrowserProvider(window.ethereum);
    }
    return await providerRef.current.getSigner();
  }, []);

  useEffect(() => {
    if (!window.ethereum) return;

    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) {
        setAccount("");
        setL1Balance("0.0");
        setL2Balance("0.0");
        setL1TokenBalance("0.0");
      } else {
        setAccount(accounts[0]);
        fetchBalances(accounts[0]);
      }
    };

    const handleChainChanged = () => {
      if (providerRef.current) {
        providerRef.current.getNetwork().then((network) => {
          setChainId(Number(network.chainId));
        });
      }
    };

    window.ethereum.on?.("accountsChanged", handleAccountsChanged);
    window.ethereum.on?.("chainChanged", handleChainChanged);

    return () => {
      window.ethereum?.removeListener?.("accountsChanged", handleAccountsChanged);
      window.ethereum?.removeListener?.("chainChanged", handleChainChanged);
    };
  }, [fetchBalances]);

  return {
    account,
    chainId,
    l1Balance,
    l2Balance,
    l1TokenBalance,
    error,
    balanceError,
    txLogs,
    addTxLog,
    connectWallet,
    switchToL2,
    switchToL1,
    ensureChain,
    checkBalance,
    getSigner,
    fetchBalances,
  };
}
