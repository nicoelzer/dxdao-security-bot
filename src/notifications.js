require("dotenv").config();
const Bot = require("keybase-bot");
var dateFormat = require("dateformat");
const Web3 = require("web3");
const web3 = new Web3(
  new Web3.providers.HttpProvider(
    `https://mainnet.infura.io/v3/${process.env.INFURAKEY}`
  )
);
var messageContent;

async function sendNotification(data, template) {
  switch (template) {
    case "errorAlert":
      if (process.env.MODE == 1) {
        sendKeybaseMessage("dx_dao", "Security", data);
      } else {
        console.log(data);
      }

      break;

    case "newProposal":
      messageContent = `🤖 New *${data.proposal.schemeName}* proposal\n${
        data.proposal.proposalLink
      }\n\n*Title:* ${data.proposal.proposalTitle}\n\n*Risk Score:* ${
        data.proposal.riskScore
      }\n\n*Creator:* ${Math.round(data.proposal.creatorRep)} REP (${(
        (data.proposal.creatorRep /
          web3.utils.fromWei(totalRepSupply, "ether")) *
        100
      ).toFixed(2)} %)  \n\n`;
      if (data.proposal.valueEth > 0 || data.proposal.valueExternalToken > 0) {
        messageContent += `*Value & Token Transfers:*\n`;
        if (data.proposal.valueEth > 0) {
          messageContent += `${web3.utils.fromWei(
            data.proposal.valueEth.toString(),
            "ether"
          )} ETH ➡️ ${data.proposal.beneficiary}\n`;
        }
        if (data.proposal.valueExternalToken > 0) {
          let valToken = data.proposal.valueExternalToken;
          messageContent += `${(
            valToken /
            10 ** data.proposal.externalTokenDecimals
          ).toFixed()} ${data.proposal.externalTokenSymbol} ➡️  ${
            data.proposal.beneficiary
          }\nTokenAddress: ${data.proposal.externalTokenAddress}\n `;
        }
        messageContent += `\n`;
      } else {
        messageContent += `*Value & Token Transfers:*\nNo transfers\n\n`;
      }
      if (data.proposal.valueRep > 0) {
        messageContent += `*Reputation:*\n${Math.round(
          web3.utils.fromWei(data.proposal.valueRep.toString(), "ether")
        )} REP (${(
          (web3.utils.fromWei(data.proposal.valueRep.toString(), "ether") /
            web3.utils.fromWei(totalRepSupply, "ether")) *
          100
        ).toFixed(2)} %) ➡️  ${data.proposal.beneficiary}\n\n`;
      } else {
        messageContent += `*Reputation:*\nNo REP distributions\n\n`;
      }
      if (data.proposal.decodedCallData) {
        messageContent += `*Function Call to be executed:*\n${data.proposal.decodedCallData}\n\n`;
        messageContent += `Raw Calldata: ${data.proposal.callData}\n\n`;
      }
      if(data.proposal.tenderlySimulation){
        messageContent += `\n\n*Simulation:* ${data.proposal.tenderlySimulation}\n\n`;
      }
      messageContent += `*Transaction:* ${data.proposal.transactionUrl}\n`;
      messageContent += `*Raw Transaction Log*: https://gateway.pinata.cloud/ipfs/${data.logHash}\n`;

      if (process.env.MODE == 1) {
        sendKeybaseMessage("dx_dao", "Security", messageContent);
      } else {
        console.log(messageContent);
      }

      break;

    case "securityAudit":
      messageContent = `*Daily Security Audit ${dateFormat(
        new Date(),
        "dd/mm/yy"
      )}*\n\n`;
      messageContent += `*Monitoring ${data.scheme.length} Schemes on DXdao:*\n`;
      data.scheme.forEach((element) => {
        messageContent += "• " + element.name + "\n";
      });

      messageContent += `\n\n*All open proposals:*\n\n`;

      data.activeProposals.forEach((proposal) => {
        messageContent += `*${proposal.proposalTitle}*`;
        if (proposal.winningVote == 1) {
          messageContent += ` – Proposal will pass ✅`;
        } else {
          messageContent += ` – Proposal will fail ❌`;
        }
        if(proposal.tenderlySimulation){
          messageContent += `\n\n*Simulation:* ${proposal.tenderlySimulation}\n`;
        }
        messageContent += `\n${proposal.proposalLink}\n`;
        messageContent += `Status: ${proposal.state}\n\n`;
      });

      messageContent += `\n\nScheme Raw Log: https://gateway.pinata.cloud/ipfs/${data.schemeLog}\n`;
      messageContent += `Proposals Raw Log: https://gateway.pinata.cloud/ipfs/${data.proposalLog}`;

      if (process.env.MODE == 1) {
        sendKeybaseMessage("dx_dao", "Security", messageContent);
      } else {
        console.log(messageContent);
      }

      break;
  }
}

async function sendKeybaseMessage(team, topicName, messageContent) {
  const bot = new Bot();
  try {
    const username = process.env.KB_USERNAME;
    const paperkey = process.env.KB_PAPERKEY;
    await bot.init(username, paperkey, { verbose: false });
    const channel = {
      name: team,
      membersType: "team",
      topicType: "chat",
      topicName: topicName,
    };
    const message = {
      body: messageContent,
    };
    await bot.chat.send(channel, message);
  } catch (error) {
    console.error(error);
  } finally {
    await bot.deinit();
  }
}

module.exports = {
  sendNotification,
};
