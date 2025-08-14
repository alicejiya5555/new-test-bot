const { Telegraf } = require('telegraf');
const axios = require('axios');

// ---------- CONFIG ----------
const TELEGRAM_BOT_TOKEN = '8242504126:AAG-DGjS6HMihOXchcuIFGORqWHJhE9Luxg';
const CMC_API_KEY = 'd0fb14c7-6905-4d42-8aa8-0558bfaea824';
const TOP_COIN_LIMIT = 5;

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
    return null;
  }
}

async function fetchTopCoins(limit = TOP_COIN_LIMIT) {
  try {
    const res = await axios.get('https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest', {
      headers: { 'X-CMC_PRO_API_KEY': CMC_API_KEY },
      params: { limit, convert: 'USD' }
    });
    return res.data.data;
  } catch (err) {
    return [];
  }
}

// ---------- FORMAT MESSAGE ----------

function formatMessage(market, topCoins) {
  let msg = '🔹 Top Coins:\n\n';

  topCoins.forEach((coin, index) => {
    const change24h = coin.quote.USD.percent_change_24h;
    const trendEmoji = change24h >= 0 ? '📈' : '📉';
    const trendSign = change24h >= 0 ? '+' : '';
    const volMktCap = coin.quote.USD.volume_24h / coin.quote.USD.market_cap * 100;

    msg += `${index + 1}. ${coin.name} (${coin.symbol})\n`;
    msg += `💰 Price: $${coin.quote.USD.price.toFixed(2)}\n`;
    msg += `📊 Market Cap: $${Number(coin.quote.USD.market_cap).toLocaleString()}\n`;
    msg += `🔁 Volume 24h: $${Number(coin.quote.USD.volume_24h).toLocaleString()}\n`;
    msg += `📈 FDV: $${coin.fully_diluted_market_cap ? Number(coin.fully_diluted_market_cap).toLocaleString() : 'N/A'}\n`;
    msg += `⚡ Vol/Mkt Cap (24h): ${volMktCap.toFixed(2)}%\n`;
    msg += `🏦 Total Supply: ${coin.total_supply ? Number(coin.total_supply).toLocaleString() : 'N/A'}\n`;
    msg += `🔄 Circulating Supply: ${coin.circulating_supply ? Number(coin.circulating_supply).toLocaleString() : 'N/A'}\n`;
    msg += `${trendEmoji} ${trendSign}${change24h.toFixed(2)}% ${trendEmoji}\n\n`;
  });

  // Market overview
  msg += '💹 Crypto Market Overview\n';
  if (market) {
    msg += `📊 Market Cap: $${Number(market.quote.USD.total_market_cap).toLocaleString()}\n`;
    msg += `🔁 24h Volume: $${Number(market.quote.USD.total_volume_24h).toLocaleString()}\n`;
    msg += `💪 BTC Dominance: ${market.btc_dominance}%\n`;
    msg += `💪 ETH Dominance: ${market.eth_dominance}%\n`;
  } else {
    msg += `📊 Market Cap: N/A\n🔁 24h Volume: N/A\n💪 BTC Dominance: N/A\n💪 ETH Dominance: N/A\n`;
  }

  const now = new Date();
  const utcDateTime = now.toISOString().replace('T', ' ').split('.')[0] + ' UTC';
  msg += `🕒 Date/Time: ${utcDateTime}\n`;

  return msg;
}

// ---------- BOT COMMANDS ----------

bot.start(async (ctx) => {
  activeUsers.add(ctx.chat.id);
  ctx.reply('Welcome! You will now receive crypto updates every 1 hour. Here is the latest info:');

  const [market, topCoins] = await Promise.all([fetchMarketOverview(), fetchTopCoins()]);
  ctx.reply(formatMessage(market, topCoins));
});

bot.command('crypto', async (ctx) => {
  const [market, topCoins] = await Promise.all([fetchMarketOverview(), fetchTopCoins()]);
  ctx.reply(formatMessage(market, topCoins));
});

// ---------- AUTO SEND EVERY 1 HOUR ----------
setInterval(async () => {
  if (activeUsers.size === 0) return;
  const [market, topCoins] = await Promise.all([fetchMarketOverview(), fetchTopCoins()]);
  const message = formatMessage(market, topCoins);
  activeUsers.forEach(chatId => bot.telegram.sendMessage(chatId, message));
}, 1000 * 60 * 60);

// ---------- LAUNCH BOT ----------
bot.launch();
console.log('Telegram bot launched.');
