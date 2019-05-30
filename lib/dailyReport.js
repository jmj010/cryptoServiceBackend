const AWS = require('aws-sdk');
const axios = require('axios');
const nodemailer = require('nodemailer');
const { calcEmaDay, calcSmaDay, calcRsi, calcCMF, calcOBV, calcSD, calcIchimokuCloud } = require('./functions');

const binance_endpoint = 'https://api.binance.com';
const api = '/api'
const version = '/v1';

const endpoint = binance_endpoint + api + version;

const limit = 1000;

let endTime = new Date().getTime();
let startTime = endTime - (24 * 60 * 60 * 1000 * limit);

let endTime2 = endTime - (24 * 60 * 60 * 1000 * limit);
let startTime2 = startTime - (24 * 60 * 60 * 1000 * limit);

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'CoinFlexHelp@gmail.com',
        pass: 'coinflexpasswordslimjim626626'
    }
});

const recipient = 'coinflexalerts@gmail.com';

const trackCoins = ['BTCUSDT', 'LTCBTC', 'ETHBTC', 'ADABTC', 'ICXBTC', 'NEOBTC'];

let message = '';

function getBinanceData(startTime, endTime, limit, symbol) {
    return new Promise((resolve, reject) => {
        axios.get(endpoint + `/klines?symbol=${symbol}&interval=1d&limit=${limit}&startTime=${startTime}&endTime=${endTime}`).then((res) => {
            resolve(res.data);
        }).catch((err) => {
            console.log('Error: ' + err);
            reject(err);
        })
    });
};

