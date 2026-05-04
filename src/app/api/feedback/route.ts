import { NextRequest, NextResponse } from "next/server";
import { recordRating } from "@/lib/chart-relevance";

export async function POST(request: NextRequest) {
  try {
    const { rating, comment, bet, type, chart } = await request.json();

    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) {
      console.log("[Feedback] No DISCORD_WEBHOOK_URL set, skipping");
      return NextResponse.json({ ok: true });
    }

    const emoji = rating === "up" ? "\u{1F44D}" : "\u{1F44E}";
    const color = rating === "up" ? 0x10b981 : 0xef4444;

    // Chart-specific rating
    const isChartRating = type === "chart" && chart;
    const title = isChartRating
      ? `${emoji} Chart ${rating === "up" ? "Relevant" : "Not Relevant"}`
      : `${emoji} ${rating === "up" ? "Positive" : "Negative"} Feedback`;

    const embed = {
      title,
      color,
      fields: [
        ...(isChartRating ? [{
          name: "Chart",
          value: chart,
          inline: false,
        }] : []),
        {
          name: "Bet",
          value: bet?.description || "Unknown bet",
          inline: false,
        },
        {
          name: "Sport / Type",
          value: `${bet?.sport || "?"} - ${(bet?.betType || bet?.market || "?").replace("_", "/")}`,
          inline: true,
        },
        ...(bet?.market ? [{
          name: "Market",
          value: bet.market,
          inline: true,
        }] : []),
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

    // Update chart relevance scores from ratings
    if (isChartRating && bet?.sport && rating) {
      try {
        recordRating(bet.sport, bet.market || bet.betType || "", chart, rating);
      } catch { /* non-blocking */ }
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
