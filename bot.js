const { Telegraf } = require('telegraf');
const axios = require('axios');
const express = require('express');

const bot = new Telegraf('8242504126:AAG-DGjS6HMihOXchcuIFGORqWHJhE9Luxg');
const app = express();
const PORT = 3000;

const CMC_API_KEY = 'd0fb14c7-6905-4d42-8aa8-0558bfaea824';
const CMC_BASE_URL = 'https://pro-api.coinmarketcap.com/v1';

// Track active users
const activeUsers = new Set();

// ------------------ Fetch Functions ------------------
// Each function tries to fetch its own endpoint; returns null if fails
async function fetchCMCMarket() {
  try {
    const res = await axios.get(`${CMC_BASE_URL}/global-metrics/quotes/latest`, {
      headers: { 'X-CMC_PRO_API_KEY': CMC_API_KEY }
    });
    return res.data.data;
  } catch (err) { return null; }
}

async function fetchCMCFearGreed() {
  try {
    const res = await axios.get(`${CMC_BASE_URL}/tools/price-performance/fear-and-greed`, {
      headers: { 'X-CMC_PRO_API_KEY': CMC_API_KEY }
    });
    return res.data.data;
  } catch (err) { return null; }
}

// Placeholders for unavailable endpoints (you can later integrate other APIs)
async function fetchAltSeason() { return null; }
async function fetchCMC100() { return null; }
async function fetchETFs() { return null; }
async function fetchDominance() { return null; }
async function fetchOpenInterest() { return null; }
async function fetchVolmex() { return null; }

// ------------------ Aggregate Data ------------------
async function fetchAllData() {
  const data = {};
  data.market = await fetchCMCMarket();
  data.fearGreed = await fetchCMCFearGreed();
  data.altSeason = await fetchAltSeason();
  data.cmc100 = await fetchCMC100();
  data.etfs = await fetchETFs();
  data.dominance = await fetchDominance();
  data.openInterest = await fetchOpenInterest();
  data.volmex = await fetchVolmex();
  return data;
}

// ------------------ Format Message ------------------
function formatMessage(data) {
  let msg = `💹 Crypto Market Overview\n`;

  if (data.market) {
    msg += `📊 Market Cap: $${Number(data.market.quote.USD.total_market_cap).toLocaleString()}\n`;
    msg += `🔁 24h Volume: $${Number(data.market.quote.USD.total_volume_24h).toLocaleString()}\n`;
    msg += `💪 BTC Dominance: ${data.market.btc_dominance}%\n`;
    msg += `💪 ETH Dominance: ${data.market.eth_dominance}%\n`;
  }

  if (data.fearGreed) {
    msg += `😱 Fear & Greed Index: ${data.fearGreed.value} (${data.fearGreed.value_classification})\n`;
  }

  if (data.altSeason) {
    msg += `🌐 Altcoin Season Index: ${data.altSeason.value}%\n`;
  }

  if (data.cmc100) {
    msg += `📈 CMC100 Index: ${data.cmc100.length ? 'Top 100 listed' : 'N/A'}\n`;
  }

  if (data.etfs) {
    msg += `💵 ETFs Net Flow:\n`;
    msg += `ETH ETF: ${data.etfs.eth || 'N/A'}\n`;
    msg += `BTC ETF: ${data.etfs.btc || 'N/A'}\n`;
  }

  if (data.dominance) {
    msg += `💪 Dominance:\n`;
    msg += `ETH Dominance: ${data.dominance.eth_dominance || 'N/A'}%\n`;
    msg += `BTC Dominance: ${data.dominance.btc_dominance || 'N/A'}%\n`;
  }

  if (data.openInterest) {
    msg += `📈 Open Interest:\n`;
    msg += `Perpetuals: ${data.openInterest.perpetuals || 'N/A'}\n`;
    msg += `Futures: ${data.openInterest.futures || 'N/A'}\n`;
  }

  if (data.volmex) {
    msg += `⚡ Volmex Implied Volatility: ${data.volmex.volatility || 'N/A'}\n`;
  }

  return msg;
}

// ------------------ Bot Commands ------------------

// /start command
bot.start(async (ctx) => {
  activeUsers.add(ctx.chat.id);
  ctx.reply('Welcome! You will now receive crypto updates every 1 hour. Here is the latest info:');
  const data = await fetchAllData();
  ctx.reply(formatMessage(data));
});

// /crypto command for manual update
bot.command('crypto', async (ctx) => {
  const data = await fetchAllData();
  ctx.reply(formatMessage(data));
});

// ------------------ Auto-send every 1 hour ------------------
setInterval(async () => {
  if (activeUsers.size === 0) return;
  const data = await fetchAllData();
  const message = formatMessage(data);
  activeUsers.forEach((chatId) => {
    bot.telegram.sendMessage(chatId, message);
  });
}, 1000 * 60 * 60); // 1 hour

// ------------------ Launch Bot ------------------
bot.launch();
console.log('Telegram bot launched.');

// ------------------ Express server for Render ------------------
app.get('/', (req, res) => {
  res.send('Bot is running 🚀');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
