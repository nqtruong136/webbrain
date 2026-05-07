/**
 * AgentContext — shared state between the Chat and Browser tabs.
 *
 * This is the seam where the WebBrain agent core (src/chrome/src/agent/agent.js
 * and providers/) will plug in. For now, sendMessage() flips a `working` flag
 * for a few seconds so the Browser tab icon can blink and the chat shows a
 * placeholder reply.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type AgentState = {
  messages: ChatMessage[];
  working: boolean;
  url: string;
  sendMessage: (text: string) => void;
  setUrl: (url: string) => void;
};

const AgentContext = createContext<AgentState | null>(null);

export function AgentProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [working, setWorking] = useState(false);
  const [url, setUrl] = useState('https://www.google.com');
  const workTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sendMessage = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setMessages((m) => [...m, { role: 'user', content: trimmed }]);
    setWorking(true);
    if (workTimeout.current) clearTimeout(workTimeout.current);
    // Stub agent: replace with the real agent loop wired through to the
    // WebView in the Browser tab. The WebView ref will be exposed via this
    // context so tools (click_ax, type_ax, navigate, screenshot, …) can act.
    workTimeout.current = setTimeout(() => {
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          content:
            '(stub) agent run finished — wire WebBrain core here. See context/AgentContext.tsx.',
        },
      ]);
      setWorking(false);
    }, 4000);
  }, []);

  return (
    <AgentContext.Provider value={{ messages, working, url, sendMessage, setUrl }}>
      {children}
    </AgentContext.Provider>
  );
}

export function useAgent() {
  const ctx = useContext(AgentContext);
  if (!ctx) throw new Error('useAgent must be used inside AgentProvider');
  return ctx;
}
