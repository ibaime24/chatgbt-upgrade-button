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
  reload,
}: {
  chatId: string;
  message: Message;
  vote: Vote | undefined;
  isLoading: boolean;
  messages: Message[];
  setMessages: (messages: Message[]) => void;
  append: (message: Message) => void;
  reload?: () => void;
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
                  console.log('Upgrade button clicked');

                  // Get message content from parts
                  const textFromParts = message.parts
                    ?.filter((part) => part.type === 'text')
                    .map((part) => part.text)
                    .join('\n')
                    .trim();

                  console.log(
                    'Text content:',
                    textFromParts
                      ? `${textFromParts.substring(0, 50)}...`
                      : 'none',
                  );

                  if (!textFromParts) {
                    toast.error('No message content to upgrade');
                    return;
                  }

                  // Create a user message with upgrade request
                  const userMessage: Message = {
                    role: 'user' as const,
                    content: `Please enhance this response with more details and examples:\n\n${textFromParts}`,
                    id: crypto.randomUUID(),
                  };

                  // First try the normal approach
                  if (typeof append === 'function') {
                    console.log('Using append function');
                    await append(userMessage);

                    // Force the client to trigger the server route call
                    if (typeof reload === 'function') {
                      console.log('Calling reload function');
                      reload();
                      console.log('Reload function called');
                    } else {
                      console.error('Reload function is not available');

                      // Alternative approach: Make a direct API call
                      console.log('Trying direct API call as fallback');
                      try {
                        const newMessages = [...messages, userMessage];
                        const response = await fetch('/api/chat', {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                          },
                          body: JSON.stringify({
                            messages: newMessages,
                            id: chatId,
                          }),
                        });

                        if (response.ok) {
                          console.log('Direct API call successful');
                          if (typeof setMessages === 'function') {
                            setMessages(newMessages);
                          }
                        } else {
                          console.error(
                            'Direct API call failed:',
                            response.status,
                          );
                        }
                      } catch (apiError) {
                        console.error('API call error:', apiError);
                      }
                    }
                  } else if (
                    typeof setMessages === 'function' &&
                    Array.isArray(messages)
                  ) {
                    console.log('Using setMessages function');
                    setMessages([...messages, userMessage]);
                  } else {
                    console.error(
                      'Neither append nor setMessages is available',
                    );
                  }
                } catch (error) {
                  console.error('Upgrade button error:', error);
                  toast.error('Failed to trigger upgrade');
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
