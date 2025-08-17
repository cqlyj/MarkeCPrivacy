"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import confetti from "canvas-confetti";
import { Button } from "@/components/ui";
import ParticleBackground from "@/components/particle-background";
import OpenSeaAIAssistantPanel from "@/components/opensea-ai-assistant-panel";
import WalletInfoBar from "@/components/wallet-info-bar";
import AuthGuard from "@/components/auth-guard";
import {
  Trophy,
  Sparkles,
  Zap,
  Star,
  Rocket,
  Crown,
  Waves,
  MousePointer,
  ExternalLink,
  Users,
  Timer,
  Target,
} from "lucide-react";

interface ProjectData {
  id: string;
  teamId: number;
  name: string;
  description: string;
  project_url: string;
  submitter: string;
  submittedAt: string;
  isTop20: boolean;
  // Final rankings, only available once winners are announced
  isWinner?: boolean;
  rank?: number;
  totalScore?: number;
}

interface LeaderboardData {
  pool: ProjectData[];
  top20: ProjectData[];
  winners: ProjectData[];
  stats: {
    totalProjects: number;
    top20Count: number;
    poolCount: number;
    winnersAnnounced: boolean;
    judgingStarted?: boolean;
    judgingEnded?: boolean;
  };
}

const ProjectCard = ({
  project,
  isFloating = false,
}: {
  project: ProjectData;
  isFloating?: boolean;
}) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{
        opacity: 1,
        scale: 1,
        y: isFloating ? [0, -10, 0] : 0,
        rotateY: isHovered ? 5 : 0,
      }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{
        layout: { type: "spring", stiffness: 300, damping: 30 },
        y: { repeat: Infinity, duration: 3, ease: "easeInOut" },
      }}
      className={`
        relative group cursor-pointer p-6 rounded-2xl border-2 
        ${
          project.isTop20
            ? "bg-gradient-to-br from-yellow-50 via-amber-50 to-orange-50 dark:from-yellow-900/20 dark:via-amber-900/20 dark:to-orange-900/20 border-amber-300 dark:border-amber-600 shadow-lg shadow-amber-200/50 dark:shadow-amber-900/20"
            : "bg-gradient-to-br from-slate-50 via-gray-50 to-blue-50 dark:from-slate-800/50 dark:via-gray-800/50 dark:to-blue-800/50 border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600"
        }
        transition-all duration-300 transform-gpu
        ${isHovered ? "shadow-2xl scale-105" : "hover:shadow-lg"}
      `}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
    >
      {/* Floating sparkles for top20 projects */}
      {project.isTop20 && (
        <>
          <motion.div
            animate={{
              x: [0, 20, 0],
              y: [0, -20, 0],
              rotate: [0, 180, 360],
            }}
            transition={{
              repeat: Infinity,
              duration: 4,
              ease: "easeInOut",
            }}
            className="absolute -top-2 -right-2 text-yellow-400"
          >
            <Sparkles size={20} />
          </motion.div>

          <motion.div
            animate={{
              x: [0, -15, 0],
              y: [0, 15, 0],
              rotate: [0, -180, -360],
            }}
            transition={{
              repeat: Infinity,
              duration: 3.5,
              ease: "easeInOut",
              delay: 1,
            }}
            className="absolute -top-1 -left-2 text-amber-400"
          >
            <Star size={16} />
          </motion.div>

          <motion.div
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.7, 1, 0.7],
            }}
            transition={{
              repeat: Infinity,
              duration: 2,
              ease: "easeInOut",
            }}
            className="absolute top-2 right-2"
          >
            <Crown className="text-yellow-500" size={24} />
          </motion.div>
        </>
      )}

      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div
            className={`
            w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg
            ${
              project.isTop20
                ? "bg-gradient-to-r from-yellow-400 to-amber-500 text-white shadow-lg"
                : "bg-gradient-to-r from-blue-400 to-indigo-500 text-white"
            }
          `}
          >
            #{project.teamId}
          </div>
          <div>
            <h3 className="font-bold text-lg text-gray-900 dark:text-white">
              {project.name}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Team #{project.teamId}
            </p>
          </div>
        </div>

        {project.isTop20 && (
          <motion.div
            animate={{ rotate: [0, 10, -10, 0] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="text-yellow-500"
          >
            <Trophy size={24} />
          </motion.div>
        )}
      </div>

      <p className="text-gray-700 dark:text-gray-300 mb-4 line-clamp-3">
        {project.description}
      </p>

      <div className="flex items-center justify-between">
        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              window.open(project.project_url, "_blank");
            }}
            className="flex items-center space-x-2"
          >
            <ExternalLink size={16} />
            <span>View Project</span>
          </Button>
        </motion.div>

        <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center space-x-1">
          <Users size={12} />
          <span>{project.submitter.slice(0, 6)}...</span>
        </div>
      </div>

      {/* Hover overlay effect */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: isHovered ? 0.1 : 0 }}
        className={`
          absolute inset-0 rounded-2xl
          ${
            project.isTop20
              ? "bg-gradient-to-r from-yellow-400 to-amber-500"
              : "bg-gradient-to-r from-blue-400 to-indigo-500"
          }
        `}
      />
    </motion.div>
  );
};

