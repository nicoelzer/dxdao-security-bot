require("dotenv").config();
const got = require("got");
const Web3 = require("web3");
const web3 = new Web3(
  new Web3.providers.HttpProvider(
    `https://${process.env.NETWORK}.infura.io/v3/${process.env.INFURAKEY}`
  )
);
const abiDecoder = require("abi-decoder");
const low = require("lowdb");
const FileSync = require("lowdb/adapters/FileSync");
const schemeAdapter = new FileSync("./src/data/schemes.json");
const proposalsAdapter = new FileSync("./src/data/proposals.json");
const schemeDB = low(schemeAdapter);
const proposalsDB = low(proposalsAdapter);

async function getEvents(
  contractAddress,
  startBlock,
  eventName,
  filter,
  contractAbi
) {
  const latestBlock = await web3.eth.getBlockNumber();
  const contract = new web3.eth.Contract(contractAbi, contractAddress);
  var events = await contract.getPastEvents(eventName, {
    filter: filter,
    fromBlock: startBlock,
    toBlock: latestBlock,
  });
  return { schemeAddress: contractAddress, events: events };
}

async function getProposalTitleByIpfsHash(ipfsHash) {
  return new Promise((resolve, reject) => {
    if (
      ipfsHash ===
        "0x0000000000000000000000000000000000000000000000000000000000000000" ||
      /^\/ipfs\/Qm[1-9A-HJ-NP-Za-km-z]{44}(\/.*)?|^\/ipns\/.+/.test(ipfsHash) ||
      ipfsHash.startsWith("0x")
    ) {
      resolve("Untitled Proposal");
    } else {
      got(`https://gateway.ipfs.io/ipfs/${ipfsHash}`, {
        responseType: "json",
      }).then(
        (res) => {
          resolve(JSON.parse(res.body).title);
        },
        (err) => {
          reject(err);
        }
      );
    }
  });
}

function calculateRiskRating(creatorRep, scheme, valueEth, valueExternalToken) {
  let riskScore = 0;
  let riskRating = "🔴 High";
  let schemeRisk = schemeDB.get("schemes").find({ id: scheme }).value();
  if (!schemeRisk) {
    riskScore += 300;
  } else if (schemeRisk.risk === "Low") {
    riskScore += 0;
  } else {
    riskScore += 300;
  }
  if (creatorRep < 1000) {
    riskScore += 300;
  }
  if (web3.utils.fromWei(valueEth, "ether") > 0) {
    riskScore += 100;
  }
  if (web3.utils.fromWei(valueEth, "ether") > 10) {
    riskScore += 200;
  }
  if (web3.utils.fromWei(valueExternalToken, "ether") > 0) {
    riskScore += 100;
  }
  if (web3.utils.fromWei(valueExternalToken, "ether") > 10) {
    riskScore += 200;
  }
  if (riskScore < 100) {
    riskRating = "🟢 Low";
  } else if (riskScore > 100 && riskScore < 300) {
    riskRating = "🟠 Medium";
  } else {
    riskRating = "🔴 High";
  }
  return riskRating;
}

function decodeCall(abi, method) {
  abiDecoder.addABI(abi);
  decodedData = abiDecoder.decodeMethod(method);
  return decodedData;
}

async function simulateTransaction(contractToCall, callData, value){

  var httpheaders = {
    'Accept': 'application/json',
    'X-Access-Key': process.env.TENDERLY_ACCESS_KEY
  }

  var payload = {
    "network_id": "1",
    "from": process.env.AVATAR_ADDRESS,
    "to": contractToCall,
    "input": callData,
    "gas": 10000000,
    "value": value,
    "save": true,
    "save_if_fails": true
  }

  const {body} = await got.post(`${process.env.TENDERLY_BASE_API}/simulate`, {
    headers: httpheaders,
    json: true,
    body: payload
  });
  
  return `${process.env.TENDERLY_BASE_DASHBOARD}/simulator/${body.simulation.id}`
}

function schemeExists(filter) {
  return schemeDB.get("schemes").find(filter).value() ? true : false;
}

function getSingleScheme(filter) {
  return schemeDB.get("schemes").find(filter).value();
}

function updateScheme(filter, update) {
  schemeDB.get("schemes").chain().find(filter).assign(update).write();
}

function upsertScheme(filter, upsert) {
  if (!schemeExists(filter)) {
    schemeDB.get("schemes").push(upsert).write();
    return "Insert";
  } else {
    schemeDB.get("schemes").chain().find(filter).assign(upsert).write();
    return "Update";
  }
}

function proposalExists(filter) {
  return proposalsDB.get("proposals").find(filter).value() ? true : false;
}

function getSingleProposal(filter) {
  return proposalsDB.get("proposals").find(filter).value();
}

function updateProposal(filter, update) {
  proposalsDB.get("proposals").chain().find(filter).assign(update).write();
}

function upsertProposal(filter, upsert) {
  if (!schemeExists(filter)) {
    proposalsDB.get("proposals").push(upsert).write();
    return "Insert";
  } else {
    proposalsDB.get("proposals").chain().find(filter).assign(upsert).write();
    return "Update";
  }
}

module.exports = {
  getEvents,
  getProposalTitleByIpfsHash,
  calculateRiskRating,
  decodeCall,
  schemeExists,
  getSingleScheme,
  updateScheme,
  upsertScheme,
  upsertProposal,
  simulateTransaction,
};
