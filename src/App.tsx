import { useState } from "react";
import { Bridge } from "./Bridge";
import { Swap } from "./Swap";
import { Pool } from "./Pool";
import { CHAIN_CONFIG } from "./config";

type Tab = "bridge" | "swap" | "pool";

function App() {
  const [tab, setTab] = useState<Tab>("bridge");

  return (
    <div className="min-h-screen bg-gradient-to-br from-nlt-50 via-white to-nlt-100">
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-nlt-400 to-nlt-600 flex items-center justify-center text-white font-bold text-sm">
              D
            </div>
            <span className="font-bold text-gray-900 text-lg">Deyansu</span>
            <span className="text-xs text-gray-500 ml-1">CGT Chain</span>
          </div>
          <div className="text-sm text-gray-500">
            Chain ID: {CHAIN_CONFIG.l2.chainId}
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex gap-2 mb-6 justify-center">
          <button
            onClick={() => setTab("bridge")}
            className={`px-6 py-2 rounded-full font-medium transition ${
              tab === "bridge"
                ? "bg-nlt-600 text-white shadow-md"
                : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
            }`}
          >
            Bridge
          </button>
          <button
            onClick={() => setTab("swap")}
            className={`px-6 py-2 rounded-full font-medium transition ${
              tab === "swap"
                ? "bg-nlt-600 text-white shadow-md"
                : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
            }`}
          >
            Swap
          </button>
          <button
            onClick={() => setTab("pool")}
            className={`px-6 py-2 rounded-full font-medium transition ${
              tab === "pool"
                ? "bg-nlt-600 text-white shadow-md"
                : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
            }`}
          >
            Pool
          </button>
        </div>

        {tab === "bridge" ? <Bridge /> : tab === "swap" ? <Swap /> : <Pool />}

        <div className="mt-8 text-center text-xs text-gray-400">
          <p>
            L1: {CHAIN_CONFIG.l1.rpcUrl} | L2: {CHAIN_CONFIG.l2.rpcUrl}
          </p>
          <p className="mt-1">
            Token: {CHAIN_CONFIG.token.name} ({CHAIN_CONFIG.token.symbol})
          </p>
        </div>
      </main>
    </div>
  );
}

export default App;
