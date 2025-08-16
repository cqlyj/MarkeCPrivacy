"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export default function MarkdownRenderer({
  content,
  className = "",
}: MarkdownRendererProps) {
  return (
    <div
      className={`prose prose-sm max-w-none prose-slate dark:prose-invert ${className}`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ ...props }) => (
            <h1
              className="text-2xl font-bold mb-4 text-foreground"
              {...props}
            />
          ),
          h2: ({ ...props }) => (
            <h2
              className="text-xl font-semibold mb-3 text-foreground"
              {...props}
            />
          ),
          h3: ({ ...props }) => (
            <h3
              className="text-lg font-semibold mb-2 text-foreground"
              {...props}
            />
          ),
          h4: ({ ...props }) => (
            <h4
              className="text-base font-semibold mb-2 text-foreground"
              {...props}
            />
          ),
          h5: ({ ...props }) => (
            <h5
              className="text-sm font-semibold mb-1 text-foreground"
              {...props}
            />
          ),
          h6: ({ ...props }) => (
            <h6
              className="text-sm font-semibold mb-1 text-foreground"
              {...props}
            />
          ),
          p: ({ ...props }) => (
            <p
              className="mb-3 text-muted-foreground leading-relaxed"
              {...props}
            />
          ),
          a: ({ ...props }) => (
            <a
              className="text-primary hover:text-primary/80 underline"
              target="_blank"
              rel="noopener noreferrer"
              {...props}
            />
          ),
          ul: ({ ...props }) => (
            <ul
              className="mb-3 ml-4 list-disc text-muted-foreground"
              {...props}
            />
          ),
          ol: ({ ...props }) => (
            <ol
              className="mb-3 ml-4 list-decimal text-muted-foreground"
              {...props}
            />
          ),
          li: ({ ...props }) => <li className="mb-1" {...props} />,
          blockquote: ({ ...props }) => (
            <blockquote
              className="border-l-4 border-primary/30 pl-4 py-2 mb-3 bg-muted/50 text-muted-foreground italic"
              {...props}
            />
          ),
          code: ({ inline, ...props }) =>
            inline ? (
              <code
                className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono text-foreground"
                {...props}
              />
            ) : (
              <code
                className="block bg-muted p-3 rounded text-sm font-mono text-foreground whitespace-pre-wrap"
                {...props}
              />
            ),
          pre: ({ ...props }) => (
            <pre
              className="bg-muted p-3 rounded mb-3 overflow-x-auto"
              {...props}
            />
          ),
          table: ({ ...props }) => (
            <div className="overflow-x-auto mb-3">
              <table
                className="min-w-full border-collapse border border-border"
                {...props}
              />
            </div>
          ),
          thead: ({ ...props }) => <thead className="bg-muted" {...props} />,
          tbody: ({ ...props }) => <tbody {...props} />,
          tr: ({ ...props }) => (
            <tr className="border-b border-border" {...props} />
          ),
          th: ({ ...props }) => (
            <th
              className="border border-border px-3 py-2 text-left font-semibold text-foreground"
              {...props}
            />
          ),
          td: ({ ...props }) => (
            <td
              className="border border-border px-3 py-2 text-muted-foreground"
              {...props}
            />
          ),
          hr: ({ ...props }) => (
            <hr className="my-4 border-border" {...props} />
          ),
          strong: ({ ...props }) => (
            <strong className="font-semibold text-foreground" {...props} />
          ),
          em: ({ ...props }) => (
            <em className="italic text-muted-foreground" {...props} />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
