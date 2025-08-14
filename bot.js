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
    // Only valid endpoints
    const [marketData, fearGreedData] = await Promise.all([
      axios.get(`${CMC_BASE_URL}/global-metrics/quotes/latest`, {
        headers: { 'X-CMC_PRO_API_KEY': CMC_API_KEY }
      }),
      axios.get(`${CMC_BASE_URL}/tools/price-performance/fear-and-greed`, {
        headers: { 'X-CMC_PRO_API_KEY': CMC_API_KEY }
      })
    ]);

    return {
      market: marketData.data.data,
      fearGreed: fearGreedData.data.data
    };

  } catch (err) {
    console.error('Error fetching CMC data:', err.response ? err.response.data : err.message);
    return null;
  }
}

// ------------------ Format Message ------------------
function formatMessage(data) {
  if (!data) return '❌ Error fetching data.';

  const market = data.market;
  const fearGreed = data.fearGreed;

  return `
💹 Crypto Market Overview
📊 Total Market Cap: $${Number(market.quote.USD.total_market_cap).toLocaleString()}
🔁 24h Volume: $${Number(market.quote.USD.total_volume_24h).toLocaleString()}

😱 Fear & Greed Index: ${fearGreed.value} (${fearGreed.value_classification})
💪 BTC Dominance: ${market.btc_dominance}%
💪 ETH Dominance: ${market.eth_dominance}%
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
