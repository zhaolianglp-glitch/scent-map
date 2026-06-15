#!/bin/bash
TOKEN=$(cat "$HERMES_WEB_UI_HOME/.token" | tr -d '\n\r')

curl -sS -X POST "http://127.0.0.1:8648/api/hermes/media/apikey-image-generate" \
  -H "Authorization: Bearer *** \
  -H "X-Hermes-Profile: default" \
  -H 'Content-Type: application/json' \
  -d @ladybug-request.json
