const { Telegraf } = require('telegraf');
const axios = require('axios');
const technical = require('technicalindicators');
const moment = require('moment-timezone');

const TELEGRAM_TOKEN = '7655482876:AAH1-wgF3Tku7Ce6E5C0VZ0kHu_3BpHqz_I';
const APP_TZ = 'Asia/Phnom_Penh';
const BYBIT_SPOT_KLINE = 'https://api.bybit.com/spot/quote/v1/kline';

const bot = new Telegraf(TELEGRAM_TOKEN);

// Supported assets and timeframes
const supportedAssets = ['ETH', 'BTC', 'LINK'];
const telegramToBybitInterval = {
    '5m': '5',
    '15m': '15',
    '1h': '60',
    '4h': '240',
    '24h': 'D'
};

// Parse command like /eth1h or /link15m
function parseCommand(cmd) {
    const match = cmd.match(/\/([a-zA-Z]+)(\d+[mh])/);
    if (!match) return null;
    const asset = match[1].toUpperCase();
    const tf = match[2];
    return { asset, tf };
}

// Fetch candles from Bybit Spot API
async function getCandles(symbol, interval) {
    try {
        const res = await axios.get(BYBIT_SPOT_KLINE, {
            params: {
                symbol: symbol + 'USDT',
                interval: interval,
                limit: 100
            }
        });
        if (!res.data.result) return [];
        return res.data.result.map(c => ({
            open_time: c.open_time,
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

// Calculate indicators
function calculateIndicators(candles) {
    const closes = candles.map(c => c.close);
    const volumes = candles.map(c => c.volume);

    const obv = technical.OBV.calculate({ close: closes, volume: volumes }).slice(-1)[0];
    const ema9 = technical.EMA.calculate({ period: 9, values: closes }).slice(-1)[0];
    const ema21 = technical.EMA.calculate({ period: 21, values: closes }).slice(-1)[0];
    const rsi = technical.RSI.calculate({ period: 14, values: closes }).slice(-1)[0];
    const bb = technical.BollingerBands.calculate({ period: 20, values: closes, stdDev: 2 }).slice(-1)[0];

    return { obv, ema9, ema21, rsi, bbUpper: bb.upper, bbMiddle: bb.middle, bbLower: bb.lower };
}

// Determine trend
function trendSignal(price, ema9, ema21) {
    if (price > ema9 && ema9 > ema21) return 'Bullish 🟢';
    if (price < ema9 && ema9 < ema21) return 'Bearish 🔴';
    return 'Sideways 🟡';
}

// Start command
bot.start((ctx) => ctx.reply('Welcome! Use commands like /eth1h or /link15m'));

// Handle commands
bot.on('text', async (ctx) => {
    const parsed = parseCommand(ctx.message.text.toLowerCase());
    if (!parsed) return ctx.reply('Invalid command format! Example: /eth1h');

    const { asset, tf } = parsed;
    if (!supportedAssets.includes(asset)) return ctx.reply('Asset not supported.');
    if (!telegramToBybitInterval[tf]) return ctx.reply('Timeframe not supported.');

    const candles = await getCandles(asset, telegramToBybitInterval[tf]);
    if (!candles || candles.length === 0) return ctx.reply('No candle data found!');

    const lastCandle = candles[candles.length - 1];
    const indicators = calculateIndicators(candles);
    const trend = trendSignal(lastCandle.close, indicators.ema9, indicators.ema21);

    const message = `
*${asset} - ${tf}*

💰 Price: ${lastCandle.close}
📈 24h High: ${Math.max(...candles.map(c => c.high))}
📉 24h Low: ${Math.min(...candles.map(c => c.low))}
🔁 Change: ${((lastCandle.close - candles[0].open) / candles[0].open * 100).toFixed(2)}%
🧮 Volume: ${lastCandle.volume}
💵 Quote Volume: ${(lastCandle.volume * lastCandle.close).toFixed(2)}
🔓 Open Price: ${lastCandle.open}
⏰ Close Time: ${moment(lastCandle.open_time).tz(APP_TZ).format('YYYY-MM-DD HH:mm:ss')}

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

// Launch bot
bot.launch().then(() => console.log('Bot running on port 3000'));

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
