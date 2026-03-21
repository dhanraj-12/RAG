import { useState, useEffect, useRef, FormEvent, KeyboardEvent, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { chatAPI, Message, Citation } from '../api/services';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Bot, User, RotateCcw, AlertCircle, FileWarning, BookOpen } from 'lucide-react';
import AppLayout from '../components/AppLayout';

export default function ChatView() {
  const { chatId } = useParams<{ chatId: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const [messages, setMessages] = useState<Message[]>([]);
  const [resourceCount, setResourceCount] = useState<number>(location.state?.resourceCount ?? 1);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [streamingText, setStreamingText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<{ message: string; lastText: string } | null>(null);

  // Citations panel state
  const [showCitations, setShowCitations] = useState(false);
  const [activeCitations, setActiveCitations] = useState<Citation[]>([]);
  const [activeCitationIndex, setActiveCitationIndex] = useState<number | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const streamIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (chatId) fetchInitialData();
  }, [chatId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  const fetchInitialData = async () => {
    try {
      const res = await chatAPI.getMessages(chatId!);
      setMessages(res.data.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const simulateStreaming = useCallback((fullText: string, finalMsg: Message) => {
    setIsStreaming(true);
    setStreamingText('');
    const words = fullText.split(' ');
    let index = 0;

    streamIntervalRef.current = window.setInterval(() => {
      if (index < words.length) {
        setStreamingText((prev) => prev + (index === 0 ? '' : ' ') + words[index]);
        index++;
      } else {
        if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);
        setIsStreaming(false);
        setStreamingText('');
        setMessages((prev) => [...prev, finalMsg]);
      }
    }, 30);
  }, []);

  const handleSend = async (e: FormEvent, retryText?: string) => {
    e.preventDefault();
    if (resourceCount === 0) return;

    const text = retryText || input.trim();
    if (!text || sending) return;

    setInput('');
    setSending(true);
    setError(null);

    const tempMsg: Message = {
      _id: 'temp-' + Date.now(),
      chatId: chatId!,
      role: 'user',
      contentType: 'text',
      text,
      imageUrls: [],
      createdAt: new Date().toISOString()
    };

    if (!retryText) setMessages((prev) => [...prev, tempMsg]);

    try {
      const res = await chatAPI.sendMessage(chatId!, text);
      const { userMessage, assistantMessage } = res.data.data;

      setMessages((prev) => [
        ...prev.filter((m) => m._id !== tempMsg._id),
        userMessage
      ]);

      simulateStreaming(assistantMessage.text, assistantMessage);

    } catch (err: any) {
      console.error(err);
      if (!retryText) {
        setMessages((prev) => prev.filter((m) => m._id !== tempMsg._id));
      }
      setError({
        message: err.response?.data?.message || 'Something went wrong',
        lastText: text
      });
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleRetry = (e: React.MouseEvent) => {
    if (error) handleSend(e as any, error.lastText);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(e as any);
    }
  };

  const handleShowSources = (citations: Citation[]) => {
    setActiveCitations(citations);
    setActiveCitationIndex(null);
    setShowCitations(true);
  };

  const handleCitationClick = (citations: Citation[], index: number) => {
    setActiveCitations(citations);
    setActiveCitationIndex(index);
    setShowCitations(true);
  };

  const formatTime = (d: string) =>
    new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  return (
    <AppLayout
      chatTitle="AI Chat"
      citations={activeCitations}
      showCitations={showCitations}
      onToggleCitations={() => setShowCitations(false)}
      activeCitationIndex={activeCitationIndex}
    >
      <div className="chat-container">
        <div className="chat-messages">
          {loading ? (
            <div className="center-content"><div className="spinner" /></div>
          ) : (
            <>
              {messages.length === 0 && !sending && (
                <div className="welcome-container">
                  <Bot size={32} style={{ marginBottom: '8px', color: 'var(--text-muted)' }} />
                  <h2>Start a conversation</h2>
                  <p>Ask a question about your uploaded documents. Responses include inline citations backed by source material.</p>
                </div>
              )}

              {messages.map((msg) => (
                <motion.div
                  key={msg._id}
                  className={`msg-row ${msg.role}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  {msg.role === 'assistant' && (
                    <div className="msg-avatar assistant-av"><Bot size={13} /></div>
                  )}

                  <div className={`msg-bubble ${msg.role === 'user' ? 'user-msg' : 'ai-msg'}`}>
                    {msg.role === 'assistant' ? (
                      <>
                        <div className="md-content">
                          <ReactMarkdown>{msg.text}</ReactMarkdown>
                        </div>

                        {/* Sources button */}
                        {msg.citations && msg.citations.length > 0 && (
                          <button
                            className="sources-btn"
                            onClick={() => handleShowSources(msg.citations!)}
                          >
                            <BookOpen size={11} />
                            <span>{msg.citations.length} Source{msg.citations.length !== 1 ? 's' : ''}</span>
                          </button>
                        )}
                      </>
                    ) : (
                      <p>{msg.text}</p>
                    )}

                    <p className="msg-time">{formatTime(msg.createdAt)}</p>
                  </div>

                  {msg.role === 'user' && (
                    <div className="msg-avatar user-av"><User size={13} /></div>
                  )}
                </motion.div>
              ))}

              {/* Streaming message */}
              <AnimatePresence>
                {isStreaming && (
                  <motion.div className="msg-row assistant" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                    <div className="msg-avatar assistant-av"><Bot size={13} /></div>
                    <div className="msg-bubble ai-msg">
                      <div className="md-content">
                        <ReactMarkdown>{streamingText}</ReactMarkdown>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Typing dots */}
              {sending && !isStreaming && (
                <div className="msg-row assistant">
                  <div className="msg-avatar assistant-av"><Bot size={13} /></div>
                  <div className="msg-bubble ai-msg typing-indicator">
                    <div className="typing-dot" />
                    <div className="typing-dot" />
                    <div className="typing-dot" />
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="msg-error">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <AlertCircle size={14} />
                    <span>{error.message}</span>
                  </div>
                  <button onClick={handleRetry} className="btn btn-secondary" style={{ fontSize: '0.72rem' }}>
                    <RotateCcw size={11} /> Retry
                  </button>
                </div>
              )}
            </>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="chat-input-area">
          {resourceCount === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '10px',
              backgroundColor: 'rgba(248, 113, 113, 0.04)',
              color: 'var(--error)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.78rem',
              border: '1px solid rgba(248, 113, 113, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}>
              <FileWarning size={13} />
              <span>Resources were removed. You can only view history.</span>
            </div>
          ) : (
            <form onSubmit={handleSend} className="chat-input-wrapper">
              <textarea
                ref={inputRef}
                className="chat-textarea"
                placeholder="Send a message…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
              />
              <button
                type="submit"
                disabled={!input.trim() || sending}
                className={`send-btn ${input.trim() && !sending ? 'active' : ''}`}
              >
                <Send size={14} />
              </button>
            </form>
          )}
        </div>
      </div>
    </AppLayout>
  );
}