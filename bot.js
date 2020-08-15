require("dotenv").config();
const got = require("got");
const Web3 = require("web3");
const low = require("lowdb");
const FileSync = require("lowdb/adapters/FileSync");
const schemeAdapter = new FileSync("./src/data/schemes.json");
const schemeDB = low(schemeAdapter);
const { contracts } = require("./src/data/baseContracts.js");
var dateFormat = require("dateformat");
var express = require("express");
var port = process.env.PORT || 3000;
var app = express();
const pinataSDK = require("@pinata/sdk");
const pinata = pinataSDK(process.env.PINATA_KEY, process.env.PINATA_SECRET);
app.listen(port, function () {});
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const web3 = new Web3(
  new Web3.providers.HttpProvider(
    `https://${process.env.NETWORK}.infura.io/v3/${process.env.INFURAKEY}`
  )
);
const {
  getEvents,
  getProposalTitleByIpfsHash,
  calculateRiskRating,
  decodeCall,
  schemeExists,
  getSingleScheme,
  updateScheme,
  upsertScheme,
  upsertProposal,
} = require("./src/utils/utils.js");
const { sendNotification } = require("./src/notifications.js");

const ProposalState = {
  0: "None",
  1: "ExpiredInQueue",
  2: "Executed",
  3: "Queued",
  4: "PreBoosted",
  5: "Boosted",
  6: "QuietEndingPeriod",
};

var etherscanBaseUrl;
process.env.NETWORK == "mainnet"
  ? (etherscanBaseUrl = "https://api.etherscan.io/api")
  : (etherscanBaseUrl = `https://api-${process.env.NETWORK}.etherscan.io/api`);

async function getSchemes() {
  console.log("Scanning for new schemes...");
  var pluginManager = new web3.eth.Contract(
    contracts.schemeRegistrarAbi.abi,
    contracts.schemeRegistrarAbi.address
  );
  var controller = new web3.eth.Contract(
    contracts.DxController.abi,
    contracts.DxController.address
  );
  var plugins = await pluginManager.getPastEvents("NewSchemeProposal", {
    filter: {},
    fromBlock: process.env.STARTING_BLOCK,
    toBlock: "latest",
  });

  var schemesToProcess = [];
  for (var scheme of plugins) {
    const schemeInstalled = await controller.methods
      .isSchemeRegistered(
        scheme.returnValues._scheme,
        process.env.AVATAR_ADDRESS
      )
      .call();
    if (!schemeExists({ id: scheme.returnValues._scheme }) && schemeInstalled) {
      upsertScheme(
        { id: scheme.returnValues._scheme },
        {
          id: scheme.returnValues._scheme,
          address: scheme.returnValues._scheme,
          installationBlockNumber: scheme.blockNumber,
          lastBlockScanned: scheme.blockNumber,
        }
      );
      schemesToProcess.push({ address: scheme.returnValues._scheme });
    }
  }
  console.log(`Found ${schemesToProcess.length} new schemes.`);
  return schemesToProcess;
}

async function getSchemeDetails(schemeAddress) {
  console.log(`Getting details for new scheme ${schemeAddress}`);
  const getSchemeAbi = await got(
    `${etherscanBaseUrl}?module=contract&action=getabi&address=${schemeAddress}&apikey=${process.env.ETHERSCAN_APIKEY}`,
    { responseType: "json" }
  );
  const schemeAbi = JSON.parse(getSchemeAbi.body).result;

  let eventName;
  if (schemeAbi.includes("NewContributionProposal")) {
    eventName = "NewContributionProposal";
  } else if (schemeAbi.includes("NewSchemeProposal")) {
    eventName = "NewSchemeProposal";
  } else {
    eventName = "NewCallProposal";
  }
  updateScheme({ id: schemeAddress }, { abi: schemeAbi, eventName: eventName });

  if (schemeAbi.includes("getContractToCall")) {
    const scheme = new web3.eth.Contract(JSON.parse(schemeAbi), schemeAddress);
    const contractToCallAddress = await scheme.methods
      .getContractToCall(process.env.AVATAR_ADDRESS)
      .call();
    const getContractToCallAbi = await got(
      `${etherscanBaseUrl}?module=contract&action=getabi&address=${contractToCallAddress}&apikey=${process.env.ETHERSCAN_APIKEY}`,
      { responseType: "json" }
    );
    const contractToCallAbi = JSON.parse(getContractToCallAbi.body).result;
    updateScheme(
      { id: schemeAddress },
      {
        contractToCall: contractToCallAddress,
        contractToCallAbi: contractToCallAbi,
      }
    );
  } else if (schemeAbi.includes("_contractToCall")) {
    const scheme = new web3.eth.Contract(JSON.parse(schemeAbi), schemeAddress);
    const contractToCallAddress = await scheme.methods.contractToCall().call();
    const getContractToCallAbi = await got(
      `${etherscanBaseUrl}?module=contract&action=getabi&address=${contractToCallAddress}&apikey=${process.env.ETHERSCAN_APIKEY}`,
      { responseType: "json" }
    );
    const contractToCallAbi = JSON.parse(getContractToCallAbi.body).result;
    updateScheme(
      { id: schemeAddress },
      {
        contractToCall: contractToCallAddress,
        contractToCallAbi: contractToCallAbi,
      }
    );
  }
  if (schemeAbi.includes('"name":"votingMachine"')) {
    const scheme = new web3.eth.Contract(JSON.parse(schemeAbi), schemeAddress);
    const votingMachineAddress = await scheme.methods.votingMachine().call();
    const getVotingMachineAbi = await got(
      `${etherscanBaseUrl}?module=contract&action=getabi&address=${votingMachineAddress}&apikey=${process.env.ETHERSCAN_APIKEY}`,
      { responseType: "json" }
    );
    const votingMachineAbi = JSON.parse(getVotingMachineAbi.body).result;
    updateScheme(
      { id: schemeAddress },
      {
        votingMachineAddress: votingMachineAddress,
        votingMachineAbi: votingMachineAbi,
      }
    );
  }
}

