import { NextRequest, NextResponse } from "next/server";

/**
 * Read recent messages from the Discord feedback channel.
 * Requires DISCORD_BOT_TOKEN and DISCORD_CHANNEL_ID env vars.
 */
export async function GET(request: NextRequest) {
  const token = process.env.DISCORD_BOT_TOKEN;
  const channelId = process.env.DISCORD_CHANNEL_ID;

  if (!token || !channelId) {
    return NextResponse.json(
      { error: "DISCORD_BOT_TOKEN or DISCORD_CHANNEL_ID not configured" },
      { status: 500 }
    );
  }

  // Optional: limit param (default 20)
  const limit = Math.min(
    parseInt(request.nextUrl.searchParams.get("limit") || "20", 10),
    50
  );

  try {
    const res = await fetch(
      `https://discord.com/api/v10/channels/${channelId}/messages?limit=${limit}`,
      {
        headers: { Authorization: `Bot ${token}` },
      }
    );

    if (!res.ok) {
      const err = await res.text();
      console.error("[Discord] Read failed:", err);
      return NextResponse.json(
        { error: `Discord API error: ${res.status}` },
        { status: res.status }
      );
    }

    const messages = await res.json();

    // Parse into a clean format
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed = messages.map((m: any) => ({
      id: m.id,
      timestamp: m.timestamp,
      author: m.author?.username || "unknown",
      content: m.content || "",
      embeds: (m.embeds || []).map((e: any) => ({
        title: e.title,
        description: e.description,
        color: e.color,
        fields: e.fields?.map((f: any) => ({
          name: f.name,
          value: f.value,
        })),
      })),
    }));

    return NextResponse.json({ messages: parsed, count: parsed.length });
  } catch (error) {
    console.error("[Discord] Read error:", error);
    return NextResponse.json(
      { error: "Failed to read Discord messages" },
      { status: 500 }
    );
  }
}
