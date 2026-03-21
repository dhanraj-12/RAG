import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../api/services';
import { motion } from 'framer-motion';
import { LogIn, Mail, Lock } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await authAPI.login({ email, password });
      login(res.data.data.user, res.data.data.token);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <motion.div
        className="auth-card"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
      >
        <div className="auth-brand">
          <h1>NoteBookAI</h1>
          <p>Sign in to your workspace</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="banner-error">{error}</div>}

          <div className="form-group">
            <label className="form-label">Email</label>
            <div className="input-icon-wrapper">
              <Mail size={15} className="icon" />
              <input type="email" className="input" placeholder="you@example.com"
                value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <div className="input-icon-wrapper">
              <Lock size={15} className="icon" />
              <input type="password" className="input" placeholder="••••••••"
                value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
          </div>

          <motion.button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ width: '100%', justifyContent: 'center', padding: '10px', marginTop: '4px' }}
            whileTap={{ scale: 0.97 }}
          >
            {loading ? <div className="spinner" /> : <><LogIn size={14} /> Sign In</>}
          </motion.button>

          <p style={{ textAlign: 'center', marginTop: '18px', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
            Don't have an account?{' '}
            <Link to="/register" style={{ color: 'var(--text-primary)', textDecoration: 'underline', fontWeight: 500 }}>Sign up</Link>
          </p>
        </form>
      </motion.div>
    </div>
  );
}
