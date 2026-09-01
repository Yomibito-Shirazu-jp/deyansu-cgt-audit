import { useState, useCallback } from "react";
import { BrowserProvider, Contract, formatEther, parseEther } from "ethers";
import { CHAIN_CONFIG } from "./config";
import { ERC20_ABI } from "./abi";

const PAIR_ABI = [
  {
    inputs: [],
    name: "getReserves",
    outputs: [
      { name: "_reserve0", type: "uint112" },
      { name: "_reserve1", type: "uint112" },
      { name: "_blockTimestampLast", type: "uint32" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "totalSupply",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const ROUTER_LIQUIDITY_ABI = [
  {
    inputs: [
      { name: "tokenA", type: "address" },
      { name: "tokenB", type: "address" },
      { name: "amountADesired", type: "uint256" },
      { name: "amountBDesired", type: "uint256" },
      { name: "amountAMin", type: "uint256" },
      { name: "amountBMin", type: "uint256" },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    name: "addLiquidity",
    outputs: [
      { name: "amountA", type: "uint256" },
      { name: "amountB", type: "uint256" },
      { name: "liquidity", type: "uint256" },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "tokenA", type: "address" },
      { name: "tokenB", type: "address" },
      { name: "liquidity", type: "uint256" },
      { name: "amountAMin", type: "uint256" },
      { name: "amountBMin", type: "uint256" },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    name: "removeLiquidity",
    outputs: [
      { name: "amountA", type: "uint256" },
      { name: "amountB", type: "uint256" },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "tokenA", type: "address" },
      { name: "tokenB", type: "address" },
    ],
    name: "getPair",
    outputs: [{ name: "pair", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export function Pool() {
  const [action, setAction] = useState<"add" | "remove">("add");
  const [amountA, setAmountA] = useState("");
  const [amountB, setAmountB] = useState("");
  const [removeAmount, setRemoveAmount] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [account, setAccount] = useState("");
  const [reserveA, setReserveA] = useState("");
  const [reserveB, setReserveB] = useState("");
  const [lpBalance, setLpBalance] = useState("");

  const connectWallet = useCallback(async () => {
    if (!window.ethereum) {
      setStatus("MetaMaskが見つかりません");
      return;
    }
    try {
      const provider = new BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      setAccount(accounts[0]);
      await fetchPoolInfo(accounts[0]);
    } catch (e) {
      setStatus(`ウォレット接続エラー: ${e}`);
    }
  }, []);

  const fetchPoolInfo = useCallback(async (addr: string) => {
    try {
      const provider = new BrowserProvider(window.ethereum!);
      const router = new Contract(
        CHAIN_CONFIG.l2.swapRouterAddress,
        ROUTER_LIQUIDITY_ABI,
        provider
      );
      const pairAddress = await router.getPair(
        CHAIN_CONFIG.l2.wDysAddress,
        CHAIN_CONFIG.l2.swapRouterAddress
      );
      if (pairAddress === "0x0000000000000000000000000000000000000000") {
        setReserveA("0.0");
        setReserveB("0.0");
        setLpBalance("0.0");
        return;
      }
      const pair = new Contract(pairAddress, PAIR_ABI, provider);
      const [r0, r1] = await pair.getReserves();
      setReserveA(formatEther(r0));
      setReserveB(formatEther(r1));
      const lp = await pair.balanceOf(addr);
      setLpBalance(formatEther(lp));
    } catch {
      setReserveA("0.0");
      setReserveB("0.0");
      setLpBalance("0.0");
    }
  }, []);

  const handleAddLiquidity = useCallback(async () => {
    if (!account || !amountA || !amountB) return;
    setLoading(true);
    setStatus("");
    try {
      const provider = new BrowserProvider(window.ethereum!);
      const signer = await provider.getSigner();

      const tokenA = new Contract(CHAIN_CONFIG.l2.wDysAddress, ERC20_ABI, signer);
      const tokenB = new Contract(CHAIN_CONFIG.l2.swapRouterAddress, ERC20_ABI, signer);
      const router = new Contract(
        CHAIN_CONFIG.l2.swapRouterAddress,
        ROUTER_LIQUIDITY_ABI,
        signer
      );

      const approveA = await tokenA.approve(
        CHAIN_CONFIG.l2.swapRouterAddress,
        parseEther(amountA)
      );
      await approveA.wait();
      const approveB = await tokenB.approve(
        CHAIN_CONFIG.l2.swapRouterAddress,
        parseEther(amountB)
      );
      await approveB.wait();
      setStatus("承認完了。流動性追加中...");

      const deadline = Math.floor(Date.now() / 1000) + 600;
      const tx = await router.addLiquidity(
        CHAIN_CONFIG.l2.wDysAddress,
        CHAIN_CONFIG.l2.swapRouterAddress,
        parseEther(amountA),
        parseEther(amountB),
        0,
        0,
        account,
        deadline
      );
      await tx.wait();
      setStatus(`流動性追加完了: ${amountA} 1DYS + ${amountB} WETH`);
      await fetchPoolInfo(account);
    } catch (e) {
      setStatus(`エラー: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [account, amountA, amountB, fetchPoolInfo]);

  const handleRemoveLiquidity = useCallback(async () => {
    if (!account || !removeAmount) return;
    setLoading(true);
    setStatus("");
    try {
      const provider = new BrowserProvider(window.ethereum!);
      const signer = await provider.getSigner();
      const router = new Contract(
        CHAIN_CONFIG.l2.swapRouterAddress,
        ROUTER_LIQUIDITY_ABI,
        signer
      );

      const pairAddress = await router.getPair(
        CHAIN_CONFIG.l2.wDysAddress,
        CHAIN_CONFIG.l2.swapRouterAddress
      );
      const pair = new Contract(pairAddress, PAIR_ABI, signer);
      const approveTx = await pair.approve(
        CHAIN_CONFIG.l2.swapRouterAddress,
        parseEther(removeAmount)
      );
      await approveTx.wait();
      setStatus("承認完了。流動性除去中...");

      const deadline = Math.floor(Date.now() / 1000) + 600;
      const tx = await router.removeLiquidity(
        CHAIN_CONFIG.l2.wDysAddress,
        CHAIN_CONFIG.l2.swapRouterAddress,
        parseEther(removeAmount),
        0,
        0,
        account,
        deadline
      );
      await tx.wait();
      setStatus(`流動性除去完了: ${removeAmount} LP`);
      await fetchPoolInfo(account);
    } catch (e) {
      setStatus(`エラー: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [account, removeAmount, fetchPoolInfo]);

  return (
    <div className="max-w-md mx-auto bg-white rounded-2xl shadow-lg p-6 border border-gray-200">
      <h2 className="text-xl font-bold text-gray-900 mb-4">1DYS / WETH Pool</h2>

      {!account ? (
        <button
          onClick={connectWallet}
          className="w-full py-3 bg-nlt-600 text-white rounded-xl font-semibold hover:bg-nlt-700 transition"
        >
          ウォレット接続
        </button>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-3 gap-2 text-sm">
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <div className="text-gray-500">1DYS</div>
              <div className="font-mono font-semibold text-xs">{reserveA}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <div className="text-gray-500">WETH</div>
              <div className="font-mono font-semibold text-xs">{reserveB}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <div className="text-gray-500">LP残高</div>
              <div className="font-mono font-semibold text-xs">{lpBalance}</div>
            </div>
          </div>

          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setAction("add")}
              className={`flex-1 py-2 rounded-lg font-medium transition ${
                action === "add"
                  ? "bg-nlt-500 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              流動性追加
            </button>
            <button
              onClick={() => setAction("remove")}
              className={`flex-1 py-2 rounded-lg font-medium transition ${
                action === "remove"
                  ? "bg-nlt-500 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              流動性除去
            </button>
          </div>

          {action === "add" ? (
            <>
              <div className="mb-3">
                <label className="block text-sm text-gray-600 mb-1">1DYS量</label>
                <input
                  type="text"
                  value={amountA}
                  onChange={(e) => setAmountA(e.target.value)}
                  placeholder="0.0"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-nlt-500 focus:border-transparent"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm text-gray-600 mb-1">WETH量</label>
                <input
                  type="text"
                  value={amountB}
                  onChange={(e) => setAmountB(e.target.value)}
                  placeholder="0.0"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-nlt-500 focus:border-transparent"
                />
              </div>
              <button
                onClick={handleAddLiquidity}
                disabled={loading || !amountA || !amountB}
                className="w-full py-3 bg-nlt-600 text-white rounded-xl font-semibold hover:bg-nlt-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "処理中..." : "流動性追加"}
              </button>
            </>
          ) : (
            <>
              <div className="mb-4">
                <label className="block text-sm text-gray-600 mb-1">LP除去量</label>
                <input
                  type="text"
                  value={removeAmount}
                  onChange={(e) => setRemoveAmount(e.target.value)}
                  placeholder="0.0"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-nlt-500 focus:border-transparent"
                />
              </div>
              <button
                onClick={handleRemoveLiquidity}
                disabled={loading || !removeAmount}
                className="w-full py-3 bg-nlt-600 text-white rounded-xl font-semibold hover:bg-nlt-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "処理中..." : "流動性除去"}
              </button>
            </>
          )}
        </>
      )}

      {status && (
        <div className="mt-4 p-3 bg-gray-50 rounded-lg text-sm text-gray-700 break-all">
          {status}
        </div>
      )}
    </div>
  );
}
