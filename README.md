# DXdao Security Bot

## Install

Install depenencies with `yarn`

Make sure to copy the .env.example as .env and provide all the required information.

```
KB_USERNAME=user1
KB_PAPERKEY="fuel car ..."
INFURAKEY="e6e7b..."
ETHERSCAN_APIKEY="6B66..."
STARTING_BLOCK=8145768
```

The schedule of the different bot jobs can be set in milliseconds:
SCAN_SCHEMES_INTERVAL=3600000 #60 minutes
SCAN_PROPOSALS_INTERVAL=180000 #3 minutes
SECURITY_AUDIT_INTERVAL=86400000 #24 hours

## Commands

Start the bot with `yarn start`.
