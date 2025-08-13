import { Telegraf } from "telegraf";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const COINGLASS_API_KEY = process.env.COINGLASS_API_KEY;

// Helper function to fetch CoinGlass data
async function fetchCoinData(coin, timeframe) {
  try {
    const response = await axios.get(`https://open-api.coinglass.com/api/pro/v1/futures/${coin}?timeframe=${timeframe}`, {
      headers: { "coinglassSecret": COINGLASS_API_KEY }
    });
    
    const data = response.data.data; // adjust depending on actual CoinGlass response structure

    // Construct the message based on your format
    const message = `
📊 *${coin.toUpperCase()} ${timeframe.toUpperCase()} Market Overview*

💰 Price: $${data.price}
📈 24h High: $${data.high_24h} | 24h Low: $${data.low_24h}
🔁 24h Change: ${data.change_24h}%

📊 *Funding Rate*: ${data.funding_rate}
📉 *Open Interest*: $${data.open_interest}
📈 *Long/Short Ratio*: ${data.long_short_ratio_long}% / ${data.long_short_ratio_short}%

📌 *Liquidations (24h)*:
- Long: $${data.liquidations_long}
- Short: $${data.liquidations_short}

📈 *RSI*: ${data.rsi} (${data.rsi_status})

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
`;

    return message;
  } catch (err) {
    console.error(err);
    return `⚠️ Error fetching data for ${coin.toUpperCase()} (${timeframe.toUpperCase()})`;
  }
}

// Bot commands
bot.start((ctx) => ctx.reply("Welcome! Use /btc, /eth, or /link followed by timeframe (1h, 4h, 1d) to get market data."));

bot.command(["btc", "eth", "link"], async (ctx) => {
  const input = ctx.message.text.split(" ");
  const coin = ctx.message.text.split(" ")[0].substring(1); // btc/eth/link
  const timeframe = input[1] || "1h"; // default 1h
  const msg = await fetchCoinData(coin, timeframe);
  ctx.replyWithMarkdown(msg);
});

// Launch bot
bot.launch();
console.log("Telegram bot is running...");

// Enable graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
