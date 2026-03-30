import { useState, useRef, useEffect } from "react";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type ChatboxProps = {
  apiBase: string;
  context?: {
    currentTab?: string;
    selectedTaskId?: string | null;
  };
  model: string;
  onModelChange: (model: string) => void;
};

const CHAT_MODELS = [
  { id: "openrouter/anthropic/claude-opus-4", label: "Claude Opus 4", desc: "Highest capability" },
  { id: "openrouter/anthropic/claude-sonnet-4", label: "Claude Sonnet 4", desc: "Balanced" },
  { id: "openrouter/auto", label: "Auto (Recommended)", desc: "Best for task" },
  { id: "openrouter/google/gemini-2.5-flash", label: "Gemini 2.5 Flash", desc: "Fast & cheap" },
  { id: "openrouter/deepseek/deepseek-r1", label: "DeepSeek R1", desc: "Reasoning" },
];

export function Chatbox({ apiBase, context, model, onModelChange }: ChatboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage: Message = { id: Date.now().toString(), role: "user", content: input.trim() };
    const tempAssistantId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`${apiBase}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage.content, context, model })
      });
      if (!res.ok) throw new Error("Network error");
      const data = await res.json();
      setMessages(prev => [...prev, { id: tempAssistantId, role: "assistant", content: data.reply || "Action completed." }]);
    } catch {
      setMessages(prev => [...prev, { id: tempAssistantId, role: "assistant", content: "Couldn't process that. Check your connection." }]);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <button className="chatbox-fab" onClick={() => setIsOpen(true)} aria-label="Open assistant">
        ✦
      </button>
    );
  }

  return (
    <div className="chatbox-panel">
      {/* Header */}
      <div className="chatbox-panel-header">
        <div className="chatbox-panel-title">
          <span className="chatbox-status-dot" />
          <span>System Assistant</span>
        </div>
        <div className="chatbox-model-picker">
          <button
            className="chatbox-model-btn"
            onClick={() => setShowModelPicker(p => !p)}
            title="Change model"
          >
            {CHAT_MODELS.find(m => m.id === model)?.label.split(" ")[0] ?? "Model"} ↓
          </button>
          {showModelPicker && (
            <div className="chatbox-model-dropdown">
              {CHAT_MODELS.map(m => (
                <button
                  key={m.id}
                  className={`chatbox-model-option ${m.id === model ? "active" : ""}`}
                  onClick={() => { onModelChange(m.id); setShowModelPicker(false); }}
                >
                  <span className="model-option-name">{m.label}</span>
                  <span className="model-option-desc">{m.desc}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button className="chatbox-panel-close" onClick={() => setIsOpen(false)}>✕</button>
      </div>

      {/* Messages */}
      <div className="chatbox-panel-messages">
        {messages.length === 0 && (
          <div className="chatbox-panel-empty">
            <div className="chatbox-empty-icon">✦</div>
            <p>How can I help you control the system today?</p>
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={`chatbox-msg chatbox-msg--${msg.role}`}>
            {msg.content}
          </div>
        ))}
        {loading && (
          <div className="chatbox-msg chatbox-msg--assistant chatbox-msg--loading">
            <span className="chatbox-dot" /><span className="chatbox-dot" /><span className="chatbox-dot" />
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form className="chatbox-panel-input" onSubmit={handleSubmit}>
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask or command..."
          className="chatbox-input-field"
          autoFocus
        />
        <button type="submit" className="chatbox-send-btn" disabled={loading || !input.trim()}>
          ↑
        </button>
      </form>
    </div>
  );
}
