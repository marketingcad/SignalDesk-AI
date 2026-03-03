import { NextRequest, NextResponse } from "next/server";
import {
  verifySignature,
  extractPostEvents,
  classifyPost,
  isDuplicate,
  insertPostLog,
  sendDiscordNotification,
} from "@/lib/facebook-webhook";

// ---------------------------------------------------------------------------
// GET — Webhook verification (Meta challenge handshake)
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (
    mode === "subscribe" &&
    token === process.env.FB_VERIFY_TOKEN
  ) {
    console.log("[facebook-webhook] Verification successful");
    return new NextResponse(challenge, { status: 200 });
  }

  console.warn("[facebook-webhook] Verification failed — token mismatch");
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

// ---------------------------------------------------------------------------
// POST — Handle incoming webhook events
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  // ---- Signature verification ----
  const appSecret = process.env.FB_APP_SECRET;
  if (appSecret) {
    const signature = request.headers.get("x-hub-signature-256");
    if (!verifySignature(rawBody, signature, appSecret)) {
      console.warn("[facebook-webhook] Invalid signature — rejecting");
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
    }
  }

  // Return 200 immediately — Meta requires fast acknowledgement
  // Process events asynchronously after responding
  const body = JSON.parse(rawBody) as Record<string, unknown>;

  if (body.object !== "group") {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const events = extractPostEvents(body);

  // Fire-and-forget: process events without blocking the response
  const processing = (async () => {
    for (const event of events) {
      try {
        // Idempotency — skip already-processed posts
        if (await isDuplicate(event.post_id)) {
          console.log(
            `[facebook-webhook] Skipping duplicate post: ${event.post_id}`
          );
          continue;
        }

        const classification = classifyPost(event.message);

        if (classification) {
          // Send Discord notification
          await sendDiscordNotification({
            type: classification,
            author_name: event.author_name,
            message: event.message,
            post_id: event.post_id,
            created_time: event.created_time,
          });

          // Store in database
          await insertPostLog(event, classification);

          console.log(
            `[facebook-webhook] Processed: ${event.post_id} → ${classification}`
          );
        } else {
          console.log(
            `[facebook-webhook] Irrelevant post skipped: ${event.post_id}`
          );
        }
      } catch (err) {
        console.error(
          `[facebook-webhook] Error processing post ${event.post_id}:`,
          err
        );
      }
    }
  })();

  // In edge runtime we can't use waitUntil, so we await the processing.
  // For Vercel serverless functions this still completes before the function
  // terminates because we await before returning.
  await processing;

  return NextResponse.json({ received: true }, { status: 200 });
}
