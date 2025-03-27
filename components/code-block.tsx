'use client';

interface CodeBlockProps {
  node: any;
  inline: boolean;
  className: string;
  children: any;
  'data-inside-paragraph'?: boolean;
}

export function CodeBlock({
  node,
  inline,
  className,
  children,
  'data-inside-paragraph': insideParagraph,
  ...props
}: CodeBlockProps) {
  if (!inline) {
    // For code blocks inside paragraphs, use a simple inline code element
    // to avoid invalid HTML nesting
    if (insideParagraph) {
      return (
        <code
          className={`${className} block text-sm bg-zinc-100 dark:bg-zinc-800 p-2 my-2 rounded-md overflow-x-auto`}
          {...props}
        >
          {children}
        </code>
      );
    }

    // For normal code blocks, use the full styling
    return (
      <div className="not-prose">
        <pre
          {...props}
          className={`text-sm w-full overflow-x-auto dark:bg-zinc-900 p-4 border border-zinc-200 dark:border-zinc-700 rounded-xl dark:text-zinc-50 text-zinc-900`}
        >
          <code className="whitespace-pre-wrap break-words">{children}</code>
        </pre>
      </div>
    );
  } else {
    return (
      <code
        className={`${className} text-sm bg-zinc-100 dark:bg-zinc-800 py-0.5 px-1 rounded-md`}
        {...props}
      >
        {children}
      </code>
    );
  }
}
