const WebSocket = require('ws');

const ws1 = new WebSocket('wss://ws.jelly-party.com:8080');
const ws2 = new WebSocket('wss://ws.jelly-party.com:8080');
const ws3 = new WebSocket('wss://ws.jelly-party.com:8080');
const ws4 = new WebSocket('wss://ws.jelly-party.com:8080');
const ws5 = new WebSocket('wss://ws.jelly-party.com:8080');
const ws6 = new WebSocket('wss://ws.jelly-party.com:8080');

const pid1 = "sole-lords-attract-through";
const pid2 = "mental-cheers-exercise-nearby";

const command1 = { type: "join", partyId: pid1, clientName: "mark", currentlyWatching: "testdomain.com"}
const command2 = { type: "join", partyId: pid1, clientName: "aurel", currentlyWatching: "testdomain.com"}
const command3 = { type: "join", partyId: pid1, clientName: "mx", currentlyWatching: "testdomain.com"}
const command4 = { type: "join", partyId: pid2, clientName: "lis", currentlyWatching: "testdomain.com"}
const command5 = { type: "join", partyId: pid2, clientName: "boo", currentlyWatching: "testdomain.com"}
const command6 = { type: "join", partyId: pid2, clientName: "quark", currentlyWatching: "testdomain.com"}

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
    console.log(`ws2 received the following message: ${data}`);
});

ws3.on('open', function open() {
    ws3.send(JSON.stringify(command3));
});

ws3.on('message', function incoming(data) {
    console.log(`ws3 received the following message: ${data}`);
});

ws4.on('open', function open() {
    ws4.send(JSON.stringify(command4));
});

ws4.on('message', function incoming(data) {
    console.log(`ws4 received the following message: ${data}`);
});

ws5.on('open', function open() {
    ws5.send(JSON.stringify(command5));
});

ws5.on('message', function incoming(data) {
    console.log(`ws5 received the following message: ${data}`);
});

ws6.on('open', function open() {
    ws6.send(JSON.stringify(command6));
    var newcmd = {"type": "forward", "partyId": pid2, "data": {"commandToForward": {"type": "videoUpdate", "data": {"variant": "play", "tick": 1000 }}}}
    ws6.send(JSON.stringify(newcmd));
});

ws6.on('message', function incoming(data) {
    console.log(`ws6 received the following message: ${data}`);
});