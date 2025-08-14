require('dotenv').config();
const { Telegraf } = require('telegraf');
const axios = require('axios');
const express = require('express');

// ----- CONFIG -----
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8242504126:AAG-DGjS6HMihOXchcuIFGORqWHJhE9Luxg';
const CMC_API_KEY = process.env.CMC_API_KEY || 'd0fb14c7-6905-4d42-8aa8-0558bfaea824';
const AMBER_API_KEY = process.env.AMBER_API_KEY || ''; // optional
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'https://new-test-bot-2hjw.onrender.com';
const PORT = process.env.PORT || 3000;

const CMC_BASE = 'https://pro-api.coinmarketcap.com/v1';
const AMBER_BASE = 'https://api.amberdata.io/v2'; // ETF holdings/flows endpoint

// ----- BOT INIT -----
const bot = new Telegraf(TELEGRAM_BOT_TOKEN);
const app = express();
const activeUsers = new Set();

// ----- HELPERS -----
function utc7Now() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc + 7 * 3600 * 1000);
}

function formatUTCTime(date) {
  return date.toISOString().replace('T', ' ').split('.')[0] + ' UTC+07';
}

function fmtNum(num, dec = 2) {
  if (!num && num !== 0) return 'N/A';
  return Number(num).toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

// ----- MARKET CLOCK -----
function marketClockUTC7() {
  const now = utc7Now();
  const h = now.getUTCHours() + now.getUTCMinutes() / 60;

  const markets = [
    { name: 'Tokyo (JP)', open: 9, close: 15 },
    { name: 'London (UK)', open: 16, close: 23 },
    { name: 'New York (US)', open: 20, close: 3 + 24 },
  ];

  let msg = '';
  markets.forEach(mkt => {
    const { name, open, close } = mkt;
    let openNow = false, timeLeft = '—';

    if (open < close) {
      openNow = h >= open && h < close;
      if (openNow) timeLeft = ((close - h) * 60).toFixed(0) + ' min';
    } else {
      openNow = h >= open || h < close;
      if (openNow) {
        timeLeft = h >= open ? ((24 - h + close) * 60).toFixed(0) : ((close - h) * 60).toFixed(0);
      }
    }
    msg += `${openNow ? '🟢' : '🔴'} ${name} - ${openNow ? `${timeLeft} to close` : 'Closed'}\n`;
  });
  return msg.trim();
}

// ----- FETCHERS -----
async function fetchCoin(symbol) {
  try {
    const res = await axios.get(`${CMC_BASE}/cryptocurrency/quotes/latest`, {
      headers: { 'X-CMC_PRO_API_KEY': CMC_API_KEY },
      params: { symbol: symbol.toUpperCase(), convert: 'USD' }
    });
    return res.data.data[symbol.toUpperCase()];
  } catch (e) {
    console.error(`${symbol} fetch error:`, e.message);
    return null;
  }
}

async function fetchMarket() {
  try {
    const res = await axios.get(`${CMC_BASE}/global-metrics/quotes/latest`, {
      headers: { 'X-CMC_PRO_API_KEY': CMC_API_KEY }
    });
    return res.data.data;
  } catch (e) {
    console.error('Market overview error:', e.message);
    return null;
  }
}

async function fetchETFFlows() {
  if (!AMBER_API_KEY) return { btc: 'N/A', eth: 'N/A' };
  try {
    const [btcRes, ethRes] = await Promise.all([
      axios.get(`${AMBER_BASE}/metrics/asset/bitcoin/etf-holdings/flow`, { headers: { 'x-api-key': AMBER_API_KEY } }),
      axios.get(`${AMBER_BASE}/metrics/asset/ethereum/etf-holdings/flow`, { headers: { 'x-api-key': AMBER_API_KEY } })
    ]);
    const btcFlow = btcRes.data?.data?.[0]?.value ?? 'N/A';
    const ethFlow = ethRes.data?.data?.[0]?.value ?? 'N/A';
    return {
      btc: btcFlow !== 'N/A' ? `$${(btcFlow / 1e6).toFixed(2)}M` : 'N/A',
      eth: ethFlow !== 'N/A' ? `$${(ethFlow / 1e6).toFixed(2)}M` : 'N/A'
    };
  } catch (e) {
    console.error('ETF flow error:', e.message);
    return { btc: 'N/A', eth: 'N/A' };
  }
}

// ----- FORMATTERS -----
function fmtCoin(coin) {
  if (!coin) return 'Coin data unavailable.';
  const c = coin;
  const v24 = c.quote.USD.volume_24h;
  const mcap = c.quote.USD.market_cap;
  const change = c.quote.USD.percent_change_24h;
  const emoji = change >= 0 ? '📈' : '📉';
  const sign = change >= 0 ? '+' : '';
  return `🔹 ${c.name} (${c.symbol})
💰 Price: $${c.quote.USD.price.toFixed(2)}
📊 MarketCap: ${fmtNum(mcap)}
🔁 Volume24h: ${fmtNum(v24)}
📈 FDV: ${fmtNum(c.fully_diluted_market_cap)}
⚡ Vol/MktCap: ${(v24 / mcap * 100).toFixed(2)}%
🏦 TotalSupply: ${fmtNum(c.total_supply,0)}
🔄 CircSupply: ${fmtNum(c.circulating_supply,0)}
${emoji} ${sign}${change.toFixed(2)}% ${emoji}`;
}

function fmtOverview(market, flows) {
  const mcap = market?.quote?.USD?.total_market_cap;
  const vol24 = market?.quote?.USD?.total_volume_24h;
  const btcDom = market?.btc_dominance;
  const ethDom = market?.eth_dominance;
  return `💹 Market Overview
📊 Total MktCap: ${fmtNum(mcap)}
🔁 Total Vol24h: ${fmtNum(vol24)}
💪 BTC Dominance: ${btcDom?.toFixed(2) ?? 'N/A'}%
💪 ETH Dominance: ${ethDom?.toFixed(2) ?? 'N/A'}%
💵 ETF Flows
  - BTC: ${flows.btc}
  - ETH: ${flows.eth}
🕒 Now: ${formatUTCTime(utc7Now())}
📈 MarketClock (UTC+07):
${marketClockUTC7()}`;
}

// ----- COMMANDS -----
bot.start(async (ctx) => {
  activeUsers.add(ctx.chat.id);
  ctx.reply('Welcome! Use /btc, /eth, /link. Hourly updates include Market + ETF + Clock.');

  const [btc, eth, link, market, flows] = await Promise.all([
    fetchCoin('BTC'),
    fetchCoin('ETH'),
    fetchCoin('LINK'),
    fetchMarket(),
    fetchETFFlows()
  ]);

  const msg =
    fmtCoin(btc) + '\n\n' +
    fmtCoin(eth) + '\n\n' +
    fmtCoin(link) + '\n\n' +
    fmtOverview(market, flows);

  ctx.reply(msg);
});

['btc','eth','link'].forEach(sym => {
  bot.command(sym, async (ctx) => {
    const [coin, market, flows] = await Promise.all([
      fetchCoin(sym),
      fetchMarket(),
      fetchETFFlows()
    ]);
    ctx.reply(fmtCoin(coin) + '\n\n' + fmtOverview(market, flows));
  });
});

// ----- HOURLY BROADCAST -----
setInterval(async () => {
  if (!activeUsers.size) return;
  const [btc, eth, link, market, flows] = await Promise.all([
    fetchCoin('BTC'),
    fetchCoin('ETH'),
    fetchCoin('LINK'),
    fetchMarket(),
    fetchETFFlows()
  ]);
  const msg =
    fmtCoin(btc) + '\n\n' +
    fmtCoin(eth) + '\n\n' +
    fmtCoin(link) + '\n\n' +
    fmtOverview(market, flows);

  activeUsers.forEach(id => bot.telegram.sendMessage(id, msg));
}, 1000 * 60 * 60);

// ----- WEBHOOK -----
app.use(bot.webhookCallback('/'));
app.get('/', (req, res) => res.send('Bot is alive'));
app.listen(PORT, async () => {
  console.log(`Server listening on port ${PORT}`);
  await bot.telegram.setWebhook(`${WEBHOOK_URL}/`);
  console.log('Webhook set to', `${WEBHOOK_URL}/`);
});
