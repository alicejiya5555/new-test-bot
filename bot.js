// bot.js
// Bybit Spot data + Indicators (MACD, RSI, Bollinger Bands, EMA 9/21, OBV, simple Volume Profile)
// Commands: /eth15m, /link1h, /btc4h, etc. Supports 5m–12h and 24h
// Runs a health server on port 3000.

const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const express = require('express');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const tz = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(tz);

// ====== CONFIG ======
const TELEGRAM_TOKEN = '7655482876:AAG8yrDYcuU_WRL-HxePppwNglmvgJeCfhM';
const BYBIT_BASE = 'https://api.bybit.com';
const CATEGORY = 'spot';
const APP_TZ = 'Asia/Phnom_Penh';
const PORT = 3000;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// ====== SYMBOL MAPS ======
const COIN_MAP = {
  eth: 'ETHUSDT',
  link: 'LINKUSDT',
  btc: 'BTCUSDT',
};

// Bybit v5 intervals: 1 3 5 15 30 60 120 240 360 720 D
const TF_MAP = {
  '5m': '5',
  '15m': '15',
  '30m': '30',
  '1h': '60',
  '2h': '120',
  '4h': '240',
  '6h': '360',
  '12h': '720',
  '24h': 'D',
};

const SUPPORTED_SUFFIX = ['m','h','d']; // minutes, hours, day

// ====== HELP ======
const helpText = `
Welcome, commander. I speak Bybit.

Use commands like:
  /eth5m, /eth15m, /eth1h, /eth4h, /eth12h, /eth24h
  /link5m, /link15m, /link1h, /link4h, /link12h, /link24h
  /btc5m, /btc15m, /btc1h, /btc4h, /btc12h, /btc24h

I will return: Price, 24h High/Low, Change, Volume, Quote Volume, Open Price, Close Time
+ Indicators: MACD(12,26,9), OBV, EMA(9/21), RSI(14), Bollinger(20,2), Volume Profile (POC & top nodes)
+ Overall Trend light: 🟢 Bullish / 🟡 Neutral / 🔴 Bearish
`;

// ====== UTIL ======
const fmt = (n, d=2) => {
  if (n === null || n === undefined || isNaN(n)) return '-';
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: 0 });
};
const fmtFixed = (n, d=2) => (n===null||n===undefined||isNaN(n)) ? '-' : Number(n).toFixed(d);

function parseCommand(text) {
  // pattern: /(eth|link|btc)(number)(m|h|d)
  const m = text.trim().toLowerCase().match(/^\/(eth|link|btc)(\d+)(m|h|d)$/);
  if (!m) return null;
  const coin = m[1];
  const num = m[2];
  const suf = m[3];
  if (!SUPPORTED_SUFFIX.includes(suf)) return null;

  let tfKey = `${num}${suf}`;
  if (suf === 'd' && num !== '24') return null; // only allow 24h as per requirement
  if (suf === 'h' && !['1','2','4','6','12'].includes(num)) return null;
  if (suf === 'm' && !['5','15','30'].includes(num)) return null;

  const interval = TF_MAP[tfKey];
  if (!interval) return null;
  return { symbol: COIN_MAP[coin], coin: coin.toUpperCase(), tfLabel: tfKey, interval };
}

