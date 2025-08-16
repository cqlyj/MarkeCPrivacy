"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  color: string;
  speed: number;
  direction: number;
}

export default function ParticleBackground() {
  const [particles, setParticles] = useState<Particle[]>([]);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const updateDimensions = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    updateDimensions();
    window.addEventListener("resize", updateDimensions);

    return () => window.removeEventListener("resize", updateDimensions);
  }, []);

  // Initialize particles
  useEffect(() => {
    if (dimensions.width === 0 || dimensions.height === 0) return;

    const particleCount = Math.floor(
      (dimensions.width * dimensions.height) / 15000
    );
    const newParticles: Particle[] = [];

    for (let i = 0; i < particleCount; i++) {
      newParticles.push({
        id: i,
        x: Math.random() * dimensions.width,
        y: Math.random() * dimensions.height,
        size: Math.random() * 4 + 1,
        color: [
          "rgba(59, 130, 246, 0.4)", // blue
          "rgba(139, 92, 246, 0.4)", // purple
          "rgba(236, 72, 153, 0.4)", // pink
          "rgba(251, 191, 36, 0.4)", // yellow
          "rgba(34, 197, 94, 0.4)", // green
        ][Math.floor(Math.random() * 5)],
        speed: Math.random() * 2 + 0.5,
        direction: Math.random() * Math.PI * 2,
      });
    }

    setParticles(newParticles);
  }, [dimensions]);

  const animatedParticles = useMemo(() => {
    return particles.map((particle) => (
      <motion.div
        key={particle.id}
        className="absolute rounded-full pointer-events-none"
        style={{
          width: particle.size,
          height: particle.size,
          backgroundColor: particle.color,
          boxShadow: `0 0 ${particle.size * 2}px ${particle.color}`,
        }}
        animate={{
          x: [
            particle.x,
            particle.x + Math.cos(particle.direction) * 100,
            particle.x + Math.cos(particle.direction + Math.PI) * 100,
            particle.x,
          ],
          y: [
            particle.y,
            particle.y + Math.sin(particle.direction) * 100,
            particle.y + Math.sin(particle.direction + Math.PI) * 100,
            particle.y,
          ],
          opacity: [0.2, 0.8, 0.2, 0.2],
          scale: [1, 1.2, 1, 1],
        }}
        transition={{
          duration: 15 + Math.random() * 10,
          repeat: Infinity,
          ease: "linear",
          delay: Math.random() * 5,
        }}
      />
    ));
  }, [particles]);

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      {animatedParticles}

      {/* Floating geometric shapes */}
      {[...Array(8)].map((_, i) => (
        <motion.div
          key={`shape-${i}`}
          className="absolute"
          style={{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
          }}
          animate={{
            y: [0, -50, 0],
            rotate: [0, 180, 360],
            opacity: [0.1, 0.3, 0.1],
          }}
          transition={{
            duration: 8 + i,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 0.5,
          }}
        >
          <div
            className={`w-6 h-6 ${
              i % 3 === 0
                ? "bg-gradient-to-r from-blue-400/20 to-purple-400/20"
                : i % 3 === 1
                ? "bg-gradient-to-r from-yellow-400/20 to-orange-400/20 rounded-full"
                : "bg-gradient-to-r from-green-400/20 to-teal-400/20"
            } ${i % 2 === 0 ? "rounded-full" : "rotate-45"}`}
          />
        </motion.div>
      ))}

      {/* Gradient overlays for depth */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-white/10 dark:to-black/10" />
      <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 via-transparent to-purple-500/5" />
    </div>
  );
}
