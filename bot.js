const { Telegraf } = require('telegraf');
const axios = require('axios');
const express = require('express');

const bot = new Telegraf('8242504126:AAG-DGjS6HMihOXchcuIFGORqWHJhE9Luxg');
const app = express();
const PORT = 3000;

const CMC_API_KEY = 'd0fb14c7-6905-4d42-8aa8-0558bfaea824';
const CMC_BASE_URL = 'https://pro-api.coinmarketcap.com/v1';

// Keep track of users who started the bot
const activeUsers = new Set();

// ------------------ Fetch CMC Data ------------------
async function fetchCMCData() {
  try {
    const [market, fearGreed, altSeason, cmc100, etfs, dominance, openInterest, volmex] = await Promise.all([
      axios.get(`${CMC_BASE_URL}/global-metrics/quotes/latest`, { headers: { 'X-CMC_PRO_API_KEY': CMC_API_KEY } }),
      axios.get(`${CMC_BASE_URL}/tools/price-performance/fear-and-greed`, { headers: { 'X-CMC_PRO_API_KEY': CMC_API_KEY } }),
      axios.get(`${CMC_BASE_URL}/tools/altcoin-season`, { headers: { 'X-CMC_PRO_API_KEY': CMC_API_KEY } }),
      axios.get(`${CMC_BASE_URL}/cryptocurrency/listings/latest?limit=100`, { headers: { 'X-CMC_PRO_API_KEY': CMC_API_KEY } }),
      axios.get(`${CMC_BASE_URL}/etf/flow`, { headers: { 'X-CMC_PRO_API_KEY': CMC_API_KEY } }),
      axios.get(`${CMC_BASE_URL}/global-metrics/quotes/latest`, { headers: { 'X-CMC_PRO_API_KEY': CMC_API_KEY } }),
      axios.get(`${CMC_BASE_URL}/futures/open-interest/latest`, { headers: { 'X-CMC_PRO_API_KEY': CMC_API_KEY } }),
      axios.get(`${CMC_BASE_URL}/tools/volatility-implied`, { headers: { 'X-CMC_PRO_API_KEY': CMC_API_KEY } }),
    ]);

    return {
      market: market.data.data,
      fearGreed: fearGreed.data.data,
      altSeason: altSeason.data.data,
      cmc100: cmc100.data.data,
      etfs: etfs.data.data,
      dominance: dominance.data.data,
      openInterest: openInterest.data.data,
      volmex: volmex.data.data
    };
  } catch (err) {
    console.error('Error fetching CMC data:', err.message);
    return null;
  }
}

// ------------------ Format Message ------------------
function formatMessage(data) {
  if (!data) return '❌ Error fetching data.';

  const market = data.market;
  const fearGreed = data.fearGreed;
  const altSeason = data.altSeason;
  const cmc100 = data.cmc100;
  const etfs = data.etfs;
  const dominance = data.dominance;
  const openInterest = data.openInterest;
  const volmex = data.volmex;

  return `
💹 Crypto Market Overview
📊 Market Cap: $${Number(market.quote.USD.total_market_cap).toLocaleString()}
🔁 24h Volume: $${Number(market.quote.USD.total_volume_24h).toLocaleString()}

😱 Fear & Greed Index: ${fearGreed.value} (${fearGreed.value_classification})
🌐 Altcoin Season Index: ${altSeason.value}%
📈 CMC100 Index: ${cmc100.length ? 'Top 100 listed' : 'N/A'}

💵 ETFs Net Flow:
ETH ETF: ${etfs.eth || 'N/A'}
BTC ETF: ${etfs.btc || 'N/A'}

💪 Dominance:
ETH Dominance: ${dominance.eth_dominance}%
BTC Dominance: ${dominance.btc_dominance}%

📈 Open Interest:
Perpetuals: ${openInterest.perpetuals || 'N/A'}
Futures: ${openInterest.futures || 'N/A'}

⚡ Volmex Implied Volatility: ${volmex.volatility || 'N/A'}
`;
}

// ------------------ Bot Commands ------------------

// /start command
bot.start(async (ctx) => {
  activeUsers.add(ctx.chat.id); // Track user
  ctx.reply('Welcome! You will now receive crypto updates every 1 hour. Here is the latest info:');
  const data = await fetchCMCData();
  ctx.reply(formatMessage(data));
});

// /crypto command for manual update
bot.command('crypto', async (ctx) => {
  const data = await fetchCMCData();
  ctx.reply(formatMessage(data));
});

// ------------------ Auto-send every 1 hour ------------------
setInterval(async () => {
  if (activeUsers.size === 0) return; // No users yet
  const data = await fetchCMCData();
  const message = formatMessage(data);
  activeUsers.forEach((chatId) => {
    bot.telegram.sendMessage(chatId, message);
  });
}, 1000 * 60 * 60); // 1 hour interval

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
