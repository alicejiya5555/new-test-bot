const { Telegraf } = require('telegraf');
const axios = require('axios');
const technical = require('technicalindicators');
const moment = require('moment-timezone');

const TELEGRAM_TOKEN = '7655482876:AAH1-wgF3Tku7Ce6E5C0VZ0kHu_3BpHqz_I';
const APP_TZ = 'Asia/Phnom_Penh';
const BYBIT_BASE = 'https://api.bybit.com';
const CATEGORY = 'spot';

const bot = new Telegraf(TELEGRAM_TOKEN);

// Supported commands
const supportedAssets = ['ETH', 'BTC', 'LINK'];
const supportedTimeframes = ['5m', '15m', '1h', '4h', '24h'];

// Helper: Convert Telegram command to Bybit interval
function parseCommand(cmd) {
    const match = cmd.match(/\/([a-zA-Z]+)(\d+[mh])/);
    if (!match) return null;
    const asset = match[1].toUpperCase();
    const tf = match[2];
    return { asset, tf };
}

// Fetch historical candles from Bybit
async function getCandles(symbol, interval) {
    try {
        const res = await axios.get(`${BYBIT_BASE}/v2/public/kline/list`, {
            params: {
                symbol: symbol + 'USDT',
                interval: interval,
                limit: 100
            }
        });
        return res.data.result;
    } catch (err) {
        console.error('Error fetching candles:', err.message);
        return [];
    }
}

// Calculate indicators
function calculateIndicators(candles) {
    const closes = candles.map(c => parseFloat(c.close));
    const highs = candles.map(c => parseFloat(c.high));
    const lows = candles.map(c => parseFloat(c.low));
    const volumes = candles.map(c => parseFloat(c.volume));

    // OBV
    const obv = technical.OBV.calculate({ close: closes, volume: volumes });
    const ema9 = technical.EMA.calculate({ period: 9, values: closes }).slice(-1)[0];
    const ema21 = technical.EMA.calculate({ period: 21, values: closes }).slice(-1)[0];
    const rsi = technical.RSI.calculate({ period: 14, values: closes }).slice(-1)[0];
    const bb = technical.BollingerBands.calculate({
        period: 20,
        values: closes,
        stdDev: 2
    }).slice(-1)[0];

    return {
        obv: obv.slice(-1)[0],
        ema9,
        ema21,
        rsi,
        bbUpper: bb.upper,
        bbMiddle: bb.middle,
        bbLower: bb.lower
    };
}

// Compute trend signal
function trendSignal(price, ema9, ema21) {
    if (price > ema9 && ema9 > ema21) return 'Bullish 🟢';
    if (price < ema9 && ema9 < ema21) return 'Bearish 🔴';
    return 'Sideways 🟡';
}

bot.start((ctx) => ctx.reply('Welcome! Use commands like /eth1h or /link15m'));

bot.on('text', async (ctx) => {
    const command = ctx.message.text.toLowerCase();
    const parsed = parseCommand(command);
    if (!parsed) return ctx.reply('Invalid command format! Example: /eth1h');

    const { asset, tf } = parsed;
    if (!supportedAssets.includes(asset)) return ctx.reply('Asset not supported.');
    if (!supportedTimeframes.includes(tf)) return ctx.reply('Timeframe not supported.');

    const candles = await getCandles(asset, tf);
    if (!candles || candles.length === 0) return ctx.reply('No candle data found!');

    const lastCandle = candles[candles.length - 1];
    const indicators = calculateIndicators(candles);

    const trend = trendSignal(parseFloat(lastCandle.close), indicators.ema9, indicators.ema21);

    const message = `
*${asset} - ${tf}*

💰 Price: ${lastCandle.close}
📈 24h High: ${Math.max(...candles.map(c => parseFloat(c.high)))}
📉 24h Low: ${Math.min(...candles.map(c => parseFloat(c.low)))}
🔁 Change: ${((lastCandle.close - candles[0].open) / candles[0].open * 100).toFixed(2)}%
🧮 Volume: ${lastCandle.volume}
💵 Quote Volume: ${(lastCandle.volume * lastCandle.close).toFixed(2)}
🔓 Open Price: ${lastCandle.open}
⏰ Close Time: ${moment(lastCandle.close_time * 1000).tz(APP_TZ).format('YYYY-MM-DD HH:mm:ss')}

📊 On-Balance Volume (OBV): ${indicators.obv}

📈 EMA:
Asset Price: ${lastCandle.close}
(9): ${indicators.ema9.toFixed(4)}
(21): ${indicators.ema21.toFixed(4)}

⚡️ RSI(14): ${indicators.rsi.toFixed(2)}

🎯 Bollinger(20,2):
Upper: ${indicators.bbUpper.toFixed(4)}
Middle: ${indicators.bbMiddle.toFixed(4)}
Lower: ${indicators.bbLower.toFixed(4)}

Overall Trend: ${trend}
`;

    ctx.replyWithMarkdown(message);
});

// Open port
bot.launch().then(() => console.log('Bot running on port 3000'));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
