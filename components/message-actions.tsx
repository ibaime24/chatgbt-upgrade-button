import type { Message } from 'ai';
import { useSWRConfig } from 'swr';
import { useCopyToClipboard } from 'usehooks-ts';

import type { Vote } from '@/lib/db/schema';

import { CopyIcon, ThumbDownIcon, ThumbUpIcon, SparklesIcon } from './icons';
import { Button } from './ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip';
import { memo } from 'react';
import equal from 'fast-deep-equal';
import { toast } from 'sonner';

export function PureMessageActions({
  chatId,
  message,
  vote,
  isLoading,
  messages,
  setMessages,
  append,
}: {
  chatId: string;
  message: Message;
  vote: Vote | undefined;
  isLoading: boolean;
  messages: Message[];
  setMessages: (messages: Message[]) => void;
  append: (message: Message) => void;
}) {
  const { mutate } = useSWRConfig();
  const [_, copyToClipboard] = useCopyToClipboard();

  if (isLoading) return null;
  if (message.role === 'user') return null;

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex flex-row gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              className="py-1 px-2 h-fit text-muted-foreground"
              variant="outline"
              onClick={async () => {
                const textFromParts = message.parts
                  ?.filter((part) => part.type === 'text')
                  .map((part) => part.text)
                  .join('\n')
                  .trim();

                if (!textFromParts) {
                  toast.error("There's no text to copy!");
                  return;
                }

                await copyToClipboard(textFromParts);
                toast.success('Copied to clipboard!');
              }}
            >
              <CopyIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Copy</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              data-testid="message-upvote"
              className="py-1 px-2 h-fit text-muted-foreground !pointer-events-auto"
              disabled={vote?.isUpvoted}
              variant="outline"
              onClick={async () => {
                const upvote = fetch('/api/vote', {
                  method: 'PATCH',
                  body: JSON.stringify({
                    chatId,
                    messageId: message.id,
                    type: 'up',
                  }),
                });

                toast.promise(upvote, {
                  loading: 'Upvoting Response...',
                  success: () => {
                    mutate<Array<Vote>>(
                      `/api/vote?chatId=${chatId}`,
                      (currentVotes) => {
                        if (!currentVotes) return [];

                        const votesWithoutCurrent = currentVotes.filter(
                          (vote) => vote.messageId !== message.id,
                        );

                        return [
                          ...votesWithoutCurrent,
                          {
                            chatId,
                            messageId: message.id,
                            isUpvoted: true,
                          },
                        ];
                      },
                      { revalidate: false },
                    );

                    return 'Upvoted Response!';
                  },
                  error: 'Failed to upvote response.',
                });
              }}
            >
              <ThumbUpIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Upvote Response</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              data-testid="message-downvote"
              className="py-1 px-2 h-fit text-muted-foreground !pointer-events-auto"
              variant="outline"
              disabled={vote && !vote.isUpvoted}
              onClick={async () => {
                const downvote = fetch('/api/vote', {
                  method: 'PATCH',
                  body: JSON.stringify({
                    chatId,
                    messageId: message.id,
                    type: 'down',
                  }),
                });

                toast.promise(downvote, {
                  loading: 'Downvoting Response...',
                  success: () => {
                    mutate<Array<Vote>>(
                      `/api/vote?chatId=${chatId}`,
                      (currentVotes) => {
                        if (!currentVotes) return [];

                        const votesWithoutCurrent = currentVotes.filter(
                          (vote) => vote.messageId !== message.id,
                        );

                        return [
                          ...votesWithoutCurrent,
                          {
                            chatId,
                            messageId: message.id,
                            isUpvoted: false,
                          },
                        ];
                      },
                      { revalidate: false },
                    );

                    return 'Downvoted Response!';
                  },
                  error: 'Failed to downvote response.',
                });
              }}
            >
              <ThumbDownIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Downvote Response</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              data-testid="message-upgrade"
              className="py-1 px-2 h-fit text-muted-foreground hover:text-primary hover:bg-primary/10 !pointer-events-auto"
              variant="outline"
              onClick={async () => {
                try {
                  // Get message content from parts
                  const textFromParts = message.parts
                    ?.filter((part) => part.type === 'text')
                    .map((part) => part.text)
                    .join('\n')
                    .trim();

                  // Validate message content
                  if (!textFromParts) {
                    toast.error('No message content to upgrade');
                    return;
                  }

                  toast.loading('Enhancing response...', {
                    id: 'upgrade-toast',
                  });

                  try {
                    // Simple fetch call
                    const response = await fetch('/api/upgrade', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        message: textFromParts,
                      }),
                    });

                    // Log the response status and body
                    console.log('Upgrade response status:', response.status);
                    const responseBody = await response.clone().text();
                    console.log('Upgrade response body:', responseBody);

                    // Handle non-OK responses
                    if (!response.ok) {
                      toast.error(
                        `Failed to enhance response: ${response.statusText}`,
                        {
                          id: 'upgrade-toast',
                        },
                      );
                      return;
                    }

                    // Parse the response
                    const data = await response.json();

                    // Create a new message
                    if (data.text) {
                      const newMessage = {
                        role: 'assistant' as const,
                        content: data.text,
                        id: crypto.randomUUID(),
                        parts: [
                          {
                            type: 'text' as const,
                            text: data.text,
                          },
                        ],
                      };

                      // Add to chat
                      if (typeof append === 'function') {
                        append(newMessage);
                      } else if (
                        typeof setMessages === 'function' &&
                        Array.isArray(messages)
                      ) {
                        setMessages([...messages, newMessage]);
                      }

                      toast.success('Enhanced response added!', {
                        id: 'upgrade-toast',
                      });
                    } else {
                      toast.error('No enhanced text received', {
                        id: 'upgrade-toast',
                      });
                    }
                  } catch (error) {
                    console.error('Error in upgrade process:', error);
                    toast.error('Failed to process upgrade', {
                      id: 'upgrade-toast',
                    });
                  }
                } catch (error) {
                  console.error('Upgrade button error:', error);
                  toast.error('Error initializing upgrade', {
                    id: 'upgrade-toast',
                  });
                }
              }}
            >
              <SparklesIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Upgrade Response</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}

export const MessageActions = memo(
  PureMessageActions,
  (prevProps, nextProps) => {
    if (!equal(prevProps.vote, nextProps.vote)) return false;
    if (prevProps.isLoading !== nextProps.isLoading) return false;

    return true;
  },
);
