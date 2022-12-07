#!/bin/bash
partyId=$1
msg=$2
curl -d "msg=$msg" -H "Content-Type: application/x-www-form-urlencoded" -X POST http://localhost:8081/parties/$partyId/chat
