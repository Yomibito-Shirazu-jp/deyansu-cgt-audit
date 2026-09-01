declare global {
  interface Window {
    ethereum?: import("ethers").Eip1193Provider & {
      on?: (event: string, handler: (...args: any[]) => void) => void;
      removeListener?: (event: string, handler: (...args: any[]) => void) => void;
      request: (args: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown>;
    };
  }
}

export {};
