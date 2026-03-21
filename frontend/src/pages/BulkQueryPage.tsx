import AppLayout from '../components/AppLayout';
import BulkQuery from '../components/BulkQuery';
import { motion } from 'framer-motion';

export default function BulkQueryPage() {
  return (
    <AppLayout>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        style={{ height: '100%', overflowY: 'auto' }}
      >
        <BulkQuery />
      </motion.div>
    </AppLayout>
  );
}
