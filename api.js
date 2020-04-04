// Server can receive the follwing instructions from client
joinInstruction = { "type": "join", "clientName": "clientXYZ", "partyId": "someId" };
forwardInstruction_videoUpdate = { "type": "forward", "partyId": "someId", "data": { "commandToForward": { "type": "videoUpdate", "data": { "variant": "playPause", "tick": 1000 } } } }

// Client can receive the follwing instructions from server
videoInstruction = { "type": "videoUpdate", "data": { "variant": "playPause", "tick": 1000 } }
partyStateUpdateInstruction = { type: "partyStateUpdate", data: { partyState: { isActive: true, partyId: "someId", peers: [] } } };

