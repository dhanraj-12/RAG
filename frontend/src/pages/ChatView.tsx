import { useState, useEffect, useRef, FormEvent, KeyboardEvent, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { chatAPI, Message, Citation } from '../api/services';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Send, Bot, User, Sparkles, RotateCcw, AlertCircle, FileWarning, BookOpen } from 'lucide-react';

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

    // ✅ RESOURCE GUARD (your logic)
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

  const formatTime = (d: string) =>
    new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="chat-container">
      <header className="chat-header">
        <button onClick={() => navigate(-1)} className="btn-icon">
          <ArrowLeft size={16} />
        </button>
        <div className="card-icon" style={{ width: '28px', height: '28px', borderRadius: '6px' }}>
          <Sparkles size={14} />
        </div>
        <div>
          <p style={{ fontSize: '0.85rem', fontWeight: 600 }}>AI Chat</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>Powered by SacredGeeks</p>
        </div>
      </header>

      <div className="chat-messages">
        {loading ? (
          <div className="center-content"><div className="spinner" /></div>
        ) : (
          <>
            {messages.map((msg) => (
              <motion.div key={msg._id} className={`msg-row ${msg.role}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>

                {msg.role === 'assistant' && (
                  <div className="msg-avatar assistant-av"><Bot size={14} /></div>
                )}

                {/* ✅ COLOR FIX APPLIED */}
                <div
                  className={`msg-bubble ${msg.role === 'user' ? 'user-msg' : 'ai-msg'}`}
                  style={{
                    backgroundColor: msg.role === 'user' ? '#2563eb' : undefined,
                    color: msg.role === 'user' ? '#ffffff' : undefined
                  }}
                >
                  {msg.role === 'assistant' ? (
                    <>
                      <div className="md-content">
                        <ReactMarkdown>{msg.text}</ReactMarkdown>
                      </div>

                      {/* Citations / Sources */}
                      {msg.citations && msg.citations.length > 0 && (
                        <div style={{
                          marginTop: '14px',
                          paddingTop: '12px',
                          borderTop: '1px solid rgba(255,255,255,0.08)',
                        }}>
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            marginBottom: '10px',
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            color: 'var(--text-muted)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px',
                          }}>
                            <BookOpen size={12} />
                            <span>Sources</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {msg.citations.map((cite, idx) => (
                              <div
                                key={idx}
                                style={{
                                  padding: '10px 12px',
                                  borderRadius: '8px',
                                  backgroundColor: 'rgba(99, 102, 241, 0.06)',
                                  border: '1px solid rgba(99, 102, 241, 0.12)',
                                  fontSize: '0.73rem',
                                  lineHeight: '1.7',
                                }}
                              >
                                {/* Source Tag */}
                                <span style={{
                                  backgroundColor: 'rgba(99, 102, 241, 0.15)',
                                  color: '#818cf8',
                                  padding: '3px 8px',
                                  borderRadius: '5px',
                                  fontWeight: 700,
                                  fontSize: '0.65rem',
                                  marginBottom: '6px',
                                  display: 'inline-block',
                                }}>
                                  {cite.source_tag}
                                </span>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '6px' }}>
                                  <div><span style={{ color: 'var(--text-muted, #94a3b8)', fontWeight: 600 }}>Chapter:</span> <span style={{ color: 'var(--text-primary, #e2e8f0)' }}>{cite.chapter}</span></div>
                                  {cite.section_name && (
                                    <div><span style={{ color: 'var(--text-muted, #94a3b8)', fontWeight: 600 }}>Section Name:</span> <span style={{ color: 'var(--text-primary, #e2e8f0)' }}>{cite.section_name}</span></div>
                                  )}
                                  {cite.section && (
                                    <div><span style={{ color: 'var(--text-muted, #94a3b8)', fontWeight: 600 }}>Section Number:</span> <span style={{ color: 'var(--text-primary, #e2e8f0)' }}>{cite.section}</span></div>
                                  )}
                                  {cite.page_start > 0 && (
                                    <div><span style={{ color: 'var(--text-muted, #94a3b8)', fontWeight: 600 }}>Page Number Start:</span> <span style={{ color: 'var(--text-primary, #e2e8f0)' }}>{cite.page_start}</span></div>
                                  )}
                                  {cite.page_end > 0 && (
                                    <div><span style={{ color: 'var(--text-muted, #94a3b8)', fontWeight: 600 }}>Page Number End:</span> <span style={{ color: 'var(--text-primary, #e2e8f0)' }}>{cite.page_end}</span></div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <p style={{ color: '#ffffff' }}>
                      {msg.text}
                    </p>
                  )}

                  <p
                    className="msg-time"
                    style={{
                      color: msg.role === 'user' ? 'rgba(255,255,255,0.7)' : undefined
                    }}
                  >
                    {formatTime(msg.createdAt)}
                  </p>
                </div>

                {msg.role === 'user' && (
                  <div className="msg-avatar user-av"><User size={14} /></div>
                )}
              </motion.div>
            ))}

            <AnimatePresence>
              {isStreaming && (
                <motion.div className="msg-row assistant" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                  <div className="msg-avatar assistant-av"><Bot size={14} /></div>
                  <div className="msg-bubble ai-msg">
                    <div className="md-content">
                      <ReactMarkdown>{streamingText}</ReactMarkdown>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {sending && !isStreaming && (
              <div className="msg-row assistant">
                <div className="msg-avatar assistant-av"><Bot size={14} /></div>
                <div className="msg-bubble ai-msg typing-indicator">
                  <div className="typing-dot" />
                  <div className="typing-dot" />
                  <div className="typing-dot" />
                </div>
              </div>
            )}

            {error && (
              <div className="msg-error">
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AlertCircle size={16} />
                  <span>{error.message}</span>
                </div>
                <button onClick={handleRetry} className="btn btn-secondary" style={{ fontSize: '0.75rem' }}>
                  <RotateCcw size={12} /> Retry
                </button>
              </div>
            )}
          </>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area">
        {resourceCount === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '12px',
            backgroundColor: 'rgba(239, 68, 68, 0.05)',
            color: '#ef4444',
            borderRadius: '8px',
            fontSize: '0.8rem',
            border: '1px solid rgba(239, 68, 68, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
          }}>
            <FileWarning size={14} />
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
              <Send size={16} />
            </button>
          </form>
        )}
      </div>
    </div>
  );
}