const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const tz = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(tz);

const TELEGRAM_TOKEN = '7655482876:AAG8yrDYcuU_WRL-HxePppwNglmvgJeCfhM';
const APP_TZ = 'Asia/Phnom_Penh';
const BYBIT_BASE = 'https://api.bybit.com';
const CATEGORY = 'spot';

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// Coins & timeframes
const COINS = { eth: 'ETHUSDT', link: 'LINKUSDT', btc: 'BTCUSDT' };
const TIMEFRAMES = { '5m':'5','15m':'15','1h':'60','4h':'240','12h':'720','24h':'D' };

// Utilities
const fmt = (n,d=2)=> n==null||isNaN(n)?'-':Number(n).toLocaleString(undefined,{maximumFractionDigits:d});
const fmtFixed = (n,d=2)=> n==null||isNaN(n)?'-':Number(n).toFixed(d);

// Parse command
function parseCommand(text){
    const m=text.toLowerCase().match(/^\/(eth|link|btc)(\d+)(m|h|d)$/);
    if(!m) return null;
    const coin=m[1], num=m[2], suf=m[3];
    const tfKey=`${num}${suf}`;
    const interval=TIMEFRAMES[tfKey];
    if(!interval) return null;
    return { symbol: COINS[coin], coin: coin.toUpperCase(), tfLabel: tfKey, interval };
}

// ===================== Indicators =====================
function ema(values, period){
    const k = 2/(period+1);
    let out=[], prev;
    for(let i=0;i<values.length;i++){
        const v=values[i];
        prev=i===0?v:v*k + prev*(1-k);
        out.push(prev);
    }
    return out;
}

function sma(values, period){
    let out=[], sum=0;
    for(let i=0;i<values.length;i++){
        sum+=values[i];
        if(i>=period) sum-=values[i-period];
        out.push(i>=period-1 ? sum/period : null);
    }
    return out;
}

function stdev(values, period){
    let out=[], win=[], sum=0;
    for(let i=0;i<values.length;i++){
        win.push(values[i]);
        sum+=values[i];
        if(win.length>period) sum-=win.shift();
        if(win.length===period){
            const mean=sum/period;
            const variance=win.reduce((a,b)=>a+Math.pow(b-mean,2),0)/period;
            out.push(Math.sqrt(variance));
        } else out.push(null);
    }
    return out;
}

function rsi(values, period=14){
    let out=[], gains=0, losses=0;
    for(let i=1;i<values.length;i++){
        const change=values[i]-values[i-1];
        const gain=Math.max(change,0);
        const loss=Math.max(-change,0);
        if(i<=period){ gains+=gain; losses+=loss; out.push(null); }
        else{
            gains=(gains*(period-1)+gain)/period;
            losses=(losses*(period-1)+loss)/period;
            const rs=losses===0?100:gains/(losses||1e-10);
            out.push(100-100/(1+rs));
        }
    }
    out.unshift(null);
    return out;
}

function macd(values,fast=12,slow=26,signal=9){
    const emaFast=ema(values,fast);
    const emaSlow=ema(values,slow);
    const macdLine=values.map((_,i)=>emaFast[i]-emaSlow[i]);
    const signalLine=ema(macdLine,signal);
    const hist=macdLine.map((v,i)=>v-signalLine[i]);
    return {macdLine,signalLine,hist};
}

function obv(closes, volumes){
    let total=0, out=[0];
    for(let i=1;i<closes.length;i++){
        total+=closes[i]>closes[i-1]?volumes[i]:closes[i]<closes[i-1]?-volumes[i]:0;
        out.push(total);
    }
    return out;
}

function bollinger(values, period=20, mult=2){
    const basis = sma(values, period);
    const sd = stdev(values, period);
    const upper = values.map((_,i)=>basis[i]!==null && sd[i]!==null ? basis[i]+mult*sd[i]:null);
    const lower = values.map((_,i)=>basis[i]!==null && sd[i]!==null ? basis[i]-mult*sd[i]:null);
    return { basis, upper, lower };
}

// Trend signal
function trendSignal(latest){
    let score=0;
    if(latest.ema9>latest.ema21) score++;
    if(latest.macdHist>0) score++;
    if(latest.rsi>55) score++;
    else if(latest.rsi<45) score--;
    if(score>=2) return { text:'🟢 Bullish', color:'green' };
    if(score<=-1) return { text:'🔴 Bearish', color:'red' };
    return { text:'🟡 Neutral', color:'yellow' };
}

