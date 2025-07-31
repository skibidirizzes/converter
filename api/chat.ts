import { GoogleGenAI } from '@google/genai';

// IMPORTANT: Set the runtime to "edge" to run on Vercel's Edge Network
export const runtime = 'edge';

export async function POST(req: Request) {
  try {
    const { contents } = await req.json();
    const apiKey = process.env.API_KEY;

    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'API_KEY environment variable not set on the server.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
    
    if (!contents) {
        return new Response(JSON.stringify({ error: 'Missing "contents" in request body' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const ai = new GoogleGenAI({ apiKey });

    // Ask the model to generate content, streaming the response
    const apiStream = await ai.models.generateContentStream({
      model: 'gemini-2.5-flash',
      contents: { parts: contents },
    });

    // Pipe the stream from the API to the client response
    const readableStream = new ReadableStream({
        async start(controller) {
            const encoder = new TextEncoder();
            for await (const chunk of apiStream) {
                const text = chunk.text;
                if (text) {
                    controller.enqueue(encoder.encode(text));
                }
            }
            controller.close();
        }
    });

    return new Response(readableStream, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });

  } catch (error: any) {
    console.error('Error in chat API endpoint:', error);
    // Ensure we return a Response object for errors
    return new Response(
      JSON.stringify({ error: `An error occurred on the server: ${error.message || 'Unknown error'}` }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
