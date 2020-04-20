const fs = require("fs");
const https = require("https");
const WebSocket = require("ws");
const { uuid } = require("uuidv4");
const { createLogger, format, transports } = require("winston");
const { combine, timestamp, label, printf } = format;

const myFormat = printf(({ level, message, label, timestamp }) => {
  return `${timestamp} [${label}] ${level}: ${message}`;
});
const loggingLevel = process.env.NODE_ENV === "production" ? "info" : "debug";
const logger = createLogger({
  level: loggingLevel,
  format: combine(
    // format.colorize(),
    label({ label: "Jelly-Party-Server" }),
    timestamp(),
    myFormat
  ),
  defaultMeta: { service: "user-service" },
  transports: [
    //
    // - Write to all logs with level `info` and below to `combined.log`
    // - Write all logs error (and below) to `error.log`.
    //
    new transports.Console(),
    new transports.File({
      filename: "/var/log/serverlog/error.log",
      level: "error",
    }),
    new transports.File({
      filename: "/var/log/serverlog/combined.log",
      level: "debug",
    }),
  ],
});

var certPath, keyPath;
const port = 8080;
logger.info(
  `Starting server in ${process.env.NODE_ENV} mode. Logging level is at ${loggingLevel}.`
);

switch (process.env.NODE_ENV) {
  case "production":
    certPath = "/etc/letsencrypt/live/ws.jelly-party.com/fullchain.pem";
    keyPath = "/etc/letsencrypt/live/ws.jelly-party.com/privkey.pem";
    break;
  case "development":
    certPath = "/etc/letsencrypt/live/staging.jelly-party.com/fullchain1.pem";
    keyPath = "/etc/letsencrypt/live/staging.jelly-party.com/privkey1.pem";
    break;
}

logger.info(`Using config for ${certPath.match(/\/.+jelly-party.com/)[0]}.`);

const server = https.createServer({
  cert: fs.readFileSync(certPath),
  key: fs.readFileSync(keyPath),
});
const wss = new WebSocket.Server({ server });

// Define a dictionary that will hold all parties with references to clients
var parties = {};

class Party {
  constructor(partyId) {
    this.partyId = partyId;
    this.connections = [];
  }
  notifyClients(myId, msg) {
    logger.debug(
      `Notifying other clients about command: ${JSON.stringify(msg)}`
    );
    var relevantConnections = this.connections.filter((conn) => {
      return conn.uuid !== myId;
    });
    for (const relevantConnection of relevantConnections) {
      logger.debug(`Notiying ${relevantConnection.uuid}.`);
      relevantConnection.send(JSON.stringify(msg));
    }
  }
  addClient(newClientWebsocket) {
    this.connections.push(newClientWebsocket);
    this.broadcastPartyState();
  }
  removeClient(clientId) {
    logger.debug(`Removing client with Id ${clientId}.`);
    this.connections = this.connections.filter((conn) => {
      return conn.uuid !== clientId;
    });
    logger.debug(
      `Clients left in party: ${this.connections.map((conn) => conn.uuid)}`
    );
    if (!this.connections.length) {
      // This party is now empty. Let's remove it.
      this.removeParty();
    } else {
      // Otherwise let's broadcast the next party state
      this.broadcastPartyState();
    }
  }
  broadcastPartyState() {
    var partyState = {
      isActive: true,
      partyId: this.partyId,
      peers: this.connections.map((c) => {
        return {
          uuid: c.uuid,
          clientName: c.clientName,
          currentlyWatching: c.currentlyWatching,
          favicon: c.favicon
        };
      }),
    };
    var partyStateUpdate = {
      type: "partyStateUpdate",
      data: { partyState: partyState },
    };
    // Notify everybody about new party state.
    this.notifyClients(/* undefined=everybody */ undefined, partyStateUpdate);
  }
  removeParty() {
    // remove reference to this party so that it can be garbage collected
    logger.debug(`Party empty. Removing party with Id ${this.partyId}.`);
    delete parties[this.partyId];
  }
}

function noop() {}

function heartbeat() {
  this.isAlive = true;
}

wss.on("connection", function connection(ws) {
  // Let's generate a unique id for every connection
  logger.debug("Received new connection.");
  ws.uuid = uuid();
  logger.info(`${ws.uuid} connected.`);
  ws.isAlive = true;
  ws.on("pong", heartbeat);
  ws.interval = setInterval(function ping() {
    if (ws.isAlive === false) return ws.close();
    ws.isAlive = false;
    ws.ping(noop);
  }, 30000);
  ws.on("message", function incoming(message) {
    try {
      logger.debug(`Received: ${JSON.stringify(message)}`);
      var message = JSON.parse(message);
      var type = message.type;
      switch (type) {
        case "join":
          ws.partyId = message.data.partyId;
          ws.clientName = message.data.clientState.clientName;
          ws.currentlyWatching = message.data.clientState.currentlyWatching;
          ws.favicon = message.data.clientState.favicon;
          logger.debug(
            `Client ${ws.clientName} wants to join a party. GUID is ${message.data.guid}.`
          );
          if (ws.partyId in parties) {
            // This party exists. Let's join it
            logger.debug("Party already exists, so client can join..");
            var existingParty = parties[ws.partyId];
            existingParty.addClient(ws);
            ws.party = existingParty;
            logger.debug(
              `Client added to party. Clients in party: ${existingParty.connections.map(
                (c) => c.clientName
              )}.`
            );
          } else {
            // Let's create this party, then join it
            logger.debug(
              "Party doesn't yet exist, so it'll need to be created.."
            );
            var newParty = new Party(ws.partyId);
            newParty.addClient(ws);
            parties[ws.partyId] = newParty;
            ws.party = newParty;
            logger.debug(
              `Party added. Clients in party: ${newParty.connections.map(
                (c) => c.clientName
              )}.`
            );
          }
          break;
        case "forward":
          // We're asked to forward a command to all ppl in a party
          var party = ws.party;
          var commandToForward = message.data.commandToForward;
          // We must add the client who issued the command
          commandToForward.peer = {
            uuid: ws.uuid,
            clientName: ws.clientName,
            currentlyWatching: ws.currentlyWatching,
          };
          party.notifyClients(ws.uuid, commandToForward);
          break;
        case "clientUpdate":
          // A client wants to update its state
          ws.currentlyWatching = message.data.newClientState.currentlyWatching;
          ws.favicon = message.data.newClientState.favicon;
          ws.party.broadcastPartyState();
          break;
        default:
          logger.warn(`Should not be receiving this message: ${message}.`);
      }
    } catch (e) {
      logger.error(`Error handling message: ${JSON.stringify(message)}. ${e}.`);
    }
  });
  ws.on("close", function close() {
    logger.info(`${ws.uuid} disconnected.`);
    logger.debug(
      `Client ${ws.uuid} disconnected. Checking if party needs to be removed.`
    );
    clearInterval(ws.interval);
    const party = ws.party; // is client in a party?
    if (party) {
      // client is in a party
      logger.debug(
        `Client ${ws.uuid} is in a party. Removing client from party.`
      );
      party.removeClient(ws.uuid);
    } else {
      logger.debug(
        `Apparently client ${ws.clientName} is not inside a party, so the client doesn't need to be removed..`
      );
    }
    logger.debug(
      `parties keys is now: ${JSON.stringify(Object.keys(parties))}`
    );
  });
});

server.listen(port);
logger.info(`Server listening at port ${port}.`);
