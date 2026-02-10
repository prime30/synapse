'use client';

import { motion } from 'framer-motion';
import { CodeEditorMockup } from './CodeEditorMockup';

export function IsometricProductMock() {
  return (
    <div className="iso-mock">
      <motion.div
        className="iso-mock-inner"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      >
        <CodeEditorMockup />
      </motion.div>
    </div>
  );
}
