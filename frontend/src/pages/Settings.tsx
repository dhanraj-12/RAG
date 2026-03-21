import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../api/services';
import AppLayout from '../components/AppLayout';
import { motion } from 'framer-motion';
import { ArrowLeft, User, Mail, Calendar, Save, CheckCircle } from 'lucide-react';

export default function Settings() {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { if (user) { setName(user.name); setEmail(user.email); } }, [user]);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true); setMessage(''); setError('');
    try {
      const res = await authAPI.updateProfile({ name, email });
      updateUser(res.data.data);
      setMessage('Profile updated successfully');
      setTimeout(() => setMessage(''), 3000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update profile');
    } finally { setSaving(false); }
  };

  const formatDate = (d?: string) => d ? new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';

  return (
    <AppLayout chatTitle="Settings">
      <div className="main-content" style={{ maxWidth: '520px' }}>
        <div style={{ marginBottom: '20px' }}>
          <button onClick={() => navigate('/')} className="btn btn-ghost" style={{ padding: '3px 0', marginBottom: '6px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            <ArrowLeft size={13} /> Back
          </button>
          <h1 className="page-title">Settings</h1>
        </div>

        {/* Profile Section */}
        <motion.div className="card" style={{ marginBottom: '14px' }}
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h2 className="section-title" style={{ marginBottom: '14px' }}>Profile</h2>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '18px', padding: '12px', background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
            <div className="card-icon" style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-md)' }}>
              <User size={18} />
            </div>
            <div>
              <p style={{ fontWeight: 600, fontSize: '0.9rem' }}>{user?.name}</p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Mail size={11} /> {user?.email}
              </p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '1px' }}>
                <Calendar size={11} /> Joined {formatDate(user?.createdAt)}
              </p>
            </div>
          </div>

          <form onSubmit={handleSave}>
            {error && <div className="banner-error">{error}</div>}
            {message && <div className="banner-success"><CheckCircle size={13} /> {message}</div>}

            <div className="form-group">
              <label className="form-label">Name</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <motion.button type="submit" className="btn btn-primary" disabled={saving}
              style={{ width: '100%', justifyContent: 'center', padding: '10px' }} whileTap={{ scale: 0.97 }}>
              {saving ? <div className="spinner" /> : <><Save size={13} /> Save Changes</>}
            </motion.button>
          </form>
        </motion.div>
      </div>
    </AppLayout>
  );
}