// Special card for FINAL winners with 3-D flair ✨
const WinnerCard = ({ project }: { project: ProjectData }) => {
  const [isHovered, setIsHovered] = useState(false);

  // Determine styling by rank (gold / silver / bronze)
  const rankColor =
    project.rank === 1
      ? {
          from: "from-yellow-400",
          to: "to-amber-500",
          text: "text-yellow-600",
        }
      : project.rank === 2
      ? {
          from: "from-gray-300",
          to: "to-gray-500",
          text: "text-gray-500",
        }
      : {
          from: "from-orange-400",
          to: "to-amber-600",
          text: "text-amber-600",
        };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 50, rotateX: 90 }}
      animate={{ opacity: 1, y: 0, rotateX: 0 }}
      whileHover={{ scale: 1.05, rotateY: 5 }}
      transition={{ type: "spring", stiffness: 200, damping: 20 }}
      className={`relative p-8 rounded-3xl bg-gradient-to-br ${rankColor.from} ${rankColor.to} shadow-2xl cursor-pointer transform-gpu perspective-1000`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* 3-D floating trophy */}
      <motion.div
        animate={{ y: isHovered ? [0, -10, 0] : 0, rotate: [0, 15, -15, 0] }}
        transition={{ repeat: Infinity, duration: 4 }}
        className="absolute -top-8 left-1/2 -translate-x-1/2 text-white drop-shadow-lg"
      >
        <Trophy size={64} />
      </motion.div>

      <div className="mt-8 text-center space-y-3">
        <h3 className="text-3xl font-extrabold text-white flex items-center justify-center space-x-2">
          <span className="text-shadow-lg">#{project.teamId}</span>
        </h3>
        <p className="text-lg text-white/90 line-clamp-2">{project.name}</p>
        {typeof project.totalScore === "number" && (
          <p className="text-sm font-semibold text-white/80">
            Score: {project.totalScore}
          </p>
        )}
      </div>
    </motion.div>
  );
};

// Simple card for finalists (no scores shown)
const FinalistCard = ({ project }: { project: ProjectData }) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{
        opacity: 1,
        scale: 1,
        y: [0, -5, 0],
      }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{
        layout: { type: "spring", stiffness: 300, damping: 30 },
        y: { repeat: Infinity, duration: 4, ease: "easeInOut" },
      }}
      className={`
        relative group cursor-pointer p-6 rounded-2xl border-2 
        bg-gradient-to-br from-yellow-50 via-amber-50 to-orange-50 dark:from-yellow-900/20 dark:via-amber-900/20 dark:to-orange-900/20 
        border-amber-300 dark:border-amber-600 shadow-lg shadow-amber-200/50 dark:shadow-amber-900/20
        transition-all duration-300 transform-gpu
        ${isHovered ? "shadow-2xl scale-105" : "hover:shadow-lg"}
      `}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
    >
      {/* Crown for finalists */}
      <motion.div
        animate={{
          scale: [1, 1.1, 1],
          rotate: [0, 5, -5, 0],
        }}
        transition={{
          repeat: Infinity,
          duration: 3,
          ease: "easeInOut",
        }}
        className="absolute top-2 right-2"
      >
        <Crown className="text-yellow-500" size={24} />
      </motion.div>

      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg bg-gradient-to-r from-yellow-400 to-amber-500 text-white shadow-lg">
            #{project.teamId}
          </div>
          <div>
            <h3 className="font-bold text-lg text-gray-900 dark:text-white">
              {project.name}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Team #{project.teamId} • FINALIST
            </p>
          </div>
        </div>
      </div>

      <p className="text-gray-700 dark:text-gray-300 mb-4 line-clamp-3">
        {project.description}
      </p>

      <div className="flex items-center justify-between">
        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              window.open(project.project_url, "_blank");
            }}
            className="flex items-center space-x-2"
          >
            <ExternalLink size={16} />
            <span>View Project</span>
          </Button>
        </motion.div>

        <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center space-x-1">
          <Users size={12} />
          <span>{project.submitter.slice(0, 6)}...</span>
        </div>
      </div>

      {/* Hover overlay effect */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: isHovered ? 0.1 : 0 }}
        className="absolute inset-0 rounded-2xl bg-gradient-to-r from-yellow-400 to-amber-500"
      />
    </motion.div>
  );
};

