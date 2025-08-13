// bot.js - Complete A to Z Version

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
const PORT = 3000;
const APP_TZ = 'Asia/Phnom_Penh';
const BYBIT_BASE = 'https://api.bybit.com';
const CATEGORY = 'spot';

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const app = express();

// ====== HELP TEXT ======
const helpText = `Commands:\n/eth5m /eth15m /eth1h /eth4h /eth12h /eth24h\n/link5m /link15m /link1h /link4h /link12h /link24h\n/btc5m /btc15m /btc1h /btc4h /btc12h /btc24h`;

// ====== SYMBOL & TIMEFRAMES ======
const COINS = { eth:'ETHUSDT', link:'LINKUSDT', btc:'BTCUSDT' };
const TIMEFRAMES = { '5m':'5','15m':'15','30m':'30','1h':'60','2h':'120','4h':'240','6h':'360','12h':'720','24h':'D' };

// ====== UTILS ======
const fmt = (n,d=2)=> n==null||isNaN(n)?'-':Number(n).toLocaleString(undefined,{maximumFractionDigits:d});
const fmtFixed = (n,d=2)=> n==null||isNaN(n)?'-':Number(n).toFixed(d);

function parseCommand(text){
  const m=text.toLowerCase().match(/^\/(eth|link|btc)(\d+)(m|h|d)$/);
  if(!m) return null;
  const coin=m[1]; const num=m[2]; const suf=m[3];
  const tfKey=`${num}${suf}`;
  const interval=TIMEFRAMES[tfKey];
  if(!interval) return null;
  return { symbol:COINS[coin], coin:coin.toUpperCase(), tfLabel:tfKey, interval };
}

// ====== EXPRESS ROUTES ======
app.get('/', (req,res)=>res.send('Bybit Telegram Bot Running'));
app.get('/health', (req,res)=>res.send('OK'));
app.listen(PORT, ()=>console.log(`Server running on port ${PORT}`));

// ====== INDICATORS ======
function ema(values,period){const k=2/(period+1);let out=[];let prev;for(let i=0;i<values.length;i++){const v=values[i];prev=i===0?v:v*k+prev*(1-k);out.push(prev);}return out;}
function sma(values,period){let out=[];let sum=0;for(let i=0;i<values.length;i++){sum+=values[i];if(i>=period)sum-=values[i-period];out.push(i>=period-1?sum/period:null);}return out;}
function stdev(values,period){let out=[];let win=[];let sum=0;for(let i=0;i<values.length;i++){const v=values[i];win.push(v);sum+=v;if(win.length>period)sum-=win.shift();if(win.length===period){const mean=sum/period;const variance=win.reduce((a,b)=>a+Math.pow(b-mean,2),0)/period;out.push(Math.sqrt(variance));}else out.push(null);}return out;}
function rsi(values,period=14){let out=[];let gains=0,losses=0;for(let i=1;i<values.length;i++){const change=values[i]-values[i-1];const gain=Math.max(change,0);const loss=Math.max(-change,0);if(i<=period){gains+=gain;losses+=loss;out.push(null);}else{gains=(gains*(period-1)+gain)/period;losses=(losses*(period-1)+loss)/period;const rs=losses===0?100:gains/(losses||1e-10);out.push(100-100/(1+rs));}}out.unshift(null);return out;}
function macd(values,fast=12,slow=26,signal=9){const emaFast=ema(values,fast);const emaSlow=ema(values,slow);const macdLine=values.map((_,i)=>emaFast[i]-emaSlow[i]);const signalLine=ema(macdLine,signal);const hist=macdLine.map((v,i)=>v-signalLine[i]);return{macdLine,signalLine,hist};}
function obv(closes,volumes){let total=0;let out=[0];for(let i=1;i<closes.length;i++){total+=closes[i]>closes[i-1]?volumes[i]:closes[i]<closes[i-1]?-volumes[i]:0;out.push(total);}return out;}
function bollinger(values,period=20,mult=2){const basis=sma(values,period);const sd=stdev(values,period);const upper=values.map((_,i)=>basis[i]!==null&&sd[i]!==null?basis[i]+mult*sd[i]:null);const lower=values.map((_,i)=>basis[i]!==null&&sd[i]!==null?basis[i]-mult*sd[i]:null);return{basis,upper,lower};}
function volumeProfile(klines,bins=24){const lows=klines.map(k=>k.low);const highs=klines.map(k=>k.high);const minP=Math.min(...lows);const maxP=Math.max(...highs);const step=(maxP-minP)/bins||1;const dist=new Array(bins).fill(0);const levels=new Array(bins).fill(0).map((_,i)=>minP+step*(i+0.5));for(const k of klines){const price=(k.high+k.low+k.close)/3;const idx=Math.max(0,Math.min(bins-1,Math.floor((price-minP)/step)));dist[idx]+=k.volume;}const pairs=levels.map((lvl,i)=>({price:lvl,vol:dist[i]})).sort((a,b)=>b.vol-a.vol);return{poc:pairs[0]||{price:null,vol:null},top:pairs.slice(0,3).sort((a,b)=>a.price-b.price)}}
function trendSignal(latest){let score=0;if(latest.ema9>latest.ema21)score++;if(latest.macdHist>0)score++;if(latest.rsi>55)score++;else if(latest.rsi<45)score--;return score>=2?{text:'🟢 Bullish',color:'green'}:score<=-1?{text:'🔴 Bearish',color:'red'}:{text:'🟡 Neutral',color:'yellow'};}