function calculateAlgorithms(values) {
    let ema5 = ema10 = ema20 = ema30 = ema40 = ema50 = ema60 = ema100 = ema200 = 0;
    let sma5 = sma10 = sma20 = sma50 = sma100 = sma200 = 0;
    let rsiGain = rsiLoss = rsi = 0;
    let macd = ema9 = ema12 = ema26 = 0; // EMA 9 day is used as signal line. When MACD is below signal it is bearish. When it is above it is bullish?
    let sma5hl = sma34hl = 0;
    let ao = 0;
    let cmf = 0;
    let obv = 0;
    let middleBand = upperBand = lowerBand = sd20 = 0;
    // Conversion Line = Base Line = Leading Span A = Leading Span B = Lagging Span
    let kenkanSen = kijunSen = senkouSpanA = senkouSpanB = chikouSpan = 0;
    let floatHigh = floatLow = floatClose = floatOpen = floatVolume = 0;

    values.forEach((value, index) => {
        floatOpen = parseFloat(value[1]);
        floatHigh = parseFloat(value[2]);
        floatLow = parseFloat(value[3]);
        floatClose = parseFloat(value[4]);
        floatVolume = parseFloat(value[5]);
        prevFloatClose = index === 0 ? 0 : parseFloat(values[index - 1][4]);

        // Exponential moving averages
        ema5 = calcEmaDay(index, 5, ema5, floatClose);
        ema10 = calcEmaDay(index, 10, ema10, floatClose);
        ema20 = calcEmaDay(index, 20, ema20, floatClose);
        ema50 = calcEmaDay(index, 50, ema50, floatClose);
        ema100 = calcEmaDay(index, 100, ema100, floatClose);
        ema200 = calcEmaDay(index, 200, ema200, floatClose);

        // EMA Ribbons. Use 10, 20, 30, 40, 50 and 60 day ema lines
        ema30 = calcEmaDay(index, 30, ema30, floatClose);
        ema40 = calcEmaDay(index, 40, ema40, floatClose);
        ema60 = calcEmaDay(index, 60, ema60, floatClose);

        // Calculate for macd. ema9 of macd is the signal line
        ema12 = calcEmaDay(index, 12, ema12, floatClose);
        ema26 = calcEmaDay(index, 26, ema26, floatClose);
        macd = ema12 - ema26;
        ema9 = calcEmaDay(index, 9, ema9, macd);

        // Simple moving averages
        sma5 = calcSmaDay(index, 5, values);
        sma10 = calcSmaDay(index, 10, values);
        sma20 = calcSmaDay(index, 20, values);
        sma50 = calcSmaDay(index, 50, values);
        sma100 = calcSmaDay(index, 100, values);
        sma200 = calcSmaDay(index, 200, values);

        // Bollinger Bands - sma with 2 standard deviations above and below.
        if (index > 20) {
            // Since looking for 20 day period values. Make sure that there exists 20 days worth of values
            sd20 = calcSD(index, values);
            middleBand = sma20;
            upperBand = sma20 + (sd20 * 2);
            lowerBand = sma20 - (sd20 * 2);
        }

        // Ichimoku Cloud
        // Conversion Line (9-period High + 9-period Low) / 2
        // Base Line (26-period High + 26-period Low) / 2
        // Leading Span A (Conversion Line + Base Line) / 2
        // Leading Span B (52-period High + 52-period Low) / 2
        // Lagging Span Close plotted 26 days in the past
        if (index > 52) {
            const cloudResults = calcIchimokuCloud(index, values);
            kenkanSen = cloudResults.kenkanSen;
            kijunSen = cloudResults.kijunSen;
            senkouSpanA = cloudResults.senkouSpanA;
            senkouSpanB = cloudResults.senkouSpanB;
            chikouSpan = cloudResults.chikouSpan;``
        }

        // Trend confirmation
        // Calculations for the awesome oscillator. value[2] is the High. value[3] is the Low
        // NOTE: If you want sliding window of values? send for second parameter different sized array. So it calcs earlier
        sma5hl = calcSmaDay(index, 5, values);
        sma34hl = calcSmaDay(index, 34, values);
        ao = sma5hl - sma34hl;

        // Ignore RSI readings up to n period
        if (index !== 0) {
            const rsiResult = calcRsi(index, 14, rsiGain, rsiLoss, prevFloatClose, floatClose);
            rsiGain = rsiResult.rsiGain;
            rsiLoss = rsiResult.rsiLoss;
            rsi = rsiResult.rsi;
        }

        // Chaiken money flow good for volume readings. Positive indicates bullish momentum while negative indicates selling pressure with bearish trend.
        if (index > 21) {
            cmf = calcCMF(index, 21, values);
        }

        // On Balance Volume Indicator
        if (index !== 0) {
            obv = calcOBV(obv, prevFloatClose, floatClose, floatVolume);
        }
    })

    return {
        ema5, ema10, ema20, ema30, ema40, ema50, ema60, ema100, ema200,
        sma5, sma10, sma20, sma50, sma100, sma200,
        rsi, macd, macdSignal: ema9, ao, cmf, obv,
        middleBand, upperBand, lowerBand,
        kenkanSen, kijunSen, senkouSpanA, senkouSpanB, chikouSpan,
        floatOpen, floatClose, floatLow, floatHigh, floatVolume,
    }
}

function sendMailUpdate(message) {
    const today = new Date();
    const dd = today.getDate();
    const mm = today.getMonth() + 1;
    const yyyy = today.getFullYear();

    const mailOptions = {
        from: 'CoinFlexHelp@gmail.com', // sender address
        // to: '6194679528@pm.sprint.com', // list of receivers
        to: recipient,
        subject: `ATTN: ${mm}/${dd}/${yyyy} Coin Report`, // Subject line
        html: message
    }

    transporter.sendMail(mailOptions, function (err, info) {
        if (err) {
            console.log(err);
        } else {
            console.log(info);
        }
    });
}