export default function LeaderboardPage() {
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch("/api/leaderboard");
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Failed to fetch leaderboard");
      }

      setData(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      console.error("Leaderboard fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Celebrate when winners are announced 🎉
  useEffect(() => {
    if (data?.stats.winnersAnnounced) {
      confetti({
        particleCount: 250,
        spread: 120,
        origin: { y: 0.6 },
      });
    }
  }, [data?.stats.winnersAnnounced]);

  // Set up real-time subscriptions
  useEffect(() => {
    if (!data) return;

    const channel = supabase
      .channel("top20_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "top20_status" },
        (payload) => {
          console.log("Top20 status changed:", payload);
          fetchData(); // Refresh data on changes
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "competition_status" },
        (payload) => {
          console.log("Competition status changed:", payload);
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [data, fetchData]);

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="text-blue-500"
        >
          <Zap size={48} />
        </motion.div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-500 mb-4">Error</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
          <Button onClick={fetchData}>Retry</Button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <AuthGuard mode="wallet-only" title="Leaderboard">
      <div className="min-h-svh bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-gray-900 dark:via-blue-900/20 dark:to-indigo-900/20 relative overflow-hidden">
        <WalletInfoBar className="absolute top-6 right-6 z-20" />
        <ParticleBackground />

        {/* Background animation elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[...Array(20)].map((_, i) => (
            <motion.div
              key={i}
              animate={{
                y: [0, -20, 0],
                x: [0, Math.sin(i) * 10, 0],
                opacity: [0.3, 0.7, 0.3],
              }}
              transition={{
                repeat: Infinity,
                duration: 3 + i * 0.2,
                ease: "easeInOut",
                delay: i * 0.1,
              }}
              className="absolute text-blue-200/30 dark:text-blue-700/20"
              style={{
                left: `${(i * 37) % 100}%`,
                top: `${(i * 61) % 100}%`,
              }}
            >
              <Star size={12 + ((i * 7) % 8)} />
            </motion.div>
          ))}
        </div>

        <div className="relative z-10 p-6">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-8"
          >
            <motion.h1
              className="text-4xl md:text-6xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent mb-4"
              animate={{
                backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"],
              }}
              transition={{
                repeat: Infinity,
                duration: 3,
                ease: "easeInOut",
              }}
            >
              MarkeCPrivacy Leaderboard
            </motion.h1>
            <p className="text-lg text-gray-600 dark:text-gray-300 mb-6">
              Hackathon Projects Competing for Glory
            </p>

            {/* Competition Status Banner */}
            {data.stats && (
              <div className="mt-4 flex justify-center">
                {data.stats.winnersAnnounced ? (
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="px-4 py-2 rounded-full bg-gradient-to-r from-green-400 to-emerald-600 text-white font-semibold shadow-lg"
                  >
                    🏆 Winners Announced!
                  </motion.div>
                ) : data.stats.judgingEnded ? (
                  <div className="px-4 py-2 rounded-full bg-yellow-200 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-200 font-medium">
                    Judging concluded • Awaiting results
                  </div>
                ) : data.stats.judgingStarted ? (
                  <div className="px-4 py-2 rounded-full bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200 font-medium animate-pulse">
                    🔍 Judging in progress
                  </div>
                ) : (
                  <div className="px-4 py-2 rounded-full bg-gray-200 dark:bg-gray-800 text-gray-800 dark:text-gray-200 font-medium">
                    Submissions phase
                  </div>
                )}
              </div>
            )}

            {/* Stats Bar */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              className="flex justify-center items-center space-x-8 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm rounded-2xl p-4 max-w-2xl mx-auto"
            >
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {data.stats.totalProjects}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-300">
                  {data.stats.winnersAnnounced
                    ? "Total Finalists"
                    : "Total Projects"}
                </div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-600">
                  {data.winners?.length || 0}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-300">
                  {data.stats.winnersAnnounced ? "Winners" : "Top Winners"}
                </div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-indigo-600">
                  {data.stats.winnersAnnounced
                    ? data.stats.top20Count
                    : data.stats.poolCount}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-300">
                  {data.stats.winnersAnnounced ? "Other Finalists" : "In Pool"}
                </div>
              </div>
            </motion.div>
          </motion.div>

          {/* Winners Section */}
          {data.stats.winnersAnnounced &&
            data.winners &&
            data.winners.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 50 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="mb-20"
              >
                <motion.div
                  className="text-center mb-10"
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ repeat: Infinity, duration: 3 }}
                >
                  <h2 className="text-4xl md:text-5xl font-extrabold bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500 bg-clip-text text-transparent flex items-center justify-center space-x-4">
                    <Rocket size={40} />
                    <span>FINAL PODIUM</span>
                    <Rocket size={40} />
                  </h2>
                  <p className="text-gray-700 dark:text-gray-300 mt-3">
                    Celebrating the crème de la crème
                  </p>
                </motion.div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
                  {data.winners.map((project) => (
                    <WinnerCard key={project.id} project={project} />
                  ))}
                </div>
              </motion.div>
            )}

          {/* Top 20 Section - Visible during judging (before judging ends) */}
          {data.top20.length > 0 &&
            data.stats.judgingStarted &&
            !data.stats.judgingEnded && (
              <motion.div
                initial={{ opacity: 0, y: 50 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                className="mb-16"
              >
                <motion.div
                  className="text-center mb-8"
                  animate={{ scale: [1, 1.02, 1] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                >
                  <h2 className="text-3xl font-bold text-yellow-600 dark:text-yellow-400 flex items-center justify-center space-x-3">
                    <Crown size={32} />
                    <span>TOP 20</span>
                    <Crown size={32} />
                  </h2>
                  <p className="text-gray-600 dark:text-gray-300 mt-2">
                    Current leading projects (subject to change)
                  </p>
                </motion.div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 max-w-7xl mx-auto">
                  <AnimatePresence mode="popLayout">
                    {data.top20.map((project) => (
                      <motion.div key={project.id}>
                        <FinalistCard project={project} />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}

          {/* Finalists Section - Only show remaining finalists after winners are announced */}
          {data.top20.length > 0 && data.stats.winnersAnnounced && (
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="mb-16"
            >
              <motion.div
                className="text-center mb-8"
                animate={{
                  scale: [1, 1.02, 1],
                }}
                transition={{ repeat: Infinity, duration: 2 }}
              >
                <h2 className="text-3xl font-bold text-yellow-600 dark:text-yellow-400 flex items-center justify-center space-x-3">
                  <Crown size={32} />
                  <span>OTHER FINALISTS</span>
                  <Crown size={32} />
                </h2>
                <p className="text-gray-600 dark:text-gray-300 mt-2">
                  The remaining finalists who made it to the final round
                </p>
              </motion.div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 max-w-7xl mx-auto">
                <AnimatePresence mode="popLayout">
                  {data.top20.map((project) => (
                    <motion.div key={project.id}>
                      <ProjectCard project={project} isFloating={false} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </motion.div>
          )}

          {/* Pool Section - Only show when judging hasn't ended AND winners not announced */}
          {data.pool.length > 0 &&
            !data.stats.judgingEnded &&
            !data.stats.winnersAnnounced && (
              <motion.div
                initial={{ opacity: 0, y: 50 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
              >
                <div className="text-center mb-8">
                  <h2 className="text-3xl font-bold text-blue-600 dark:text-blue-400 flex items-center justify-center space-x-3">
                    <Waves size={32} />
                    <span>TALENT POOL</span>
                    <Waves size={32} />
                  </h2>
                  <p className="text-gray-600 dark:text-gray-300 mt-2">
                    Amazing projects waiting to rise to the top
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 max-w-7xl mx-auto">
                  <AnimatePresence mode="popLayout">
                    {data.pool.map((project) => (
                      <motion.div key={project.id}>
                        <ProjectCard project={project} />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}

          {/* Empty State */}
          {data.stats.totalProjects === 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-16"
            >
              <motion.div
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="text-gray-400 mb-4"
              >
                <Target size={64} />
              </motion.div>
              <h3 className="text-2xl font-bold text-gray-500 dark:text-gray-400 mb-2">
                No projects yet
              </h3>
              <p className="text-gray-400">
                Waiting for the first brave teams to submit their projects!
              </p>
            </motion.div>
          )}

          {/* Refresh indicator */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed bottom-6 left-6"
          >
            <Button
              onClick={fetchData}
              variant="outline"
              size="sm"
              className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm"
            >
              <motion.div
                animate={{ rotate: loading ? 360 : 0 }}
                transition={{
                  repeat: loading ? Infinity : 0,
                  duration: 1,
                  ease: "linear",
                }}
              >
                <Zap size={16} />
              </motion.div>
            </Button>
          </motion.div>
        </div>

        {/* OpenSea AI Assistant Panel */}
        <OpenSeaAIAssistantPanel />
      </div>
    </AuthGuard>
  );
}
