const { Telegraf } = require('telegraf');
const axios = require('axios');
const ti = require('technicalindicators');
const moment = require('moment-timezone');

const TELEGRAM_TOKEN = '7655482876:AAG8yrDYcuU_WRL-HxePppwNglmvgJeCfhM';
const APP_TZ = 'Asia/Phnom_Penh';
const BYBIT_BASE = 'https://api.bybit.com';

const bot = new Telegraf(TELEGRAM_TOKEN);

// Map user commands to Bybit symbols and intervals
const SYMBOLS = {
  eth: 'ETHUSDT',
  btc: 'BTCUSDT',
  link: 'LINKUSDT'
};

// Map user commands to Bybit intervals
const INTERVALS = {
  '5m': '5',
  '15m': '15',
  '1h': '60',
  '4h': '240',
  '12h': '720',
  '1d': 'D'
};

// Helper: Fetch OHLCV candles
async function getCandles(symbol, interval) {
  try {
    const response = await axios.get(`${BYBIT_BASE}/spot/quote/v1/kline`, {
      params: {
        symbol: symbol,
        interval: interval,
        limit: 100
      }
    });
    return response.data.result || [];
  } catch (err) {
    console.error(err);
    return [];
  }
}

// Helper: Fetch 24h ticker info
async function getTicker(symbol) {
  try {
    const response = await axios.get(`${BYBIT_BASE}/spot/quote/v1/ticker/24hr`, {
      params: { symbol }
    });
    return response.data.result[0] || {};
  } catch (err) {
    console.error(err);
    return {};
  }
}

// Calculate EMA
function calculateEMA(values, period) {
  return ti.EMA.calculate({ period, values });
}

// Calculate MACD
function calculateMACD(values) {
  return ti.MACD.calculate({
    values,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false
  });
}

// Calculate RSI
function calculateRSI(values) {
  return ti.RSI.calculate({ period: 14, values });
}

// Calculate Bollinger Bands
function calculateBollinger(values) {
  return ti.BollingerBands.calculate({ period: 20, stdDev: 2, values });
}

// Calculate OBV
function calculateOBV(closes, volumes) {
  return ti.OBV.calculate({ close: closes, volume: volumes });
}

// Build response message
async function buildMessage(symbolKey, timeframeKey) {
  const symbol = SYMBOLS[symbolKey.toLowerCase()];
  const interval = INTERVALS[timeframeKey.toLowerCase()];

  if (!symbol || !interval) return 'Invalid command or timeframe!';

  const candles = await getCandles(symbol, interval);
  if (!candles.length) return 'No candle data found!';

  const ticker = await getTicker(symbol);
  const closes = candles.map(c => parseFloat(c.close));
  const volumes = candles.map(c => parseFloat(c.volume));

  const ema9 = calculateEMA(closes, 9).slice(-1)[0];
  const ema21 = calculateEMA(closes, 21).slice(-1)[0];
  const macd = calculateMACD(closes).slice(-1)[0];
  const rsi = calculateRSI(closes).slice(-1)[0];
  const bb = calculateBollinger(closes).slice(-1)[0];
  const obv = calculateOBV(closes, volumes).slice(-1)[0];

  // Trend logic (simplified)
  let trend = 'Neutral ⚪️';
  if (ema9 > ema21 && rsi > 50) trend = 'Bullish 🟢';
  else if (ema9 < ema21 && rsi < 50) trend = 'Bearish 🔴';

  return `
*${symbol} | Timeframe: ${timeframeKey.toUpperCase()}*

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
Time for: ${trend.includes('Bullish') ? 'Enter 🟢' : trend.includes('Bearish') ? 'Exit 🔴' : 'Wait 🟡'}
  `;
}

// Register commands dynamically
bot.command(['eth5m','eth15m','eth1h','btc5m','btc15m','btc1h','link5m','link15m','link1h'], async (ctx) => {
  const [cmd] = ctx.message.text.slice(1).split(/(\d+[mhd])/); // split symbol and timeframe
  const symbolKey = cmd.match(/[a-zA-Z]+/)[0];
  const timeframeKey = cmd.match(/\d+[mhd]/)[0];
  const message = await buildMessage(symbolKey, timeframeKey);
  ctx.replyWithMarkdown(message);
});

bot.launch().then(() => console.log('Bot started on port 3000'));
