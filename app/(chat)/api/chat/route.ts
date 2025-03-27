import type { UIMessage } from 'ai';
import {
  appendResponseMessages,
  createDataStreamResponse,
  smoothStream,
  streamText,
} from 'ai';
import { auth } from '@/app/(auth)/auth';
import { systemPrompt } from '@/lib/ai/prompts';
import {
  deleteChatById,
  getChatById,
  saveChat,
  saveMessages,
} from '@/lib/db/queries';
import {
  generateUUID,
  getMostRecentUserMessage,
  getTrailingMessageId,
} from '@/lib/utils';
import { generateTitleFromUserMessage } from '../../actions';
import { createDocument } from '@/lib/ai/tools/create-document';
import { updateDocument } from '@/lib/ai/tools/update-document';
import { requestSuggestions } from '@/lib/ai/tools/request-suggestions';
import { getWeather } from '@/lib/ai/tools/get-weather';
import { isProductionEnvironment } from '@/lib/constants';
import { myProvider } from '@/lib/ai/providers';

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const session = await auth();
    const body = await request.json();
    const { messages, id } = body;

    const userMessage = messages[messages.length - 1];
    const messageContent = userMessage.content;

    // Check if this is an upgrade request
    const isUpgradeRequest = messageContent.includes(
      'Please enhance this response with more details and examples:',
    );

    console.log('API route called, is upgrade request:', isUpgradeRequest);
    console.log('Last message content:', messageContent.substring(0, 100));

    // Set the appropriate system prompt and model based on the request type
    const selectedChatModel = messages.some((message: UIMessage) =>
      message.content.toLowerCase().includes('reason'),
    )
      ? 'chat-model-reasoning'
      : 'chat-model';

    const currentSystemPrompt = isUpgradeRequest
      ? 'We are creating an optimized prompt to give to an LLM for the best possible output. Here are your instructions: 1. break this answer down into step-by-step instructions for detailed processing 2. be clear and concise 3. be conversational and use natural language 4.  include a lot of detail, but do not make up information or over-confuse the AI 5. include what NOT to do 6. adopt a relevant persona when writing, but do not include details about your persona in the output. Go into extreme detail, be step-by-step in your explanations and instructions, and understand that you must be as good as possible as the user has already deemed the previous request not good enough'
      : systemPrompt({ selectedChatModel });

    console.log(
      'Using system prompt for:',
      isUpgradeRequest ? 'upgrade' : 'normal chat',
    );
    console.log('System prompt:', currentSystemPrompt);

    if (!session || !session.user || !session.user.id) {
      return new Response('Unauthorized', { status: 401 });
    }

    const chat = await getChatById({ id });

    if (!chat) {
      const title = await generateTitleFromUserMessage({
        message: userMessage,
      });

      await saveChat({ id, userId: session.user.id, title });
    } else {
      if (chat.userId !== session.user.id) {
        return new Response('Unauthorized', { status: 401 });
      }
    }

    await saveMessages({
      messages: [
        {
          chatId: id,
          id: userMessage.id,
          role: 'user',
          parts: userMessage.parts,
          attachments: userMessage.experimental_attachments ?? [],
          createdAt: new Date(),
        },
      ],
    });

    return createDataStreamResponse({
      execute: (dataStream) => {
        const result = streamText({
          model: myProvider.languageModel(selectedChatModel),
          system: currentSystemPrompt,
          messages,
          maxSteps: 5,
          experimental_activeTools:
            selectedChatModel === 'chat-model-reasoning'
              ? []
              : [
                  'getWeather',
                  'createDocument',
                  'updateDocument',
                  'requestSuggestions',
                ],
          experimental_transform: smoothStream({ chunking: 'word' }),
          experimental_generateMessageId: generateUUID,
          tools: {
            getWeather,
            createDocument: createDocument({ session, dataStream }),
            updateDocument: updateDocument({ session, dataStream }),
            requestSuggestions: requestSuggestions({
              session,
              dataStream,
            }),
          },
          onFinish: async ({ response }) => {
            if (session.user?.id) {
              try {
                console.log('Improved prompt:', response.messages);

                // Extract the text content from the last assistant message
                const lastAssistantMessage = response.messages
                  .filter((msg) => msg.role === 'assistant')
                  .pop();

                // Get the improved prompt from the assistant's response
                const improvedPrompt =
                  lastAssistantMessage?.content ||
                  systemPrompt({ selectedChatModel });

                console.log(
                  'Using improved prompt for second API call:',
                  improvedPrompt,
                );

                // Now make the second API call with the improved prompt
                const enhancedResult = await streamText({
                  model: myProvider.languageModel(selectedChatModel),
                  system: improvedPrompt,
                  messages: messages.slice(0, -1), // Original messages without the upgrade request
                  maxSteps: 5,
                  experimental_activeTools:
                    selectedChatModel === 'chat-model-reasoning'
                      ? []
                      : [
                          'getWeather',
                          'createDocument',
                          'updateDocument',
                          'requestSuggestions',
                        ],
                  experimental_transform: smoothStream({ chunking: 'word' }),
                  experimental_generateMessageId: generateUUID,
                  tools: {
                    getWeather,
                    createDocument: createDocument({ session, dataStream }),
                    updateDocument: updateDocument({ session, dataStream }),
                    requestSuggestions: requestSuggestions({
                      session,
                      dataStream,
                    }),
                  },
                  onFinish: async ({ response: finalResponse }) => {
                    console.log(
                      'Final enhanced response:',
                      finalResponse.messages,
                    );
                    // Save the final response
                    if (session.user?.id) {
                      try {
                        console.log(
                          'Final processed response:',
                          finalResponse.messages,
                        );
                        const assistantId = getTrailingMessageId({
                          messages: finalResponse.messages.filter(
                            (message) => message.role === 'assistant',
                          ),
                        });

                        if (!assistantId) {
                          throw new Error('No assistant message found!');
                        }

                        const [, assistantMessage] = appendResponseMessages({
                          messages: [userMessage],
                          responseMessages: finalResponse.messages,
                        });

                        await saveMessages({
                          messages: [
                            {
                              id: assistantId,
                              chatId: id,
                              role: assistantMessage.role,
                              parts: assistantMessage.parts,
                              attachments:
                                assistantMessage.experimental_attachments ?? [],
                              createdAt: new Date(),
                            },
                          ],
                        });
                      } catch (_) {
                        console.error('Failed to save chat');
                      }
                    }
                  },
                  experimental_telemetry: {
                    isEnabled: isProductionEnvironment,
                    functionId: 'stream-text',
                  },
                });

                enhancedResult.consumeStream();
                enhancedResult.mergeIntoDataStream(dataStream);
              } catch (_) {
                console.error('Failed to process upgrade');
              }
            }
          },
          experimental_telemetry: {
            isEnabled: isProductionEnvironment,
            functionId: 'stream-text',
          },
        });

        result.consumeStream();

        result.mergeIntoDataStream(dataStream, {
          sendReasoning: true,
        });
      },
      onError: () => {
        return 'Oops, an error occured!';
      },
    });
  } catch (error) {
    return new Response('An error occurred while processing your request!', {
      status: 404,
    });
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return new Response('Not Found', { status: 404 });
  }

  const session = await auth();

  if (!session || !session.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const chat = await getChatById({ id });

    if (chat.userId !== session.user.id) {
      return new Response('Unauthorized', { status: 401 });
    }

    await deleteChatById({ id });

    return new Response('Chat deleted', { status: 200 });
  } catch (error) {
    return new Response('An error occurred while processing your request!', {
      status: 500,
    });
  }
}
