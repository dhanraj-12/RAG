import AppLayout from '../components/AppLayout';
import AmbientOrb from '../components/AmbientOrb';
import { motion } from 'framer-motion';

export default function Dashboard() {
  return (
    <AppLayout>
      <div className="empty-state-hero">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}
        >
          <AmbientOrb />

          <motion.div
            className="empty-state-text"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.5 }}
          >
            <h2>No notebook selected</h2>
            <p>Select or create a notebook to begin</p>
          </motion.div>
        </motion.div>
      </div>
    </AppLayout>
  );
}