async function getProposalDetails(schemeAddress, proposal) {
  try {
    var proposalId,
      proposalTitle,
      beneficiary,
      state,
      externalTokenAddress,
      externalTokenSymbol,
      externalTokenDecimals,
      valueExternalToken,
      valueRep,
      transactionUrl,
      proposalCreator,
      creatorRep,
      callData,
      winningVote,
      downstakes,
      upstakes,
      downvotes,
      upvotes,
      riskScore,
      decodedResult,
      getTokenABI,
      decodedFunction,
      valueEth,
      proposalTitle = "Untitled Proposal";
    const scheme = getSingleScheme({ id: schemeAddress });
    const genesisProtocol = new web3.eth.Contract(
      contracts.GenesisProtocol.abi,
      contracts.GenesisProtocol.address
    );
    const DxReputation = new web3.eth.Contract(
      contracts.DxReputation.abi,
      contracts.DxReputation.address
    );

    if (scheme.abi.includes('"name":"votingMachine"')) {
      const votingMachine = new web3.eth.Contract(
        JSON.parse(scheme.votingMachineAbi),
        scheme.votingMachineAddress
      );
      const proposalDetails = await votingMachine.methods
        .proposals(proposal.returnValues._proposalId)
        .call();
      upstakes = await genesisProtocol.methods
        .voteStake(proposal.returnValues._proposalId, 1)
        .call();
      downstakes = await genesisProtocol.methods
        .voteStake(proposal.returnValues._proposalId, 2)
        .call();
      upvotes = await genesisProtocol.methods
        .voteStatus(proposal.returnValues._proposalId, 1)
        .call();
      downvotes = await genesisProtocol.methods
        .voteStatus(proposal.returnValues._proposalId, 2)
        .call();
      totalRepSupply = await DxReputation.methods.totalSupply().call();
      proposalId = proposal.returnValues._proposalId;
      state = ProposalState[proposalDetails.state];
      winningVote = proposalDetails.winningVote;
      valueEth = proposal.returnValues._value;
      valueExternalToken = 0;
      valueRep = 0;
      transactionUrl = `https://etherscan.io/tx/${proposal.transactionHash}`;
      callData = proposal.returnValues._callData;
    } else if (scheme.address == "0x199719EE4d5DCF174B80b80afa1FE4a8e5b0E3A0") {
      const proposalDetails = await genesisProtocol.methods
        .proposals(proposal.returnValues._proposalId)
        .call();
      upstakes = await genesisProtocol.methods
        .voteStake(proposal.returnValues._proposalId, 1)
        .call();
      downstakes = await genesisProtocol.methods
        .voteStake(proposal.returnValues._proposalId, 2)
        .call();
      upvotes = await genesisProtocol.methods
        .voteStatus(proposal.returnValues._proposalId, 1)
        .call();
      downvotes = await genesisProtocol.methods
        .voteStatus(proposal.returnValues._proposalId, 2)
        .call();
      totalRepSupply = await DxReputation.methods.totalSupply().call();
      proposalId = proposal.returnValues._proposalId;
      state = ProposalState[proposalDetails.state];
      winningVote = proposalDetails.winningVote;
      valueEth = proposal.returnValues._value;
      valueExternalToken = 0;
      valueRep = 0;
      transactionUrl = `https://etherscan.io/tx/${proposal.transactionHash}`;
      callData = proposal.returnValues._callData;
    } else {
      const proposalDetails = await genesisProtocol.methods
        .proposals(proposal.returnValues._proposalId)
        .call();
      upstakes = await genesisProtocol.methods
        .voteStake(proposal.returnValues._proposalId, 1)
        .call();
      downstakes = await genesisProtocol.methods
        .voteStake(proposal.returnValues._proposalId, 2)
        .call();
      upvotes = await genesisProtocol.methods
        .voteStatus(proposal.returnValues._proposalId, 1)
        .call();
      downvotes = await genesisProtocol.methods
        .voteStatus(proposal.returnValues._proposalId, 2)
        .call();
      totalRepSupply = await DxReputation.methods.totalSupply().call();
      if (proposal.returnValues._externalToken) {
        if (
          proposal.returnValues._externalToken ==
          "0xa1d65E8fB6e87b60FECCBc582F7f97804B725521"
        ) {
          getTokenABI = await got(
            `${etherscanBaseUrl}?module=contract&action=getabi&address=0x845856776d110a200cf41f35c9428c938e72e604&apikey=${process.env.ETHERSCAN_APIKEY}`,
            { responseType: "json" }
          );
        } else {
          getTokenABI = await got(
            `${etherscanBaseUrl}?module=contract&action=getabi&address=${proposal.returnValues._externalToken}&apikey=${process.env.ETHERSCAN_APIKEY}`,
            { responseType: "json" }
          );
        }
        const tokenAbi = await JSON.parse(getTokenABI.body).result;
        const tokenContract = new web3.eth.Contract(
          JSON.parse(tokenAbi),
          proposal.returnValues._externalToken
        );
        externalTokenSymbol = await tokenContract.methods.symbol().call();
        externalTokenDecimals = await tokenContract.methods.decimals().call();
      }
      proposalId = proposal.returnValues._proposalId;
      state = ProposalState[proposalDetails.state];
      winningVote = proposalDetails.winningVote;
      if (proposal.returnValues._rewards) {
        valueEth = proposal.returnValues._rewards[1];
        valueExternalToken = proposal.returnValues._rewards[2];
      } else {
        valueEth = 0;
        valueExternalToken = 0;
      }
      (externalTokenAddress = proposal.returnValues._externalToken),
        (beneficiary = proposal.returnValues._beneficiary);
      valueRep = proposal.returnValues._reputationChange;
      transactionUrl = `https://etherscan.io/tx/${proposal.transactionHash}`;
    }
    if (proposal.returnValues._callData) {
      let decodedResult = await decodeCall(
        JSON.parse(scheme.contractToCallAbi),
        proposal.returnValues._callData
      );
      if (decodedResult) {
        decodedFunction = `${decodedResult.name}(`;
        decodedResult.params.forEach((param) => {
          decodedFunction += `${param.value},`;
        });
        decodedFunction += ")";
      }
    }

    let getTransaction = await web3.eth.getTransaction(
      proposal.transactionHash
    );
    proposalCreator = getTransaction.from;
    proposalTitle = await getProposalTitleByIpfsHash(
      proposal.returnValues._descriptionHash
    );
    const DXRepContract = new web3.eth.Contract(
      contracts.DxReputation.abi,
      contracts.DxReputation.address
    );

    const getMemberRep = await DXRepContract.methods
      .balanceOf(proposalCreator)
      .call();
    creatorRep = web3.utils.fromWei(getMemberRep, "ether");
    riskScore = calculateRiskRating(
      creatorRep.toString(),
      schemeAddress,
      valueEth.toString(),
      valueExternalToken.toString()
    );

    const proposalDetails = {
      proposalId,
      proposalLink: `https://alchemy.daostack.io/dao/${process.env.AVATAR_ADDRESS}/proposal/${proposalId}`,
      schemeAddress,
      schemeName: scheme.name,
      proposalTitle,
      valueEth,
      valueExternalToken,
      externalTokenAddress,
      externalTokenSymbol,
      externalTokenDecimals,
      valueRep,
      beneficiary,
      transactionUrl,
      proposalCreator,
      creatorRep,
      callData,
      decodedCallData: decodedFunction,
      riskScore,
      winningVote,
      upstakes,
      downstakes,
      upvotes,
      downvotes,
      state,
      transactionDetails: proposal,
    };
    upsertProposal(
      { id: proposalId },
      { id: proposalId, ...proposalDetails, transactionDetails: proposal }
    );

    return proposalDetails;
  } catch (err) {
    console.log(err);
  }
}

