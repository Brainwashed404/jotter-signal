import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();
const MODEL = process.env.WDIM_MODEL ?? "claude-sonnet-4-6";

const SYSTEM =
  "You are an intelligence analyst for Jotter Intelligence, a strategic foresight platform. " +
  "Help users think through the strategic implications of signals, trends and ideas sparked by an intelligence briefing. " +
  "Be analytical, precise and concrete. No filler. UK English. Never use em dashes. Never use emojis.";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const { messages, context } = (await req.json()) as {
    messages: { role: "user" | "assistant"; content: string }[];
    context?: string;
  };

  const system = context ? `${SYSTEM}\n\nRelevant briefing context:\n${context}` : SYSTEM;

  const stream = client.messages.stream({ model: MODEL, max_tokens: 1024, system, messages });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } catch {
        // client disconnected or upstream error — close cleanly
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