async function bybitKlines(symbol, interval, limit=200) {
  const url = `${BYBIT_BASE}/v5/market/kline?category=${CATEGORY}&symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const { data } = await axios.get(url);
  if (data.retCode !== 0) throw new Error(`Bybit kline error: ${data.retMsg}`);
  // data.result.list is array of arrays: [start, open, high, low, close, volume, turnover]
  // They are strings; convert.
  const rows = (data.result.list || []).map(r => ({
    start: Number(r[0]),
    open: Number(r[1]),
    high: Number(r[2]),
    low: Number(r[3]),
    close: Number(r[4]),
    volume: Number(r[5]), // base volume
    turnover: Number(r[6]) // quote volume (USDT)
  })).sort((a,b)=>a.start-b.start); // ascending by time
  return rows;
}

async function bybitTicker24h(symbol){
  const url = `${BYBIT_BASE}/v5/market/tickers?category=${CATEGORY}&symbol=${symbol}`;
  const { data } = await axios.get(url);
  if (data.retCode !== 0) throw new Error(`Bybit ticker error: ${data.retMsg}`);
  const t = (data.result.list && data.result.list[0]) || null;
  if (!t) throw new Error('No ticker returned');
  // fields are strings
  return {
    lastPrice: Number(t.lastPrice),
    high24h: Number(t.highPrice24h),
    low24h: Number(t.lowPrice24h),
    priceChange: Number(t.priceChange24h),
    priceChangePct: Number(t.priceChangeRate24h)*100,
    volume: Number(t.volume24h), // base volume (coins)
    quoteVolume: Number(t.turnover24h), // USDT
    openPrice: Number(t.prevPrice24h),
  };
}

// ====== INDICATORS ======
function ema(values, period) {
  const k = 2 / (period + 1);
  const emaArr = [];
  let prev;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (i === 0) {
      prev = v;
    } else {
      prev = v * k + prev * (1 - k);
    }
    emaArr.push(prev);
  }
  return emaArr;
}

function sma(values, period) {
  const out = [];
  let sum = 0;
  for (let i=0;i<values.length;i++){
    sum += values[i];
    if (i>=period) sum -= values[i-period];
    if (i>=period-1) out.push(sum/period); else out.push(null);
  }
  return out;
}

function stdev(values, period) {
  const out = [];
  const win = [];
  let sum=0;
  for (let i=0;i<values.length;i++){
    const v=values[i];
    win.push(v); sum+=v;
    if (win.length>period){ sum-=win.shift(); }
    if (win.length===period){
      const mean = sum/period;
      const variance = win.reduce((a,b)=>a+Math.pow(b-mean,2),0)/period;
      out.push(Math.sqrt(variance));
    } else {
      out.push(null);
    }
  }
  return out;
}

function rsi(values, period=14){
  const out = [];
  let gains=0, losses=0;
  for (let i=1;i<values.length;i++){
    const change = values[i]-values[i-1];
    const gain = Math.max(change,0);
    const loss = Math.max(-change,0);
    if (i<=period){
      gains += gain; losses += loss;
      out.push(null);
    } else {
      gains = (gains*(period-1)+gain)/period;
      losses = (losses*(period-1)+loss)/period;
      const rs = losses===0 ? 100 : gains/(losses||1e-10);
      const val = 100 - 100/(1+rs);
      out.push(val);
    }
  }
  // align lengths
  out.unshift(null);
  return out;
}

function macd(values, fast=12, slow=26, signal=9){
  const emaFast = ema(values, fast);
  const emaSlow = ema(values, slow);
  const macdLine = values.map((_,i)=> emaFast[i]-emaSlow[i]);
  const signalLine = ema(macdLine, signal);
  const hist = macdLine.map((v,i)=> v - signalLine[i]);
  return { macdLine, signalLine, hist };
}

function obv(closes, volumes){
  let total=0; const out=[0];
  for (let i=1;i<closes.length;i++){
    if (closes[i]>closes[i-1]) total += volumes[i];
    else if (closes[i]<closes[i-1]) total -= volumes[i];
    out.push(total);
  }
  return out;
}

function bollinger(values, period=20, mult=2){
  const basis = sma(values, period);
  const sd = stdev(values, period);
  const upper = values.map((_,i)=> basis[i]!==null && sd[i]!==null ? basis[i] + mult*sd[i] : null);
  const lower = values.map((_,i)=> basis[i]!==null && sd[i]!==null ? basis[i] - mult*sd[i] : null);
  return { basis, upper, lower };
}

function buildVolumeProfile(klines, bins=24){
  // crude profile: distribute bar volume to (high+low+close)/3 bucket
  const lows = klines.map(k=>k.low);
  const highs= klines.map(k=>k.high);
  const minP = Math.min(...lows);
  const maxP = Math.max(...highs);
  const step = (maxP - minP) / bins || 1;
  const dist = new Array(bins).fill(0);
  const levels = new Array(bins).fill(0).map((_,i)=> minP + step*(i+0.5));
  for (const k of klines){
    const price = (k.high + k.low + k.close)/3;
    const idx = Math.max(0, Math.min(bins-1, Math.floor((price - minP)/step)));
    dist[idx] += k.volume;
  }
  const pairs = levels.map((lvl,i)=>({ price:lvl, vol: dist[i]})).sort((a,b)=> b.vol - a.vol);
  const top = pairs.slice(0,3).sort((a,b)=> a.price-b.price);
  const poc = pairs[0] || {price:null,vol:null};
  return { poc, top };
}

function trendSignal(latest){
  // latest: { ema9, ema21, macdHist, rsi }
  let score = 0;
  if (latest.ema9>latest.ema21) score++;
  if (latest.macdHist>0) score++;
  if (latest.rsi>55) score++; else if (latest.rsi<45) score--;
  if (score>=2) return { text:'🟢 Bullish', color:'green' };
  if (score<=-1) return { text:'🔴 Bearish', color:'red' };
  return { text:'🟡 Neutral', color:'yellow' };
}

async function buildReport(symbol, coin, tfLabel, interval){
  const [kl, tk] = await Promise.all([
    bybitKlines(symbol, interval, 210), // extra for indicators
    bybitTicker24h(symbol)
  ]);
  if (kl.length<50) throw new Error('Not enough kline data');

  const closes = kl.map(k=>k.close);
  const volumes = kl.map(k=>k.volume);

  const ema9 = ema(closes,9);
  const ema21 = ema(closes,21);
  const rsiArr = rsi(closes,14);
  const macdObj = macd(closes,12,26,9);
  const bb = bollinger(closes,20,2);
  const obvArr = obv(closes,volumes);
  const vp = buildVolumeProfile(kl, 24);

  const i = closes.length-1;
  const latest = {
    price: closes[i],
    ema9: ema9[i],
    ema21: ema21[i],
    rsi: rsiArr[i],
    macd: macdObj.macdLine[i],
    macdSignal: macdObj.signalLine[i],
    macdHist: macdObj.hist[i],
    bbUpper: bb.upper[i],
    bbBasis: bb.basis[i],
    bbLower: bb.lower[i],
    obv: obvArr[i],
    closeTime: kl[i].start,
  };

  const trend = trendSignal(latest);

  const closeDT = dayjs(latest.closeTime).tz(APP_TZ).format('DD/MM/YYYY, HH:mm:ss');
  const changeAbs = tk.priceChange;
  const changePct = tk.priceChangePct;

  const vpLine = vp.poc.price ? `POC: $${fmtFixed(vp.poc.price,2)} | Top: ${vp.top.map(t=>`$${fmtFixed(t.price,2)}`).join(', ')}` : '-';

  const header = `(${coin} ${tfLabel.toUpperCase()})`;
  const lines = [
    `${header}`,
    `💰 Price: $${fmtFixed(latest.price, 4)}`,
    `📈 24h High: $${fmtFixed(tk.high24h, 4)}`,
    `📉 24h Low: $${fmtFixed(tk.low24h, 4)}`,
    `🔁 Change: $${fmtFixed(changeAbs, 4)} (${fmtFixed(changePct, 3)}%)`,
    `🧮 Volume: ${fmt(tk.volume, 2)}`,
    `💵 Quote Volume: $${fmt(tk.quoteVolume, 2)}`,
    `🔓 Open Price: $${fmtFixed(tk.openPrice, 4)}`,
    `⏰ Close Time: ${closeDT}`,
    ``,
    `MACD (12,26,9): ${fmtFixed(latest.macd, 4)} | Signal: ${fmtFixed(latest.macdSignal,4)} | Hist: ${fmtFixed(latest.macdHist,4)}`,
    `OBV: ${fmt(latest.obv, 0)}`,
    `Volume Profile: ${vpLine}`,
    `EMA 9/21: ${fmtFixed(latest.ema9, 4)} / ${fmtFixed(latest.ema21, 4)}`,
    `RSI(14): ${fmtFixed(latest.rsi, 2)}`,
    `Bollinger(20,2): U ${fmtFixed(latest.bbUpper, 4)} | M ${fmtFixed(latest.bbBasis,4)} | L ${fmtFixed(latest.bbLower,4)}`,
    `Overall: ${trend.text}`,
  ];

  return lines.join('\n');
}

// ====== TELEGRAM HANDLERS ======
bot.onText(/^\/(start|help)$/i, (msg) => {
  bot.sendMessage(msg.chat.id, helpText);
});

bot.on('message', async (msg) => {
  try {
    if (!msg.text) return;
    if (/^\/(start|help)$/i.test(msg.text)) return;
    const parsed = parseCommand(msg.text);
    if (!parsed) {
      return bot.sendMessage(msg.chat.id, `Command not recognized. Try e.g. /link15m or /eth1h\n\n${helpText}`);
    }
    const { symbol, coin, tfLabel, interval } = parsed;
    bot.sendChatAction(msg.chat.id, 'typing');
    const report = await buildReport(symbol, coin, tfLabel, interval);
    await bot.sendMessage(msg.chat.id, report, { disable_web_page_preview: true });
  } catch (err) {
    console.error(err);
    bot.sendMessage(msg.chat.id, `Error: ${err.message}`);
  }
});

// ====== HEALTH SERVER ======
const app = express();
app.get('/', (req,res)=> res.send('Bybit Telegram Bot is running.'));
app.get('/health', (req,res)=> res.json({ ok:true, time: new Date().toISOString() }));
app.listen(PORT, ()=> console.log(`Health server on http://localhost:${PORT}`));