async function main() {
    for (let i = 0; i < trackCoins.length; i += 1) {
        const coin = trackCoins[i];
        const promises = [];
    
        promises.push(getBinanceData(startTime2, endTime2, limit, coin));
        promises.push(getBinanceData(startTime, endTime, limit, coin));
    
        await Promise.all(promises).then((values) => {
            console.log(values);
            const mergedValues = values[0].concat(values[1]);
            mergedValues.pop(); // Remove the current days values since it is not complete yet
            
            const calculations = calculateAlgorithms(mergedValues);
            let emas = [{ period: "ema__5", calc: calculations.ema5 }, { period: "ema_10", calc: calculations.ema10 }, { period: "ema_20", calc: calculations.ema20 },
                        { period: "ema_30", calc: calculations.ema30 }, { period: "ema_40", calc: calculations.ema40 }, { period: "ema_50", calc: calculations.ema50 },
                        { period: "ema_60", calc: calculations.ema60 }, { period: "ema100", calc: calculations.ema100 }, { period: "ema200", calc: calculations.ema200 }];
            emas = emas.sort((a, b) => a.calc > b.calc);

            let smas = [{ period: "sma__5", calc: calculations.sma5 }, { period: "sma_10", calc: calculations.sma10 }, { period: "sma_20", calc: calculations.sma20 },
            { period: "sma_50", calc: calculations.sma50 }, { period: "sma100", calc: calculations.sma100 }, { period: "sma200", calc: calculations.sma200 }];
            smas = smas.sort((a, b) => a.calc > b.calc);

            message += `<br/>${coin}<br/>`;
    
            message += `Open: ${calculations.floatOpen}<br/>`;
            message += `Close: ${calculations.floatClose}<br/>`;
            message += `High: ${calculations.floatHigh}<br/>`;
            message += `Low: ${calculations.floatLow}<br/>`;
            message += `Volume: ${calculations.floatVolume}<br/>`;
            message += `OBV: ${calculations.obv.toFixed(5)}<br/>`;
            message += `Lower Band: ${calculations.lowerBand.toFixed(5)} Middle Band: ${calculations.middleBand.toFixed(5)} Upper Band: ${calculations.upperBand.toFixed(5)}<br/><br/>`;

            // PRINT RSI
            message += `RSI: ${calculations.rsi.toFixed(5)} `;
            if (calculations.rsi < 30) {
                message += '<span style="color:blue;">';
                if (calculations.rsi < 20) {
                    message += 'EXTREME ';
                }
                message += 'OVERSOLD</span>';
            } else if(calculations.rsi > 70) {
                message += '<span style="color:red;">';
                if (calculations.rsi > 80) {
                    message += 'EXTREME ';
                }
                message += 'OVERBOUGHT</span>';
            }
            message += '<br/>';

            // MACD
            message += `MACD: ${calculations.macd.toFixed(5)} SIGNAL: ${calculations.macdSignal.toFixed(5)} ${calculations.macd > calculations.macdSignal ? '<span style="color:blue;">BULLISH' : '<span style="color:red;">BEARISH'}</span><br/>`; 

            // Chaiken Money Flow
            message += `CMF: ${calculations.cmf.toFixed(5)} ${calculations.cmf > 0 ? '<span style="color:blue;">STRENGTH' : '<span style="color:red;">WEAKNESS'}</span><br/>`;

            // Awesome Oscillator
            message += `AO: ${calculations.ao.toFixed(5)} ${calculations.ao > 0 ? '<span style="color:blue;">BULL Leaning' : '<span style="color:red;">Bear Leaning'}</span><br/>`;

            message += '<br/>';
            // PRINT EMA/SMA
            emas.forEach((ema) => {
                message += `${ema.period}&nbsp;&nbsp;`;
            });
            message += '<br/>';
            emas.forEach((ema) => {
                message += `${ema.calc.toFixed(5)}&nbsp;&nbsp;`;
            });
            message += '<br/>';
            message += '<br/>';
            smas.forEach((sma) => {
                message += `${sma.period}&nbsp;&nbsp;`;
            });
            message += '<br/>';
            smas.forEach((sma) => {
                message += `${sma.calc.toFixed(5)}&nbsp;&nbsp;`;
            });
            message += '<br/>';
        })
    }

    sendMailUpdate(message);
}

main();

/*
exports.handler = (event, context, callback) => {
    main();
    callback(null, 'Successfully sent update');
}; */