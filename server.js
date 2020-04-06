const fs = require('fs');
const https = require('https');
const WebSocket = require('ws');
const { uuid } = require('uuidv4');
const { createLogger, format, transports } = require('winston');
const { combine, timestamp, label, printf } = format;

const myFormat = printf(({ level, message, label, timestamp }) => {
  return `${timestamp} [${label}] ${level}: ${message}`;
});

const logger = createLogger({
  level: 'debug',
  format: combine(
    // format.colorize(),
    label({ label: 'Jelly-Party-Server' }),
    timestamp(),
    myFormat
  ),
  defaultMeta: { service: 'user-service' },
  transports: [
    //
    // - Write to all logs with level `info` and below to `combined.log` 
    // - Write all logs error (and below) to `error.log`.
    //
    new transports.Console(),
    new transports.File({ filename: '/var/log/serverlog/error.log', level: 'error' }),
    new transports.File({ filename: '/var/log/serverlog/combined.log', level: 'debug' })
  ]
});

const server = https.createServer({
  cert: fs.readFileSync('/etc/letsencrypt/live/ws.jelly-party.com/fullchain.pem'),
  key: fs.readFileSync('/etc/letsencrypt/live/ws.jelly-party.com/privkey.pem')
});
const wss = new WebSocket.Server({ server });

// Define a dictionary that will hold all parties with references to clients
var parties = {};
// Define a dictionary that will hold all clients with reference to party
var clients = {};

class Party {
  constructor(partyId) {
    this.partyId = partyId;
    this.connections = [];
  }
  notifyClients(myId, msg) {
    logger.debug(`Notifying other clients about command: ${JSON.stringify(msg)}`);
    var relevantConnections = this.connections.filter((conn) => { return (conn.id !== myId) });
    for (const relevantConnection of relevantConnections) {
      logger.debug(`Notiying ${relevantConnection.id}.`)
      relevantConnection.send(JSON.stringify(msg));
    }
  }
  addClient(newClient) {
    this.connections.push(newClient);
    this.broadcastPartyState();
  }
  removeClient(clientId) {
    logger.debug(`Removing client with Id ${clientId}.`);
    this.connections = this.connections.filter((conn) => { return conn.id !== clientId });
    logger.debug(`Clients left in party: ${this.connections.map((conn) => conn.id)}`)
    if (!this.connections.length) {
      // This party is now empty. Let's remove it.
      this.removeParty();
    }
    this.broadcastPartyState();
  }
  broadcastPartyState() {
    var partyState = { isActive: true, partyId: this.partyId, peers: (this.connections.map(c => c.clientName)) };
    var partyStateUpdate = { type: "partyStateUpdate", data: { partyState: partyState } };
    this.notifyClients(undefined, partyStateUpdate); // notify everybody about new party state.
  }
  removeParty() {
    // remove reference to this party so that it can be garbage collected
    logger.debug(`Party empty. Removing party with Id ${this.partyId}.`);
    delete parties[this.partyId];
  }
}

function noop() { }

function heartbeat() {
  this.isAlive = true;
}


wss.on('connection', function connection(ws) {
  // Let's generate a unique id for every connection
  logger.debug("Received new connection.");
  ws.id = uuid();
  ws.isAlive = true;
  ws.on('pong', heartbeat);
  ws.interval = setInterval(function ping() {
    if (ws.isAlive === false) return ws.close();
    ws.isAlive = false;
    ws.ping(noop);
  }, 30000);
  ws.on('message', function incoming(message) {
    try {
      logger.debug(`Received: ${JSON.stringify(message)}`);
      var message = JSON.parse(message);
      var type = message.type;
      var partyId = message.partyId;
      switch (type) {
        case "join":
          ws.clientName = message.clientName;
          logger.debug(`Client ${ws.clientName} wants to join a party..`);
          if (partyId in parties) {
            // This party exists. Let's join it
            logger.debug("Party already exists, so client can join..");
            var existingParty = parties[partyId];
            existingParty.addClient(ws);
            clients[ws.id] = existingParty;
            logger.debug(`Client added to party. Clients in party: ${existingParty.connections.map((c) => c.id)}.`);
          } else {
            // Let's create this party, then join it
            logger.debug("Party doesn't yet exist, so it'll need to be created..")
            var newParty = new Party(partyId);
            newParty.addClient(ws);
            parties[partyId] = newParty;
            clients[ws.id] = newParty;
            logger.debug(`Party added. Clients in party: ${newParty.connections.map((c) => c.id)}.`);
          }
          break;
        case "forward":
          // We're asked to forward a command to all ppl in a party
          var party = parties[partyId];
          party.notifyClients(ws.id, message.data.commandToForward);
          break;
        default:
          logger.warn(`Should not be receiving this message: ${message}.`)
      }
    } catch (e) {
      logger.error(`Error handling message: ${JSON.stringify(message)}. ${e}.`);
    }
  });
  ws.on('close', function close() {
    logger.debug(`Client ${ws.id} disconnected. Checking if party needs to be removed.`);
    clearInterval(ws.interval);
    party = clients[ws.id]; // is client in a party?
    if (party) {
      // client is in a party
      logger.debug(`Client ${ws.id} is in a party. Removing client from party.`);
      party.removeClient(ws.id);
      delete clients[ws.id];
    } else {
      logger.debug(`Apparently client ${ws.id} is not inside a party, so I doesn't need to be removed..`)
    }
    logger.debug(`clients keys is now: ${JSON.stringify(Object.keys(clients))}`);
    logger.debug(`parties keys is now: ${JSON.stringify(Object.keys(parties))}`);
  });
});



server.listen(8080);