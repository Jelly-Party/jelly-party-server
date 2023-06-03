#!/bin/bash

# This script allows you to send a message either to all parties (broadcast)
# or to a specific party.

# Usage:
# For broadcast: ./cli.sh broadcast "Your message"
# For messaging a specific party: ./cli.sh messageParty partyId "Your message"

action=$1

# Check if action is provided
if [[ -z "$action" ]]; then
    echo "No action provided. Please specify either 'broadcast' or 'messageParty'."
    exit 1
fi

# Check if message is provided
if [[ -z "$3" && "$action" == "messageParty" ]] || [[ -z "$2" && "$action" == "broadcast" ]]; then
    echo "No message provided. Please specify a message."
    exit 1
fi

if [ "$action" == "broadcast" ]; then
    msg=$2
    curl -d "msg=$msg" -H "Content-Type: application/x-www-form-urlencoded" -X POST http://localhost:8081/broadcast/chat
elif [ "$action" == "messageParty" ]; then
    partyId=$2
    msg=$3
    # Check if partyId is provided
    if [[ -z "$partyId" ]]; then
        echo "No partyId provided. Please specify a partyId."
        exit 1
    fi
    curl -d "msg=$msg" -H "Content-Type: application/x-www-form-urlencoded" -X POST http://localhost:8081/parties/$partyId/chat
else
    echo "Invalid action. Please specify either 'broadcast' or 'messageParty'."
    exit 1
fi
