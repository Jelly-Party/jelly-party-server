// Server can receive the follwing instructions from client
joinInstruction = { instruction: "join", partyId: "someId", clientName: "someName" };
forwardInstruction = { instruction: "forward", partyId: "someId", commandToForward: {} }

// Client can receive the follwing instructions from server
videoInstruction = { instruction: "videoUpdate", data: { type: ["playPause", "seek"], tick: 1337 } };
partyStateUpdateInstruction = { instruction: "partyStateUpdate", data: {} }
