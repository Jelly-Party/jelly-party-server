import { uuid } from "https://esm.sh/uuidv4@6.2.13";
import { opine, OpineRequest } from "https://deno.land/x/opine@2.2.0/mod.ts";
import * as log from "https://deno.land/std@0.150.0/log/mod.ts";

interface ClientState {
  clientName: string;
  uuid: string;
}

interface JellyPartyWebSocket extends WebSocket {
  uuid: string;
  isAlive: boolean;
  interval: number;
  partyId: string;
  clientState: ClientState;
  party: Party;
  ping: (arg0: () => void) => void;
}

interface ChatMessage {
  type: string;
  peer: { uuid: string };
  data: { text: string; timestamp: number };
}

await log.setup({
  handlers: {
    console: new log.handlers.ConsoleHandler("DEBUG"),

    file: new log.handlers.FileHandler("WARNING", {
      filename: "/var/log/serverlog/elastic.json",
      // you can change format of output message using any keys in `LogRecord`.
      // formatter: "{levelName} {msg}",
      formatter: "{msg}",
    }),
  },

  loggers: {
    // configure default logger available via short-hand methods above.
    default: {
      level: "DEBUG",
      handlers: ["console", "file"],
    },
  },
});

const logger = log.getLogger();

const port = 8080;
logger.info(`Starting server in ${Deno.env.get("MODE")} mode.`);

// Define a dictionary that will hold all parties with references to clients
const parties: Record<string, Party> = {};

// Launch the localhost API that filebeat uses to display live stats.
// This server is not exposed publically and only accessible from
// localhost
const internalAPI = opine();
const apiPort = 8081;

