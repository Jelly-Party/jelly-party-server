const fs = require("fs");
const https = require("https");
const WebSocket = require("ws");
const { uuid } = require("uuidv4");
const { createLogger, format, transports } = require("winston");
const { combine, timestamp, label, json } = format;
const express = require("express");

// Default winston logging levels
// {
//   error: 0,
//   warn: 1,
//   info: 2,
//   verbose: 3,
//   debug: 4,
//   silly: 5
// }

const logger = createLogger({
  level: "info",
  format: combine(label({ label: "ws.jelly-party.com" }), timestamp(), json()),
  transports: [
    new transports.File({
      // maximum level logged is error
      filename: "/var/log/serverlog/error.log",
      level: "error",
    }),
    new transports.File({
      // maximum level logged is info
      filename: "/var/log/serverlog/elastic.json",
      level: "info",
    }),
  ],
});

if (process.env.NODE_ENV === "debug") {
  logger.verbose("Debug log enabled");
  logger.add(
    new transports.File({
      filename: "/var/log/serverlog/debug.log",
      level: "debug",
    })
  );
}

var certPath, keyPath;
const port = 8080;
logger.verbose(`Starting server in ${process.env.NODE_ENV} mode.`);

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

logger.verbose(`Using config for ${certPath.match(/\/.+jelly-party.com/)[0]}.`);

const server = https.createServer({
  cert: fs.readFileSync(certPath),
  key: fs.readFileSync(keyPath),
});
const wss = new WebSocket.Server({ server });

// Define a dictionary that will hold all parties with references to clients
var parties = {};

// Launch the localhost API that filebeat uses to display live stats.
// This server is not exposed publically and only accessible from
// localhost
const api = express();
api.use(express.json());
api.use(express.urlencoded({ extended: true }));
const apiPort = 8081;
api.get("/parties/:id", (req, res) => {
  let ans = parties[req.params.id];
  res.json(ans);
});
api.get("/stats", (req, res) => {
  let activeParties = 0;
  let activeClients = 0;
  for (let [key, party] of Object.entries(parties)) {
    activeParties += 1;
    activeClients += party.connections.length;
  }
  let ans = {
    activeParties: activeParties,
    activeClients: activeClients,
  };
  res.json(ans);
});
api.post("/parties/:id/chat", (req, res) => {
  let party = parties[req.params.id];
  let chatMessage = {
    type: "chatMessage",
    peer: { uuid: "jellyPartySupportBot" },
    data: {
      type: "system",
      data: { text: req.body.msg, timestamp: Date.now() },
    },
  };
  if (!party) {
    res.json({
      status: "error",
      msg: `The requested party does not exist.`,
    });
  } else {
    party.notifyClients(undefined, chatMessage);
    res.json({ status: "success" });
  }
});
api.post("/broadcast/chat", (req, res) => {
  let chatMessage = {
    type: "chatMessage",
    peer: { uuid: "jellyPartySupportBot" },
    data: {
      type: "system",
      data: { text: req.body.msg, timestamp: Date.now() },
    },
  };
  for (let [key, party] of Object.entries(parties)) {
    party.notifyClients(undefined, chatMessage);
  }
  res.json({ status: "success", body: req.body });
});
api.listen(apiPort, "localhost", () =>
  console.log(`API listening at http://localhost:${apiPort}`)
);

class Party {
  constructor(partyId) {
    this.partyId = partyId;
    this.connections = [];
    this.update = false;
    setInterval(() => {
      if (this.update) {
        this.broadcastPartyState();
        this.update = false;
      }
    }, 5000);
    let elasticLog = JSON.stringify({
      type: "partyCreated",
      data: { partyId: this.partyId },
    });
    logger.info(elasticLog);
  }
  notifyClients(myId, msg) {
    logger.debug(
      `Notifying other clients about command: ${JSON.stringify(msg)}`
    );
    var relevantConnections = this.connections.filter((conn) => {
      return conn.uuid !== myId;
    });
    for (const relevantConnection of relevantConnections) {
      logger.debug(`Notifying ${relevantConnection.uuid}.`);
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
        return { ...c.clientState, ...{ uuid: c.uuid } };
      }),
    };
    var partyStateUpdate = {
      type: "partyStateUpdate",
      data: { partyState: partyState },
    };
    // Notify everybody about new party state.
    this.notifyClients(/* undefined=everybody */ undefined, partyStateUpdate);
  }

  schedulePartyStateUpdate() {
    // Only send out party state updates a maximum of once every x ms
    // We do this  to gather party state updates in a bucket, instead of
    // sending them out immediately.
    this.update = true;
  }
  removeParty() {
    // remove reference to this party so that it can be garbage collected
    let elasticLog = JSON.stringify({
      type: "partyRemoved",
      data: { partyId: this.partyId },
    });
    logger.info(elasticLog);
    logger.verbose(`Removing party: ${this.partyId}`);
    delete parties[this.partyId];
  }
}

function noop() {}

function heartbeat() {
  this.isAlive = true;
}

wss.on("connection", function connection(ws, req) {
  // Let's generate a unique id for every connection
  logger.debug("New connection opened.");
  ws.uuid = uuid();
  logger.debug(`UUID set: ${ws.uuid}.`);
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
          ws.clientState = message.data.clientState;
          // Let the client know about his UUID
          ws.send(JSON.stringify({ type: "setUUID", data: { uuid: ws.uuid } }));
          logger.debug(
            `Client ${ws.clientState.clientName} wants to join a party. GUID is ${message.data.guid}.`
          );
          // Let's log the join command and include the client's IP address.
          // The IP address must be anonymized by ElasticSearch and is
          // to be stored only as a rough geo_point, to analyze where traffic
          // originates from. Log files must be flushed on a regular basis.
          let elasticLog = { ...message };
          elasticLog.data.clientIp = req.socket.remoteAddress;
          elasticLog.data.uuid = ws.uuid;
          elasticLog = JSON.stringify(elasticLog);
          logger.info(elasticLog);
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
          };
          party.notifyClients(ws.uuid, commandToForward);
          break;
        case "clientUpdate":
          // A client wants to update its state
          // We must ensure that clientName and uuid stay
          // immutable
          delete message.data.newClientState["clientName"];
          delete message.data.newClientState["uuid"];
          ws.clientState = {
            ...ws.clientState,
            ...message.data.newClientState,
          };
          ws.party.schedulePartyStateUpdate();
          break;
        default:
          logger.warn(`Should not be receiving this message: ${message}.`);
      }
    } catch (e) {
      logger.error(`Error handling message: ${JSON.stringify(message)}. ${e}.`);
    }
  });
  ws.on("close", function close() {
    let elasticLog = JSON.stringify({
      type: "disconnect",
      data: { uuid: ws.uuid },
    });
    logger.info(elasticLog);
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
        `Apparently client ${ws.clientState.clientName} is not inside a party, so the client doesn't need to be removed..`
      );
    }
    logger.debug(
      `parties keys is now: ${JSON.stringify(Object.keys(parties))}`
    );
  });
});

server.listen(port);
logger.info(`Server listening at port ${port}.`);
