#!/bin/bash
msg=$1
curl -d "msg=$msg" -H "Content-Type: application/x-www-form-urlencoded" -X POST http://localhost:8081/broadcast/chat
#echo curl -d \"msg=$msg\" -H \"Content-Type: application/x-www-form-urlencoded\" -X POST http://localhost:8081/broadcast/chat
