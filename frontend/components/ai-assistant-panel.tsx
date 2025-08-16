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
import { MessageCircle, Send, Bot, User, Loader2 } from "lucide-react";

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

interface AIAssistantPanelProps {
  project?: ProjectData;
  projectId?: string;
}

export default function AIAssistantPanel({
  project,
  projectId,
}: AIAssistantPanelProps) {
  const { user } = useDynamicContext();
  const isLoggedIn = useIsLoggedIn();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages are added
  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages]);

  // Initialize with welcome message when panel opens
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      const welcomeMessage: Message = {
        id: `welcome-${Date.now()}`,
        content: project
          ? `Hello! I'm your AI assistant for evaluating **"${project.name}"**.

I have full access to the project details and can help you with analysis, scoring guidance, technical insights, and any questions you have. Just ask me anything!

Try: "Analyze this project" or "How should I score this?" or any other question you have.`
          : "Hello! I'm your UnifiedDJ AI assistant. I can help you with project analysis, judging criteria, and answer any questions you have. How can I assist you today?",
        isUser: false,
        timestamp: new Date(),
      };
      setMessages([welcomeMessage]);
    }
  }, [isOpen, project, messages.length]);

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

      const response = await fetch("/api/agent/message", {
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
          "Sorry, I encountered an error. Please check your connection and try again.",
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

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="lg"
          className="fixed bottom-24 right-6 h-16 w-16 rounded-full shadow-xl hover:shadow-2xl transition-all duration-300 bg-primary/10 hover:bg-primary/20 border-2 border-primary/30 z-50"
        >
          <MessageCircle className="h-8 w-8" />
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[400px] sm:w-[540px] flex flex-col h-full">
        <SheetHeader className="flex-shrink-0">
          <SheetTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            AI Assistant
            {project && (
              <span className="text-sm font-normal text-muted-foreground">
                - {project.name}
              </span>
            )}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 flex flex-col gap-4 mt-4 min-h-0">
          {/* Messages */}
          <ScrollArea className="flex-1 h-full" ref={scrollAreaRef}>
            <div className="space-y-4 pr-4 pb-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-3 ${
                    message.isUser ? "justify-end" : "justify-start"
                  }`}
                >
                  {!message.isUser && (
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <Bot className="h-4 w-4" />
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] rounded-lg px-3 py-2 ${
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
                          className="prose-sm prose-slate dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
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
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="bg-muted rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <p className="text-sm">Thinking...</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Input - Fixed at bottom */}
          <form
            onSubmit={handleSubmit}
            className="flex gap-2 flex-shrink-0 pt-2 border-t"
          >
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={
                !isLoggedIn || !user
                  ? "Please authenticate first..."
                  : "Ask a question about this project..."
              }
              disabled={isLoading || !isLoggedIn || !user}
              className="flex-1"
            />
            <Button
              type="submit"
              size="sm"
              disabled={isLoading || !inputValue.trim() || !isLoggedIn || !user}
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
