import { auth } from '@/app/(auth)/auth';
import { myProvider } from '@/lib/ai/providers';
import { streamText } from 'ai';

interface UpgradeRequestBody {
  message: string;
}

export async function POST(request: Request) {
  try {
    // Authentication check
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse and validate request body
    let body: UpgradeRequestBody;
    try {
      body = await request.json();
    } catch (error) {
      return Response.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 },
      );
    }

    const { message } = body;

    // Validate message content
    if (!message) {
      return Response.json(
        { error: 'Message content is required' },
        { status: 400 },
      );
    }

    // Log the incoming request body
    console.log('Received request body:', body);

    /*
    // TEMPORARY: Return an enhanced version without calling the AI model
    // This helps us verify if the client-side code is working correctly
    const enhancedText = `${message}\n\nAdditionally, it's worth noting that this is an enhanced version of the original response. It includes more details and examples to better address the question.`;
    console.log('Returning enhanced text:', enhancedText);
    return Response.json({ text: enhancedText });
    */

    // UNCOMMENTED: Use the AI model for enhancement
    try {
      // Generate an upgraded response using the AI model
      console.log('Attempting to upgrade message of length:', message.length);

      try {
        // Use the chat model for enhancement
        const result = await streamText({
          model: myProvider.languageModel('chat-model'),
          system:
            'You are a helpful assistant. Your task is to enhance the given text by adding more details, examples, and clearer explanations.',
          messages: [
            {
              role: 'user',
              content: `Please enhance the following text to be more detailed, informative, and helpful: "${message}"`,
            },
          ],
        });

        console.log('Starting to consume stream...');
        let enhancedText = '';

        // Consume the stream and collect the text
        for await (const chunk of result.fullStream) {
          if (chunk.type === 'text-delta') {
            enhancedText += chunk.textDelta;
          }
        }

        console.log('Received enhanced text:', enhancedText);

        if (!enhancedText) {
          console.error('No text in AI response');
          return Response.json(
            {
              error: 'Empty response from AI model',
              // Fall back to the original message as a last resort
              text: message,
            },
            { status: 200 },
          );
        }

        return Response.json({ text: enhancedText });
      } catch (aiError) {
        console.error('AI model error:', aiError);

        // Return the original message as a fallback
        return Response.json(
          {
            error: 'AI enhancement failed',
            text: message,
          },
          { status: 200 },
        );
      }
    } catch (error) {
      console.error('Error in upgrade processing:', error);

      // Final fallback - return something rather than failing completely
      return Response.json(
        {
          error: 'Processing error',
          text: message || 'Unable to enhance the response at this time.',
        },
        { status: 200 },
      );
    }
  } catch (error) {
    console.error('Critical error in upgrade endpoint:', error);
    return Response.json(
      {
        error: 'Internal Server Error',
        text: 'Unable to process your request at this time.',
      },
      { status: 200 },
    );
  }
}
