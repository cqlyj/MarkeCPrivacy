"use client";

import { motion } from "framer-motion";
import { Sparkles, Crown, Zap } from "lucide-react";

interface ProjectTransitionEffectProps {
  isVisible: boolean;
  type: "rising" | "falling";
  onComplete: () => void;
}

export default function ProjectTransitionEffect({
  isVisible,
  type,
  onComplete,
}: ProjectTransitionEffectProps) {
  if (!isVisible) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center"
    >
      {/* Background overlay */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.3 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black dark:bg-white"
      />

      {/* Central animation */}
      <motion.div
        initial={{ scale: 0, rotate: 0 }}
        animate={{
          scale: [0, 1.5, 1, 1.2, 1],
          rotate: [0, 180, 360],
        }}
        exit={{ scale: 0 }}
        transition={{
          duration: 2,
          times: [0, 0.3, 0.6, 0.8, 1],
          onComplete,
        }}
        className="relative"
      >
        {type === "rising" ? (
          <div className="text-center">
            <motion.div
              animate={{
                y: [0, -50, -30, -40, -35],
                scale: [1, 1.3, 1.1, 1.2, 1.15],
              }}
              transition={{ duration: 2 }}
              className="text-yellow-400 mb-4"
            >
              <Crown size={64} />
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="text-4xl font-bold text-yellow-400 mb-2"
            >
              RISING TO TOP 20!
            </motion.h1>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="text-xl text-white dark:text-gray-900"
            >
              A project ascends to elite status!
            </motion.p>

            {/* Rising particles */}
            {[...Array(12)].map((_, i) => (
              <motion.div
                key={i}
                initial={{
                  x: 0,
                  y: 0,
                  opacity: 0,
                }}
                animate={{
                  x: Math.cos((i * Math.PI * 2) / 12) * 150,
                  y: Math.sin((i * Math.PI * 2) / 12) * 150 - 100,
                  opacity: [0, 1, 0],
                  scale: [0.5, 1, 0.5],
                }}
                transition={{
                  duration: 2,
                  delay: i * 0.1,
                  ease: "easeOut",
                }}
                className="absolute text-yellow-300"
              >
                <Sparkles size={16} />
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center">
            <motion.div
              animate={{
                y: [0, 50, 30, 40, 35],
                scale: [1, 0.7, 0.9, 0.8, 0.85],
              }}
              transition={{ duration: 2 }}
              className="text-blue-400 mb-4"
            >
              <Zap size={64} />
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="text-4xl font-bold text-blue-400 mb-2"
            >
              BACK TO THE POOL
            </motion.h1>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="text-xl text-white dark:text-gray-900"
            >
              A project returns to the talent pool
            </motion.p>

            {/* Falling particles */}
            {[...Array(12)].map((_, i) => (
              <motion.div
                key={i}
                initial={{
                  x: Math.cos((i * Math.PI * 2) / 12) * 150,
                  y: Math.sin((i * Math.PI * 2) / 12) * 150 - 100,
                  opacity: 0,
                }}
                animate={{
                  x: 0,
                  y: 100,
                  opacity: [0, 1, 0],
                  scale: [1, 0.5, 0],
                }}
                transition={{
                  duration: 2,
                  delay: i * 0.1,
                  ease: "easeIn",
                }}
                className="absolute text-blue-300"
              >
                <Sparkles size={16} />
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