// ====== FETCH DATA & BUILD REPORT ======
async function fetchKlines(symbol,interval,limit=210){
  const url=`${BYBIT_BASE}/v5/market/kline?category=${CATEGORY}&symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const {data}=await axios.get(url);
  if(data.retCode!==0)throw new Error(data.retMsg);
  return data.result.list.map(r=>({start:Number(r[0]),open:Number(r[1]),high:Number(r[2]),low:Number(r[3]),close:Number(r[4]),volume:Number(r[5]),turnover:Number(r[6])})).sort((a,b)=>a.start-b.start);
}

async function fetchTicker(symbol){
  const url=`${BYBIT_BASE}/v5/market/tickers?category=${CATEGORY}&symbol=${symbol}`;
  const {data}=await axios.get(url);
  if(data.retCode!==0)throw new Error(data.retMsg);
  const t=(data.result.list&&data.result.list[0])||{};
  return { lastPrice:Number(t.lastPrice), high24h:Number(t.highPrice24h), low24h:Number(t.lowPrice24h), priceChange:Number(t.priceChange24h), priceChangePct:Number(t.priceChangeRate24h)*100, volume:Number(t.volume24h), quoteVolume:Number(t.turnover24h), openPrice:Number(t.prevPrice24h) };
}

async function buildReport(symbol,coin,tfLabel,interval){
  const [kl,tk]=await Promise.all([fetchKlines(symbol,interval,210),fetchTicker(symbol)]);
  const closes=kl.map(k=>k.close); const volumes=kl.map(k=>k.volume);
  const ema9=ema(closes,9); const ema21=ema(closes,21); const rsiArr=rsi(closes,14);
  const macdObj=macd(closes,12,26,9); const bb=bollinger(closes,20,2); const obvArr=obv(closes,volumes);
  const vp=volumeProfile(kl,24);
  const i=closes.length-1;
  const latest={price:closes[i],ema9:ema9[i],ema21:ema21[i],rsi:rsiArr[i],macd:macdObj.macdLine[i],macdSignal:macdObj.signalLine[i],macdHist:macdObj.hist[i],bbUpper:bb.upper[i],bbBasis:bb.basis[i],bbLower:bb.lower[i],obv:obvArr[i],closeTime:kl[i].start};
  const trend=trendSignal(latest);
  const closeDT=dayjs(latest.closeTime).tz(APP_TZ).format('DD/MM/YYYY, HH:mm:ss');
  const changeAbs=tk.priceChange; const changePct=tk.priceChangePct;

  const lines=[
    `(${coin} ${tfLabel.toUpperCase()})`,
    `💰 Price: $${fmtFixed(latest.price,4)}`,
    `📈 24h High: $${fmtFixed(tk.high24h,4)}`,
    `📉 24h Low: $${fmtFixed(tk.low24h,4)}`,
    `🔁 Change: $${fmtFixed(changeAbs,4)} (${fmtFixed(changePct,3)}%)`,
    `🧮 Volume: ${fmt(tk.volume,2)}`,
    `💵 Quote Volume: $${fmt(tk.quoteVolume,2)}`,
    `🔓 Open Price: $${fmtFixed(tk.openPrice,4)}`,
    `⏰ Close Time: ${closeDT}`,
    ``,
    `📊 On-Balance Volume (OBV): ${fmt(latest.obv,0)}`,
    `
Momentum Strength (MACD):`,
    `📉 MACD: ${fmtFixed(latest.macd,4)}`,
    `Signal: ${fmtFixed(latest.macdSignal,4)}`,
    `Hist: ${fmtFixed(latest.macdHist,4)}`,
    `
📊 Volume Profile:`,
    `POC: $${fmtFixed(vp.poc.price,2)}`,
    `Top:`,
    vp.top.map((t,i)=>`(${i+1}) $${fmtFixed(t.price,2)}`).join('\n'),
    `
📈 EMA:`,
    `Asset Price: $${fmtFixed(latest.price,4)}`,
    `(9): ${fmtFixed(latest.ema9,4)}`,
    `(21): ${fmtFixed(latest.ema21,4)}`,
    `
⚡️ RSI(14): ${fmtFixed(latest.rsi,2)}`,
    `
🎯 Bollinger(20,2):`,
    `Upper : ${fmtFixed(latest.bbUpper,4)}`,
    `Middle : ${fmtFixed(latest.bbBasis,4)}`,
    `Lower : ${fmtFixed(latest.bbLower,4)}`,
    `
Overall: ${trend.text}`,
    `Time for: ${trend.color==='green'?'Enter 🟢':trend.color==='red'?'Exit 🔴':'Wait ⚡️🟡'}`
  ];
  return lines;
}

// ====== BOT LISTENER ======
// Already defined above
