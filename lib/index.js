const express = require('express');

const app = express();

const port = 4213;

app.get('/daily/report', (req, res) => {
    res.send('Hello World!');
});

app.listen(port, () => {
    console.log(`Crypto Service Backend listening on port ${port}`);
});