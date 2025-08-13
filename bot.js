const { Telegraf } = require('telegraf');
const axios = require('axios');
const ti = require('technicalindicators');
const moment = require('moment-timezone');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || '7655482876:AAH1-wgF3Tku7Ce6E5C0VZ0kHu_3BpHqz_I';
const APP_TZ = 'Asia/Phnom_Penh';
const BYBIT_BASE = 'https://api.bybit.com';

const bot = new Telegraf(TELEGRAM_TOKEN);

// Assets and intervals
const SYMBOLS = { eth: 'ETHUSDT', btc: 'BTCUSDT', link: 'LINKUSDT' };
const INTERVALS = { '5m': '5', '15m': '15', '1h': '60', '4h': '240', '12h': '720', '24h': 'D' };

// Fetch candles from Bybit
async function getCandles(symbol, interval) {
  try {
    const res = await axios.get(`${BYBIT_BASE}/spot/quote/v1/kline`, {
      params: { symbol, interval, limit: 100 }
    });
    if (!res.data.result || !res.data.result.length) return [];
    return res.data.result.map(c => ({
      open: parseFloat(c.open),
      high: parseFloat(c.high),
      low: parseFloat(c.low),
      close: parseFloat(c.close),
      volume: parseFloat(c.volume)
    }));
  } catch (err) {
    console.error('Error fetching candles:', err.message);
    return [];
  }
}

// Fetch 24h ticker
async function getTicker(symbol) {
  try {
    const res = await axios.get(`${BYBIT_BASE}/spot/quote/v1/ticker/24hr`, {
      params: { symbol }
    });
    return res.data.result && res.data.result[0] ? res.data.result[0] : {};
  } catch (err) {
    console.error('Error fetching ticker:', err.message);
    return {};
  }
}

// Indicators
function calcEMA(values, period) { return ti.EMA.calculate({ period, values }); }
function calcMACD(values) { return ti.MACD.calculate({ values, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false }); }
function calcRSI(values) { return ti.RSI.calculate({ period: 14, values }); }
function calcBB(values) { return ti.BollingerBands.calculate({ period: 20, stdDev: 2, values }); }
function calcOBV(closes, volumes) { return ti.OBV.calculate({ close: closes, volume: volumes }); }

// Build message
async function buildMessage(symbolKey, timeframeKey) {
  const symbol = SYMBOLS[symbolKey];
  const interval = INTERVALS[timeframeKey];
  if (!symbol || !interval) return 'Invalid symbol or timeframe!';

  const candles = await getCandles(symbol, interval);
  if (!candles.length) return 'No candle data found!';

  const ticker = await getTicker(symbol);
  const closes = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume);

  const ema9 = calcEMA(closes, 9).slice(-1)[0];
  const ema21 = calcEMA(closes, 21).slice(-1)[0];
  const macd = calcMACD(closes).slice(-1)[0];
  const rsi = calcRSI(closes).slice(-1)[0];
  const bb = calcBB(closes).slice(-1)[0];
  const obv = calcOBV(closes, volumes).slice(-1)[0];

  let trend = 'Neutral ⚪️';
  let action = 'Wait 🟡';
  if (ema9 > ema21 && rsi > 50) { trend = 'Bullish 🟢'; action = 'Enter 🟢'; }
  else if (ema9 < ema21 && rsi < 50) { trend = 'Bearish 🔴'; action = 'Exit 🔴'; }

  return `
*${symbol.toUpperCase()} | Timeframe: ${timeframeKey.toUpperCase()}*

💰 Price: ${ticker.lastPrice || 'N/A'}
📈 24h High: ${ticker.highPrice || 'N/A'}
📉 24h Low: ${ticker.lowPrice || 'N/A'}
🔁 Change: ${ticker.priceChangePercent || 'N/A'}%
🧮 Volume: ${ticker.volume || 'N/A'}
💵 Quote Volume: ${ticker.quoteVolume || 'N/A'}
🔓 Open Price: ${ticker.openPrice || 'N/A'}
⏰ Close Time: ${moment().tz(APP_TZ).format('YYYY-MM-DD HH:mm:ss')}

📊 On-Balance Volume (OBV):
OBV: ${obv || 'N/A'}

Momentum Strength (MACD):
📉 MACD: ${macd ? macd.MACD.toFixed(4) : 'N/A'}
Signal: ${macd ? macd.signal.toFixed(4) : 'N/A'}
Hist: ${macd ? macd.histogram.toFixed(4) : 'N/A'}

📈 EMA:
Asset Price: ${closes.slice(-1)[0].toFixed(4)}
(9): ${ema9.toFixed(4)}
(21): ${ema21.toFixed(4)}

⚡️ RSI(14): ${rsi ? rsi.toFixed(2) : 'N/A'}

🎯 Bollinger(20,2):
Upper: ${bb ? bb.upper.toFixed(4) : 'N/A'}
Middle: ${bb ? bb.middle.toFixed(4) : 'N/A'}
Lower: ${bb ? bb.lower.toFixed(4) : 'N/A'}

Overall Trend: ${trend}
Time for: ${action}
  `;
}

// Handle commands
bot.on('text', async (ctx) => {
  const input = ctx.message.text.slice(1).toLowerCase();
  const match = input.match(/^([a-z]+)(\d+[mhd])$/);
  if (!match) return ctx.reply('Invalid command! Example: /eth1h, /link15m');

  const symbolKey = match[1];
  const timeframeKey = match[2];

  try {
    const message = await buildMessage(symbolKey, timeframeKey);
    ctx.replyWithMarkdown(message);
  } catch (err) {
    console.error('Error:', err.message);
    ctx.reply('Error fetching data. Please try again later.');
  }
});

// Start bot on Render port or default 3000
const PORT = process.env.PORT || 3000;
bot.launch().then(() => console.log(`Bot started ✅ on port ${PORT}`));
