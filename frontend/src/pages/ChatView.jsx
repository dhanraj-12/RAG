import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { chatAPI } from '../api/services';
import ReactMarkdown from 'react-markdown';
import { ArrowLeft, Send, Bot, User, Sparkles } from 'lucide-react';

export default function ChatView() {
  const { chatId } = useParams();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [chatTitle, setChatTitle] = useState('Chat');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    fetchMessages();
  }, [chatId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchMessages = async () => {
    try {
      const res = await chatAPI.getMessages(chatId);
      setMessages(res.data.data || []);
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    setInput('');
    setSending(true);

    // Optimistic: show user message immediately
    const tempUserMsg = {
      _id: 'temp-' + Date.now(),
      role: 'user',
      contentType: 'text',
      text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const res = await chatAPI.sendMessage(chatId, text);
      const { userMessage, assistantMessage } = res.data.data;
      // Replace temp message with real ones
      setMessages((prev) => [
        ...prev.filter((m) => m._id !== tempUserMsg._id),
        userMessage,
        assistantMessage,
      ]);
    } catch (err) {
      console.error('Failed to send message:', err);
      // Remove temp message on error
      setMessages((prev) => prev.filter((m) => m._id !== tempUserMsg._id));
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const formatTime = (d) => new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)' }}>
      {/* Chat Header */}
      <header className="glass" style={{
        padding: '14px 24px',
        display: 'flex', alignItems: 'center', gap: '16px',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <button
          onClick={() => navigate(-1)}
          style={{
            background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.2)',
            borderRadius: '10px', padding: '8px', cursor: 'pointer',
            color: 'var(--accent-secondary)', display: 'flex',
          }}
        >
          <ArrowLeft size={18} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '36px', height: '36px', borderRadius: '10px',
            background: 'var(--accent-gradient)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Sparkles size={18} color="white" />
          </div>
          <div>
            <h2 style={{ fontSize: '1rem', fontWeight: 600 }}>AI Chat</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Powered by Gemini</p>
          </div>
        </div>
      </header>

      {/* Messages Area */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '24px',
        display: 'flex', flexDirection: 'column', gap: '20px',
      }}>
        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="spinner" />
          </div>
        ) : messages.length === 0 ? (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: '16px',
          }}>
            <div style={{
              width: '72px', height: '72px', borderRadius: '20px',
              background: 'var(--accent-gradient)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Sparkles size={36} color="white" />
            </div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 600 }}>Start a conversation</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', textAlign: 'center', maxWidth: '400px' }}>
              Ask any question and the AI will respond using Gemini intelligence
            </p>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div
              key={msg._id}
              className="animate-fade-in-up"
              style={{
                display: 'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                gap: '10px',
                animationDelay: loading ? `${i * 0.03}s` : '0s',
                animationFillMode: 'backwards',
              }}
            >
              {msg.role === 'assistant' && (
                <div style={{
                  width: '32px', height: '32px', borderRadius: '10px',
                  background: 'var(--accent-gradient)', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginTop: '4px',
                }}>
                  <Bot size={16} color="white" />
                </div>
              )}
              <div style={{
                maxWidth: '70%',
                padding: '14px 18px',
                borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                background: msg.role === 'user'
                  ? 'var(--accent-gradient)'
                  : 'var(--bg-card)',
                border: msg.role === 'user' ? 'none' : '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
              }}>
                {msg.role === 'assistant' ? (
                  <div className="markdown-content" style={{ fontSize: '0.9rem', lineHeight: 1.7 }}>
                    <ReactMarkdown>{msg.text}</ReactMarkdown>
                  </div>
                ) : (
                  <p style={{ fontSize: '0.9rem', lineHeight: 1.6 }}>{msg.text}</p>
                )}
                {msg.imageUrls && msg.imageUrls.length > 0 && (
                  <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {msg.imageUrls.map((url, idx) => (
                      <img key={idx} src={url} alt="response" style={{
                        maxWidth: '200px', borderRadius: '10px',
                        border: '1px solid var(--border-subtle)',
                      }} />
                    ))}
                  </div>
                )}
                <p style={{
                  fontSize: '0.65rem', marginTop: '8px',
                  color: msg.role === 'user' ? 'rgba(255,255,255,0.6)' : 'var(--text-muted)',
                  textAlign: msg.role === 'user' ? 'right' : 'left',
                }}>
                  {formatTime(msg.createdAt)}
                </p>
              </div>
              {msg.role === 'user' && (
                <div style={{
                  width: '32px', height: '32px', borderRadius: '10px',
                  background: 'rgba(124,58,237,0.2)', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginTop: '4px', border: '1px solid var(--border-accent)',
                }}>
                  <User size={16} color="var(--accent-secondary)" />
                </div>
              )}
            </div>
          ))
        )}

        {/* Typing indicator */}
        {sending && (
          <div className="animate-fade-in" style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
            <div style={{
              width: '32px', height: '32px', borderRadius: '10px',
              background: 'var(--accent-gradient)', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Bot size={16} color="white" />
            </div>
            <div style={{
              padding: '16px 20px', borderRadius: '18px 18px 18px 4px',
              background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
              display: 'flex', gap: '6px', alignItems: 'center',
            }}>
              <div style={{ display: 'flex', gap: '4px' }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} style={{
                    width: '8px', height: '8px', borderRadius: '50%',
                    background: 'var(--accent-secondary)',
                    animation: `pulse-glow 1.4s ease-in-out ${i * 0.2}s infinite`,
                    opacity: 0.5,
                  }} />
                ))}
              </div>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginLeft: '6px' }}>
                AI is thinking...
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div style={{
        padding: '16px 24px 24px',
        borderTop: '1px solid var(--border-subtle)',
        background: 'rgba(15, 15, 35, 0.8)',
        backdropFilter: 'blur(10px)',
      }}>
        <form onSubmit={handleSend} style={{
          display: 'flex', gap: '12px', alignItems: 'flex-end',
          maxWidth: '800px', margin: '0 auto',
        }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <textarea
              ref={inputRef}
              className="input-field"
              placeholder="Ask anything..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(e);
                }
              }}
              rows={1}
              style={{
                resize: 'none', paddingRight: '16px',
                minHeight: '48px', maxHeight: '120px',
                borderRadius: '14px',
              }}
            />
          </div>
          <button
            type="submit"
            disabled={!input.trim() || sending}
            style={{
              width: '48px', height: '48px', borderRadius: '14px',
              background: input.trim() && !sending ? 'var(--accent-gradient)' : 'var(--bg-glass)',
              border: input.trim() && !sending ? 'none' : '1px solid var(--border-subtle)',
              cursor: input.trim() && !sending ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.3s ease', flexShrink: 0,
            }}
          >
            <Send size={18} color={input.trim() && !sending ? 'white' : 'var(--text-muted)'} />
          </button>
        </form>
      </div>
    </div>
  );
}
