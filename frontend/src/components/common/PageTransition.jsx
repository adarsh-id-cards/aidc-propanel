import React from 'react';
import { motion } from 'framer-motion';

/**
 * PageTransition — fast, stable, and smooth opacity fade on route/tab change.
 * Prevents vertical shifts (y translation) and mode="wait" unmount gaps that cause tables to glitch or jump.
 */
export default function PageTransition({ pageKey, children, _fullHeight = false }) {
  return (
    <motion.div
      key={pageKey}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{
        duration: 0.16,
        ease: 'easeOut',
      }}
      style={{
        flex: 1,
        height: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      {children}
    </motion.div>
  );
}
