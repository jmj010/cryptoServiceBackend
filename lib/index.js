const express = require('express');
const report = require('./calculations');

const app = express();

const port = 4213;

app.get('crypto/daily/report', async (req, res) => {
    res.status(200).send(await report.generateReport(req.query.coin));
});

app.listen(port, () => {
    console.log(`Crypto Service Backend listening on port ${port}`);
});