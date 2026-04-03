import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { rating, comment, bet } = await request.json();

    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) {
      // Silently succeed if no webhook configured — don't break UX
      console.log("[Feedback] No DISCORD_WEBHOOK_URL set, skipping");
      return NextResponse.json({ ok: true });
    }

    const emoji = rating === "up" ? "\u{1F44D}" : "\u{1F44E}";
    const color = rating === "up" ? 0x10b981 : 0xef4444;

    const embed = {
      title: `${emoji} ${rating === "up" ? "Positive" : "Negative"} Feedback`,
      color,
      fields: [
        {
          name: "Bet",
          value: bet?.description || "Unknown bet",
          inline: false,
        },
        {
          name: "Sport / Type",
          value: `${bet?.sport || "?"} — ${bet?.betType?.replace("_", "/") || "?"}`,
          inline: true,
        },
        {
          name: "Teams",
          value: bet?.teams?.join(" vs ") || "?",
          inline: true,
        },
      ],
      timestamp: new Date().toISOString(),
    };

    if (comment) {
      embed.fields.push({
        name: "Comment",
        value: comment,
        inline: false,
      });
    }

    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Feedback error:", error);
    return NextResponse.json({ ok: true }); // Don't show errors to user
  }
}