internalAPI.get("/parties/:id", (req, res) => {
  const ans = parties[req.params.id];
  res.json(ans);
});
internalAPI.get("/stats", (req, res) => {
  let activeParties = 0;
  let activeClients = 0;
  for (const [key, party] of Object.entries(parties)) {
    activeParties += 1;
    activeClients += party.connections.length;
  }
  const ans = {
    activeParties: activeParties,
    activeClients: activeClients,
  };
  res.json(ans);
});
internalAPI.post("/parties/:id/chat", (req, res) => {
  const party = parties[req.params.id];
  const chatMessage: ChatMessage = {
    type: "chatMessage",
    peer: { uuid: "jellyPartyLogMessage" },
    data: { text: req.body.msg, timestamp: Date.now() },
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
internalAPI.post("/broadcast/chat", (req, res) => {
  const chatMessage = {
    type: "chatMessage",
    peer: { uuid: "jellyPartySupportBot" },
    data: {
      text: req.body.msg,
      timestamp: Date.now(),
    },
  };
  for (const [key, party] of Object.entries(parties)) {
    party.notifyClients(undefined, chatMessage);
  }
  res.json({ status: "success", body: req.body });
});

const app = opine();

app.get("/", async (req, res, next) => {
  if (req.headers.get("upgrade") === "websocket") {
    const sock = req.upgrade();
    await handleWs(sock as JellyPartyWebSocket, req);
  }
  next();
});

class Party {
  partyId: string;
  connections: Array<WebSocket & any>;
  isAlive!: boolean;
  constructor(partyId: string) {
    this.partyId = partyId;
    this.connections = [];
    const elasticLog = JSON.stringify({
      type: "partyCreated",
      data: { partyId: this.partyId },
    });
    logger.info(elasticLog);
  }
  notifyClients(myId: string | undefined, msg: any) {
    // myId === undefined => notify everybody
    logger.debug(
      `Notifying other clients about command: ${JSON.stringify(msg)}`
    );
    const relevantConnections = this.connections.filter((conn) => {
      return conn.uuid !== myId;
    });
    for (const relevantConnection of relevantConnections) {
      logger.debug(`Notifying ${relevantConnection.uuid}.`);
      relevantConnection.send(JSON.stringify(msg));
    }
  }
  addClient(newClientWebsocket: WebSocket) {
    this.connections.push(newClientWebsocket);
    this.broadcastPartyState();
  }
  removeClient(clientId: string) {
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
    const partyState = {
      isActive: true,
      partyId: this.partyId,
      peers: this.connections.map((c) => {
        return { ...c.clientState, ...{ uuid: c.uuid } };
      }),
    };
    const partyStateUpdate = {
      type: "partyStateUpdate",
      data: { partyState: partyState },
    };
    // Notify everybody about new party state.
    this.notifyClients(undefined, partyStateUpdate);
  }

  removeParty() {
    // remove reference to this party so that it can be garbage collected
    const elasticLog = JSON.stringify({
      type: "partyRemoved",
      data: { partyId: this.partyId },
    });
    logger.info(elasticLog);
    logger.debug(`Removing party: ${this.partyId}`);
    delete parties[this.partyId];
  }
}

function noop() {
  //
}

function heartbeat(this: any) {
  this.isAlive = true;
}

function handleWs(ws: JellyPartyWebSocket, req: OpineRequest) {
  // Let's generate a unique id for every connection
  logger.debug("New connection opened.");
  ws.uuid = uuid();
  logger.debug(`UUID set: ${ws.uuid}.`);
  ws.isAlive = true;
  ws.addEventListener("pong", heartbeat);
  ws.interval = setInterval(function ping() {
    if (ws.isAlive === false) return ws.close();
    ws.isAlive = false;
    ws.ping(noop);
  }, 30000);
  ws.addEventListener("message", function (rawMessage: any) {
    try {
      const parsedMessage = JSON.parse(rawMessage);
      const type = parsedMessage.type;
      const data = parsedMessage.data;
      logger.debug(
        `Received command of type ${type} with data:\n ${JSON.stringify(data)}`
      );
      switch (type) {
        case "join": {
          ws.partyId = data.partyId;
          ws.clientState = data.clientState;
          // Let the client know about his UUID
          ws.send(JSON.stringify({ type: "setUUID", data: { uuid: ws.uuid } }));
          logger.debug(
            `Client ${ws.clientState.clientName} wants to join a party. GUID is ${data.guid}.`
          );
          // Let's log the join command and include the client's IP address.
          // The IP address must be anonymized by ElasticSearch and is
          // to be stored only as a rough geo_point, to analyze where traffic
          // originates from. Log files must be flushed on a regular basis.
          const elasticLog = { ...parsedMessage };
          elasticLog.data.clientIp = req.ip;
          elasticLog.data.uuid = ws.uuid;
          logger.info(JSON.stringify(elasticLog));
          if (ws.partyId in parties) {
            // This party exists. Let's join it
            logger.debug("Party already exists, so client can join..");
            const existingParty = parties[ws.partyId];
            existingParty.addClient(ws);
            ws.party = existingParty;
            logger.debug(
              `Client added to party. Clients in party: ${JSON.stringify(
                existingParty.connections.map((c) => c.uuid)
              )}.`
            );
          } else {
            // Let's create this party, then join it
            logger.debug(
              "Party doesn't yet exist, so it'll need to be created.."
            );
            const newParty = new Party(ws.partyId);
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
        }
        case "forward": {
          // We're asked to forward a command to all ppl in a party
          const party = ws.party;
          const commandToForward = data.commandToForward;
          // We must add the client who issued the command
          commandToForward.peer = {
            uuid: ws.uuid,
          };
          party.notifyClients(ws.uuid, commandToForward);
          break;
        }
        case "clientUpdate": {
          // A client wants to update its state
          // We must ensure that clientName and uuid stay
          // immutable
          delete data.newClientState["clientName"];
          delete data.newClientState["uuid"];
          ws.clientState = {
            ...ws.clientState,
            ...data.newClientState,
          };
          ws.party.broadcastPartyState();
          break;
        }
        default: {
          logger.warning(
            `Should not be receiving this message: ${JSON.stringify(data)}.`
          );
        }
      }
    } catch (e) {
      logger.error(`Error handling message: ${rawMessage}`);
      console.log(e);
    }
  });
  ws.addEventListener("close", function close() {
    try {
      const elasticLog = JSON.stringify({
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
    } catch (e) {
      logger.error(`Error when closing WebSocket: ${e}`);
    }
  });
}

app.listen(port);
internalAPI.listen(apiPort);
logger.info(`Server listening at port ${port}.`);
logger.info(`Internal API listening at port ${apiPort}.`);
