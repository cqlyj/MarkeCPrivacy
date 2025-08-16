"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import MarkdownRenderer from "@/components/markdown-renderer";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  getAuthToken,
  useDynamicContext,
  useIsLoggedIn,
} from "@dynamic-labs/sdk-react-core";
import {
  Search,
  Send,
  Bot,
  User,
  Loader2,
  TrendingUp,
  Wallet,
} from "lucide-react";

interface ProjectData {
  name: string;
  description: string;
  project_url: string;
  submitter: string;
  tokenId?: string;
  ipfsURI?: string;
}

interface Message {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: Date;
  error?: boolean;
}

interface OpenSeaAIAssistantPanelProps {
  project?: ProjectData;
  projectId?: string;
}

export default function OpenSeaAIAssistantPanel({
  project,
  projectId,
}: OpenSeaAIAssistantPanelProps) {
  const { user } = useDynamicContext();
  const isLoggedIn = useIsLoggedIn();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages are added
  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages]);

  // Initialize with welcome message when panel opens
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      const welcomeMessage: Message = {
        id: `welcome-${Date.now()}`,
        content: `Hi! I'm your AI assistant with access to:
- EthGlobal NYC 2025 hackathon data (teams, scores, rankings)
- OpenSea data (NFTs, tokens, wallet portfolios, collections)

**Example queries:**
- "Show me the NFT portfolio of Hashlocked team's first member"
- "Compare team 1 vs team 2" 
- "What's trending in NFTs right now?"
- "Get wallet portfolio for 0x..."

Ask me about teams, NFT portfolios, wallet analysis, or trending collections.`,
        isUser: false,
        timestamp: new Date(),
      };
      setMessages([welcomeMessage]);
    }
  }, [isOpen, messages.length]);

  const sendMessage = async (message: string, action: string = "chat") => {
    if (!message.trim() || isLoading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      content: message,
      isUser: true,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);

    try {
      // Check if user is authenticated first
      if (!isLoggedIn || !user) {
        throw new Error("Please authenticate first");
      }

      const token = getAuthToken();
      if (!token) {
        throw new Error(
          "Authentication token not available. Please try again."
        );
      }

      const payload: any = {
        action,
        message: message,
      };

      // Always include project context if available
      if (project) {
        payload.project = {
          name: project.name,
          description: project.description,
          project_url: project.project_url,
          submitter: project.submitter,
          tokenId: project.tokenId,
          ipfsURI: project.ipfsURI,
        };
      }
      if (projectId) {
        payload.projectId = projectId;
      }

      // Use the OpenSea agent endpoint
      const response = await fetch("/api/opensea-agent/message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      const aiMessage: Message = {
        id: `ai-${Date.now()}`,
        content:
          data.answer ||
          data.message ||
          "I apologize, but I couldn't process your request at the moment. Please try again.",
        isUser: false,
        timestamp: new Date(),
        error: !response.ok || data.error,
      };

      setMessages((prev) => [...prev, aiMessage]);
    } catch (error) {
      console.error("Failed to send message:", error);
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        content:
          "Sorry, I encountered an error. Please check your connection and try again, or make sure the OpenSea MCP access token is properly configured.",
        isUser: false,
        timestamp: new Date(),
        error: true,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      sendMessage(inputValue.trim());
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  // Quick action buttons
  const quickActions = [
    {
      label: "Live Leaderboard",
      action: "Show me the current hackathon leaderboard with top 20 teams",
      icon: TrendingUp,
    },
    {
      label: "Team Analysis",
      action: "Compare the performance of team 1 vs team 5",
      icon: Bot,
    },
    {
      label: "Market Trends",
      action: "What's trending in Web3 and NFTs right now?",
      icon: Search,
    },
  ];

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="lg"
          className="fixed bottom-24 right-6 h-16 w-16 rounded-full shadow-xl hover:shadow-2xl transition-all duration-300 bg-blue-50 hover:bg-blue-100 border-2 border-blue-300 z-50"
        >
          <Search className="h-8 w-8 text-blue-600" />
        </Button>
      </SheetTrigger>
      <SheetContent
        className="w-[90vw] sm:w-[600px] lg:w-[700px] xl:w-[800px] flex flex-col h-full max-w-[90vw]"
        side="right"
      >
        <SheetHeader className="flex-shrink-0">
          <SheetTitle className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <Search className="h-5 w-5 text-blue-600" />
              <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                OpenSea AI Assistant
              </span>
            </div>
            {project && (
              <span className="text-sm font-normal text-muted-foreground">
                - {project.name}
              </span>
            )}
          </SheetTitle>

          {/* Quick Actions */}
          <div className="flex flex-wrap gap-2 mt-2">
            {quickActions.map((qa, index) => (
              <Button
                key={index}
                variant="outline"
                size="sm"
                onClick={() => sendMessage(qa.action)}
                disabled={isLoading || !isLoggedIn || !user}
                className="h-8 text-xs"
              >
                <qa.icon className="h-3 w-3 mr-1" />
                {qa.label}
              </Button>
            ))}
          </div>
        </SheetHeader>

        <div className="flex-1 flex flex-col gap-4 mt-4 min-h-0">
          {/* Messages */}
          <div className="flex-1 overflow-hidden">
            <div className="h-full overflow-y-auto pr-4" ref={scrollAreaRef}>
              <div className="space-y-4 pb-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex gap-3 ${
                      message.isUser ? "justify-end" : "justify-start"
                    }`}
                  >
                    {!message.isUser && (
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center">
                        <Search className="h-4 w-4 text-white" />
                      </div>
                    )}
                    <div
                      className={`max-w-[85%] rounded-lg px-4 py-3 ${
                        message.isUser
                          ? "bg-primary text-primary-foreground"
                          : message.error
                          ? "bg-destructive/10 text-destructive border"
                          : "bg-muted"
                      }`}
                    >
                      {message.isUser ? (
                        <p className="text-sm whitespace-pre-wrap">
                          {message.content}
                        </p>
                      ) : (
                        <div className="text-sm">
                          <MarkdownRenderer
                            content={message.content}
                            className="prose-sm prose-slate dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&>p]:mb-2 [&>ul]:mb-2 [&>ol]:mb-2 [&>h1]:mb-3 [&>h2]:mb-3 [&>h3]:mb-2 [&>h4]:mb-2"
                          />
                        </div>
                      )}
                      <p className="text-xs opacity-70 mt-1">
                        {message.timestamp.toLocaleTimeString()}
                      </p>
                    </div>
                    {message.isUser && (
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                        <User className="h-4 w-4 text-primary-foreground" />
                      </div>
                    )}
                  </div>
                ))}
                {isLoading && (
                  <div className="flex gap-3 justify-start">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center">
                      <Search className="h-4 w-4 text-white" />
                    </div>
                    <div className="bg-muted rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <p className="text-sm">Searching OpenSea data...</p>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={endOfMessagesRef} />
              </div>
            </div>
          </div>

          {/* Input - Fixed at bottom */}
          <form
            onSubmit={handleSubmit}
            className="flex gap-2 flex-shrink-0 pt-2 border-t"
          >
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder={
                !isLoggedIn || !user
                  ? "Please authenticate first..."
                  : "Ask about teams, NFTs, trends, or wallet analysis..."
              }
              disabled={isLoading || !isLoggedIn || !user}
              className="flex-1"
            />
            <Button
              type="submit"
              size="sm"
              disabled={isLoading || !inputValue.trim() || !isLoggedIn || !user}
              className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>

          {/* Footer info */}
          <div className="flex-shrink-0 text-xs text-muted-foreground text-center border-t pt-2">
            <div className="flex items-center justify-center gap-1">
              <Wallet className="h-3 w-3" />
              <span>
                Intelligent Agent: Gemini AI + OpenSea MCP + Internal DB
              </span>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