// ===================== Fetch Data =====================
async function fetchKlines(symbol, interval, limit=210){
    const url=`${BYBIT_BASE}/v5/market/kline?category=${CATEGORY}&symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const {data}=await axios.get(url);
    if(data.retCode!==0) throw new Error(data.retMsg);
    return data.result.list.map(r=>({
        start:Number(r[0]), open:Number(r[1]), high:Number(r[2]),
        low:Number(r[3]), close:Number(r[4]), volume:Number(r[5])
    }));
}

async function fetchTicker(symbol){
    const url=`${BYBIT_BASE}/v5/market/tickers?category=${CATEGORY}&symbol=${symbol}`;
    const {data}=await axios.get(url);
    if(data.retCode!==0) throw new Error(data.retMsg);
    const t = data.result.list[0];
    return {
        price:Number(t.lastPrice),
        high24:Number(t.highPrice24h),
        low24:Number(t.lowPrice24h),
        change:Number(t.priceChange24h),
        changePct:Number(t.priceChangeRate24h)*100,
        volume:Number(t.volume24h),
        quoteVolume:Number(t.turnover24h),
        open:Number(t.prevPrice24h)
    };
}

// ===================== Build Report =====================
async function buildReport(symbol, coin, tfLabel, interval){
    const [klines, ticker] = await Promise.all([fetchKlines(symbol, interval), fetchTicker(symbol)]);
    const closes = klines.map(k=>k.close);
    const volumes = klines.map(k=>k.volume);

    const ema9 = ema(closes,9), ema21 = ema(closes,21);
    const rsiArr = rsi(closes,14);
    const macdObj = macd(closes,12,26,9);
    const obvArr = obv(closes,volumes);
    const bb = bollinger(closes,20,2);

    const i = closes.length-1;
    const latest = {
        price: closes[i], ema9: ema9[i], ema21: ema21[i], rsi: rsiArr[i],
        macd: macdObj.macdLine[i], macdSignal: macdObj.signalLine[i], macdHist: macdObj.hist[i],
        obv: obvArr[i], bbUpper: bb.upper[i], bbBasis: bb.basis[i], bbLower: bb.lower[i],
        closeTime: klines[i].start
    };

    const trend = trendSignal(latest);
    const closeDT = dayjs(latest.closeTime).tz(APP_TZ).format('DD/MM/YYYY, HH:mm:ss');

    return `(${coin} ${tfLabel.toUpperCase()})
💰 Price: $${fmtFixed(latest.price)}
📈 24h High: $${fmtFixed(ticker.high24)}
📉 24h Low: $${fmtFixed(ticker.low24)}
🔁 Change: $${fmtFixed(ticker.change)} (${fmtFixed(ticker.changePct)}%)
🧮 Volume: ${fmt(ticker.volume)}
💵 Quote Volume: $${fmt(ticker.quoteVolume)}
🔓 Open Price: $${fmtFixed(ticker.open)}
⏰ Close Time: ${closeDT}

📊 On-Balance Volume (OBV):
OBV: ${fmt(latest.obv)}

Momentum Strength (MACD):
📉 MACD: ${fmtFixed(latest.macd)}
Signal: ${fmtFixed(latest.macdSignal)}
Hist: ${fmtFixed(latest.macdHist)}

📈 EMA:
Asset Price: $${fmtFixed(latest.price)}
(9): ${fmtFixed(latest.ema9)}
(21): ${fmtFixed(latest.ema21)}

⚡️ RSI(14): ${fmtFixed(latest.rsi)}

🎯 Bollinger(20,2):
Upper: ${fmtFixed(latest.bbUpper)}
Middle: ${fmtFixed(latest.bbBasis)}
Lower: ${fmtFixed(latest.bbLower)}

Overall: ${trend.text}
Time for: ${trend.color==='green'?'Enter 🟢':trend.color==='red'?'Exit 🔴':'Wait ⚡️🟡'}`;
}

// ===================== Telegram Listener =====================
bot.onText(/\/(.+)/, async (msg)=>{
    const chatId = msg.chat.id;
    const cmd = msg.text;

    if(cmd==='/start'||cmd==='/help'){
        bot.sendMessage(chatId, "Use commands like /eth5m, /link15m, /btc1h");
        return;
    }

    const parsed = parseCommand(cmd);
    if(!parsed){
        bot.sendMessage(chatId,"Invalid command. Type /help");
        return;
    }

    try{
        const report = await buildReport(parsed.symbol, parsed.coin, parsed.tfLabel, parsed.interval);
        bot.sendMessage(chatId, report);
    }catch(err){
        bot.sendMessage(chatId, `Error: ${err.message}`);
    }
});

console.log('Bot is running...');
