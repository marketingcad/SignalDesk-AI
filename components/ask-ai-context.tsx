"use client";

import { createContext, useContext } from "react";

interface AskAiContextValue {
  askAiOpen: boolean;
  toggleAskAi: () => void;
}

export const AskAiContext = createContext<AskAiContextValue>({
  askAiOpen: false,
  toggleAskAi: () => {},
});

export function useAskAi() {
  return useContext(AskAiContext);
}