async function scanForSchemes() {
  try {
    const newSchemes = await getSchemes();
    for (var i in newSchemes) {
      await sleep(1000);
      getSchemeDetails(newSchemes[i].address);
    }
  } catch (err) {
    sendNotification(
      "Unable to scan for new Schemes. Check logs for details",
      "errorAlert"
    );
    console.log(err);
  }
}

async function scanForProposals() {
  try {
    let filter = {};
    let scheme = await schemeDB.get("schemes").value();
    const latestBlock = await web3.eth.getBlockNumber();
    for (var i in scheme) {
      if (scheme[i].eventName == "NewContributionProposal") {
        filter = { _avatar: process.env.AVATAR_ADDRESS };
      }
      const proposals = await getEvents(
        scheme[i].address,
        scheme[i].lastBlockScanned,
        scheme[i].eventName,
        filter,
        JSON.parse(scheme[i].abi)
      );
      console.log(
        `Found ${proposals.events.length} new proposals on Scheme ${scheme[i].name}`
      );
      for (var j in proposals.events) {
        await sleep(50);
        try {
          const proposal = await getProposalDetails(
            proposals.schemeAddress,
            proposals.events[j]
          );
          const getHash = await pinata.pinJSONToIPFS(proposal);
          const logHash = getHash.IpfsHash;
          sendNotification(
            { proposal: proposal, logHash: logHash },
            "newProposal"
          );
        } catch (err) {
          console.log(err);
        }
      }
      updateScheme(
        { id: scheme[i].address },
        { lastBlockScanned: latestBlock }
      );
    }
  } catch (err) {
    sendNotification(
      "Unable to scan for new Proposals. Check logs for details",
      "errorAlert"
    );
    console.log(err);
  }
}

