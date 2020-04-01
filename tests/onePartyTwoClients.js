const WebSocket = require('ws');
const { uuid } = require('uuidv4');

const ws1 = new WebSocket('wss://www.jelly-party.com:8080');
const ws2 = new WebSocket('wss://www.jelly-party.com:8080');
const pid = uuid();
const command1 = { instruction: "join", partyId: pid }
const command2 = { instruction: "join", partyId: pid }

ws1.on('open', function open() {
    ws1.send(JSON.stringify(command1));
});

ws1.on('message', function incoming(data) {
    console.log(`ws1 received the following message: ${data}`);
});

ws2.on('open', function open() {
    ws2.send(JSON.stringify(command2));
});

ws2.on('message', function incoming(data) {
    console.log(`ws1 received the following message: ${data}`);
});