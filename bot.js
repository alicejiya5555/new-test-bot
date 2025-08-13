import { Telegraf } from "telegraf";
import axios from "axios";
import express from "express";
import dotenv from "dotenv";

dotenv.config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const PORT = process.env.PORT || 3000;
const COINGLASS_API_KEY = process.env.COINGLASS_API_KEY;

// Express server to keep bot alive
const app = express();
app.get("/", (req, res) => res.send("Bot is running"));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// Helper: map command to coin
const coinsMap = {
  btc: "BTC",
  eth: "ETH",
  link: "LINK"
};

// Helper: fetch CoinGlass data
async function fetchCoinData(coin, timeframe) {
  try {
    const res = await axios.get(`https://open-api.coinglass.com/api/v1/futures/${coin}?timeframe=${timeframe}`, {
      headers: { "coinglassSecret": COINGLASS_API_KEY }
    });

    const data = res.data.data; // Adjust based on CoinGlass API response

    const message = `
📊 *${coin.toUpperCase()} ${timeframe.toUpperCase()} Market Overview*

💰 Price: $${data.price}
📈 24h High: $${data.high_24h} | 24h Low: $${data.low_24h}
🔁 24h Change: ${data.change_24h}%

📊 *Funding Rate*: ${data.funding_rate}
📉 *Open Interest*: $${data.open_interest} (${data.open_interest_change}% change)
📈 *Long/Short Ratio*: ${data.long_short_ratio_long}% / ${data.long_short_ratio_short}%

📌 *Liquidations (24h)*:
- Long: $${data.liquidations_long}
- Short: $${data.liquidations_short}
- Total: $${data.liquidations_total}

📈 *RSI*: ${data.rsi} (${data.rsi_rank})

🔗 *On-Chain Metrics*:
- Active Addresses: ${data.active_addresses}
- Realized Price: $${data.realized_price}

📅 *Seasonal Analysis*:
- Average Return: ${data.avg_return}%
- Best Month: ${data.best_month}

📈 *ETF Data*:
- Premium/Discount: ${data.etf_premium_discount}%

📊 *CME Report*:
- Long Positions: ${data.cme_long_positions}
- Short Positions: ${data.cme_short_positions}

💡 *Alerts*:
- Hyperliquid Whale: ${data.hyperliquid_whale}
- Highest Funding Rate: ${data.highest_funding}
- Lowest Funding Rate: ${data.lowest_funding}
- Exchange Long/Short Ratio: ${data.exchange_long_short_ratio}
`;

    return message;
  } catch (err) {
    console.error(err);
    return `⚠️ Error fetching ${coin.toUpperCase()} (${timeframe}) data`;
  }
}

// Bot commands for BTC, ETH, LINK with dynamic timeframe
bot.start((ctx) => {
  ctx.reply("Welcome! Use /BTC, /ETH, or /LINK followed by timeframe (e.g., /eth15m or /link12h) to get market data.");
});

bot.on("text", async (ctx) => {
  const msg = ctx.message.text.toLowerCase();
  const match = msg.match(/^\/(btc|eth|link)(\d+[mh])?$/);
  if (match) {
    const coin = coinsMap[match[1]];
    const timeframe = match[2] || "5m";
    const reply = await fetchCoinData(coin, timeframe);
    ctx.replyWithMarkdown(reply);
  }
});

// Launch bot
bot.launch();
console.log("Telegram bot running...");

// Graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