async function securityAudit() {
  try {
    let auditMessage;
    console.log("Started Security Audit...");
    var activeProposals = [];
    let scheme = await schemeDB.get("schemes").value();
    console.log("-- Scanning for active proposals");
    console.log(`Daily Security Audit ${dateFormat(new Date(), "dd/mm/yy")}`);
    console.log(`Monitoring ${scheme.length} Schemes on DXdao:`);
    scheme.forEach((element) => {
      console.log("• " + element.name);
    });
    let filter = {};
    for (var i in scheme) {
      console.log(
        `Searching for active proposals on scheme ${scheme[i].name} (${scheme[i].address})...`
      );
      if (scheme[i].eventName == "NewContributionProposal") {
        filter = { _avatar: process.env.AVATAR_ADDRESS };
      }
      const proposals = await getEvents(
        scheme[i].address,
        process.env.STARTING_BLOCK,
        scheme[i].eventName,
        filter,
        JSON.parse(scheme[i].abi)
      );
      for (var j in proposals.events) {
        await sleep(50);
        try {
          console.log(
            `-- Found proposal ${proposals.events[j].returnValues._proposalId}`
          );
          const proposal = await getProposalDetails(
            proposals.schemeAddress,
            proposals.events[j]
          );
          if (
            proposal.state != "ExpiredInQueue" &&
            proposal.state != "Executed"
          ) {
            activeProposals.push(proposal);
          }
        } catch (err) {
          console.log(err);
        }
      }
    }

    let schemeLog, proposalLog;
    try {
      const getSchemeLog = await pinata.pinJSONToIPFS(scheme);
      schemeLog = getSchemeLog.IpfsHash;

      const getProposalLog = await pinata.pinJSONToIPFS(activeProposals);
      proposalLog = getProposalLog.IpfsHash;
    } catch (err) {
      console.log(err);
    }

    console.log("Finished audit...");
    sendNotification(
      {
        scheme: scheme,
        activeProposals: activeProposals,
        schemeLog: schemeLog,
        proposalLog: proposalLog,
      },
      "securityAudit"
    );
  } catch (err) {
    console.log(err);
    sendNotification(
      "Unable to run daily security audit. Check logs for details",
      "errorAlert"
    );
  }
}

//scanForSchemes();
//securityAudit();
scanForProposals();

setInterval(scanForSchemes, process.env.SCAN_SCHEMES_INTERVAL);
setInterval(scanForProposals, process.env.SCAN_PROPOSALS_INTERVAL);
setInterval(securityAudit, process.env.SECURITY_AUDIT_INTERVAL);
