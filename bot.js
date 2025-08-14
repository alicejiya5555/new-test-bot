const { Telegraf } = require('telegraf');
const axios = require('axios');
const express = require('express');

// ---------- CONFIG ----------
const TELEGRAM_BOT_TOKEN = '8242504126:AAG-DGjS6HMihOXchcuIFGORqWHJhE9Luxg';
const CMC_API_KEY = 'd0fb14c7-6905-4d42-8aa8-0558bfaea824';
const PORT = process.env.PORT || 3000;
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'https://new-test-bot-2hjw.onrender.com';

// Create bot
const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

// Track active users for hourly updates
const activeUsers = new Set();

// ---------- FETCH FUNCTIONS ----------

async function fetchMarketOverview() {
  try {
    const res = await axios.get('https://pro-api.coinmarketcap.com/v1/global-metrics/quotes/latest', {
      headers: { 'X-CMC_PRO_API_KEY': CMC_API_KEY }
    });
    return res.data.data;
  } catch (err) {
    console.error('Error fetching market overview:', err.message);
    return null;
  }
}

async function fetchCoin(symbol) {
  try {
    const res = await axios.get('https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest', {
      headers: { 'X-CMC_PRO_API_KEY': CMC_API_KEY },
      params: { symbol: symbol.toUpperCase(), convert: 'USD' }
    });
    return res.data.data[symbol.toUpperCase()];
  } catch (err) {
    console.error(`Error fetching ${symbol}:`, err.message);
    return null;
  }
}

// ---------- FORMAT MESSAGE ----------

function formatCoinMessage(coin, market) {
  if (!coin) return '❌ Coin data not found.';

  const c = coin;
  const change24h = c.quote.USD.percent_change_24h;
  const trendEmoji = change24h >= 0 ? '📈' : '📉';
  const trendSign = change24h >= 0 ? '+' : '';
  const volMktCap = c.quote.USD.volume_24h / c.quote.USD.market_cap * 100;

  const now = new Date();
  const utcDateTime = now.toISOString().replace('T', ' ').split('.')[0] + ' UTC';

  let msg = `🔹 ${c.name} (${c.symbol})\n`;
  msg += `💰 Price: $${c.quote.USD.price.toFixed(2)}\n`;
  msg += `📊 Market Cap: $${Number(c.quote.USD.market_cap).toLocaleString()}\n`;
  msg += `🔁 Volume 24h: $${Number(c.quote.USD.volume_24h).toLocaleString()}\n`;
  msg += `📈 FDV: $${c.fully_diluted_market_cap ? Number(c.fully_diluted_market_cap).toLocaleString() : 'N/A'}\n`;
  msg += `⚡ Vol/Mkt Cap (24h): ${volMktCap.toFixed(2)}%\n`;
  msg += `🏦 Total Supply: ${c.total_supply ? Number(c.total_supply).toLocaleString() : 'N/A'}\n`;
  msg += `🔄 Circulating Supply: ${c.circulating_supply ? Number(c.circulating_supply).toLocaleString() : 'N/A'}\n`;
  msg += `${trendEmoji} ${trendSign}${change24h.toFixed(2)}% ${trendEmoji}\n\n`;

  if (market) {
    msg += '💹 Crypto Market Overview\n';
    msg += `📊 Market Cap: $${Number(market.quote.USD.total_market_cap).toLocaleString()}\n`;
    msg += `🔁 24h Volume: $${Number(market.quote.USD.total_volume_24h).toLocaleString()}\n`;
    msg += `💪 BTC Dominance: ${market.btc_dominance}%\n`;
    msg += `💪 ETH Dominance: ${market.eth_dominance}%\n`;
  }

  msg += `🕒 Date/Time: ${utcDateTime}\n`;

  return msg;
}

// ---------- BOT COMMANDS ----------

bot.start(async (ctx) => {
  activeUsers.add(ctx.chat.id);
  ctx.reply('Welcome! Use /btc, /eth, or /link to get coin data.');
  
  const [coin, market] = await Promise.all([fetchCoin('BTC'), fetchMarketOverview()]);
  ctx.reply(formatCoinMessage(coin, market));
});

bot.command('btc', async (ctx) => {
  const [coin, market] = await Promise.all([fetchCoin('BTC'), fetchMarketOverview()]);
  ctx.reply(formatCoinMessage(coin, market));
});

bot.command('eth', async (ctx) => {
  const [coin, market] = await Promise.all([fetchCoin('ETH'), fetchMarketOverview()]);
  ctx.reply(formatCoinMessage(coin, market));
});

bot.command('link', async (ctx) => {
  const [coin, market] = await Promise.all([fetchCoin('LINK'), fetchMarketOverview()]);
  ctx.reply(formatCoinMessage(coin, market));
});

// ---------- AUTO SEND EVERY 1 HOUR ----------
setInterval(async () => {
  if (activeUsers.size === 0) return;

  const [btc, eth, link, market] = await Promise.all([
    fetchCoin('BTC'), fetchCoin('ETH'), fetchCoin('LINK'), fetchMarketOverview()
  ]);

  activeUsers.forEach(chatId => {
    let msg = '';
    msg += formatCoinMessage(btc, market) + '\n';
    msg += formatCoinMessage(eth, market) + '\n';
    msg += formatCoinMessage(link, market);
    bot.telegram.sendMessage(chatId, msg);
  });
}, 1000 * 60 * 60);

// ---------- WEBHOOK SETUP FOR RENDER ----------
const app = express();
app.use(bot.webhookCallback('/'));

app.get('/', (req, res) => res.send('Bot is running'));
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  await bot.telegram.setWebhook(`${WEBHOOK_URL}/`);
  console.log('Webhook set:', `${WEBHOOK_URL}/`);
});
