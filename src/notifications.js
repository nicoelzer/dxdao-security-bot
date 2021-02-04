require("dotenv").config();
const Bot = require("keybase-bot");
var dateFormat = require("dateformat");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const Web3 = require("web3");
const web3 = new Web3(
  new Web3.providers.HttpProvider(
    `https://mainnet.infura.io/v3/${process.env.INFURAKEY}`
  )
);
const { getSingleScheme } = require("./utils/utils.js");

const { createGithubIssue } = require("./github.js");
var messageContent;
var completeMessage;

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

      if (data.proposal.schemeName == "MultiCall") {
        // MultiCall Proposals

        for (i = 0; i < data.proposal.multicallContractsToCall.length; i++) {
          messageContent += `* –––––––––––––– CALL ${[i + 1]} OF ${
            data.proposal.multicallContractsToCall.length
          }: ––––––––––––––  *\n`;

          if (data.proposal.multicallValues[i] > 0) {
            messageContent += `\t*Value & Token Transfers:*\n`;
            messageContent += `\t${web3.utils.fromWei(
              data.proposal.multicallValues[i].toString(),
              "ether"
            )} ETH ➡️ ${data.proposal.multicallContractsToCall[i]}\n`;
          } else {
            messageContent += `\t*Value & Token Transfers:*\n\tNo transfers\n`;
          }
          messageContent += `\n\t*Function Call to be executed:*\n\t${data.proposal.multicallDecoded[i]}\n`;
          messageContent += `\n\t*Target Contract:* https://etherscan.io/address/${data.proposal.multicallContractsToCall[i]}\n`;
          messageContent += `\n\t*Raw Calldata:* \n\t${data.proposal.multicallCallDatas[i]}\n`;
          messageContent += `\n\t*Simulation:* ${data.proposal.multicallSimulations[i]}\n\n`;
        }

        messageContent += `* –––––––––––––– END CALLS ––––––––––––––  *\n\n`;
      } else {
        // Non-MultiCall Proposals
        if (
          data.proposal.valueEth > 0 ||
          data.proposal.valueExternalToken > 0
        ) {
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
          messageContent += `*Value & Token Transfers:*\nNo transfers\n`;
        }

        if (data.proposal.decodedCallData) {
          messageContent += `*Function Call to be executed:*\n${data.proposal.decodedCallData}\n\n`;
          messageContent += `Raw Calldata: ${data.proposal.callData}\n\n`;
        }
        if (data.proposal.tenderlySimulation) {
          messageContent += `\n\n*Simulation:* ${data.proposal.tenderlySimulation}\n\n`;
        }
      }

      messageContent += `*Transaction:* ${data.proposal.transactionUrl}\n`;
      messageContent += `*Raw Transaction Log*: https://gateway.pinata.cloud/ipfs/${data.logHash}\n\n`;

      if (process.env.MODE == 1) {
        //sendKeybaseMessage("dx_dao", "Security", messageContent);
        createGithubIssue(
          data.proposal.proposalTitle,
          messageContent,
          data.proposal.schemeName
        );
      } else {
        console.log(messageContent);
      }

      break;

    case "securityAudit":
      messageContent = `*Daily Security Audit ${dateFormat(
        new Date(),
        "dd/mm/yy"
      )}*\n\n`;
      let schemeDetail;
      messageContent += `*Monitoring ${data.scheme.length} Schemes on DXdao:*\n`;
      data.scheme.forEach((element) => {
        schemeDetail = getSingleScheme({ id: element.address });
        messageContent +=
          "• " +
          element.name +
          " (" +
          schemeDetail.openProposals +
          " proposals)\n";
      });

      messageContent += `\n\n*All open proposals:*\n\n`;

      data.activeProposals.forEach((proposal) => {
        messageContent += `*${proposal.proposalTitle}*`;
        if (proposal.winningVote == 1) {
          messageContent += ` – Proposal will pass ✅`;
        } else {
          messageContent += ` – Proposal will fail ❌`;
        }
        if (proposal.tenderlySimulation) {
          messageContent += `\n\n*Simulation:* ${proposal.tenderlySimulation}\n`;
        }

        if (proposal.schemeName == "MultiCall") {
          // MultiCall Proposals

          for (i = 0; i < proposal.multicallContractsToCall.length; i++) {
            messageContent += `* –––––––––––––– CALL ${[i + 1]} OF ${
              proposal.multicallContractsToCall.length
            }: ––––––––––––––  *\n`;

            if (proposal.multicallValues[i] > 0) {
              messageContent += `\t*Value & Token Transfers:*\n`;
              messageContent += `\t${web3.utils.fromWei(
                proposal.multicallValues[i].toString(),
                "ether"
              )} ETH ➡️ ${proposal.multicallContractsToCall[i]}\n`;
            } else {
              messageContent += `\t*Value & Token Transfers:*\n\tNo transfers\n`;
            }
            messageContent += `\n\t*Function Call to be executed:*\n\t${proposal.multicallDecoded[i]}\n`;
            messageContent += `\n\t*Target Contract:* https://etherscan.io/address/${proposal.multicallContractsToCall[i]}\n`;
            messageContent += `\n\t*Raw Calldata:* \n\t${proposal.multicallCallDatas[i]}\n`;
            messageContent += `\n\t*Simulation:* ${proposal.multicallSimulations[i]}\n\n`;
          }

          messageContent += `* –––––––––––––– END CALLS ––––––––––––––  *\n\n`;
        }

        messageContent += `\n${proposal.proposalLink}\n`;
        messageContent += `Status: ${proposal.state}\n\n`;

        // prevention for messages that are getting too long. Multiple messages will be sent.
        if (messageContent.length > 5000) {
          completeMessage += messageContent;
          sendKeybaseMessage("dx_dao", "Security", messageContent);
          messageContent = "";
        }
      });

      messageContent += `\n\nScheme Raw Log: https://gateway.pinata.cloud/ipfs/${data.schemeLog}\n`;
      messageContent += `Proposals Raw Log: https://gateway.pinata.cloud/ipfs/${data.proposalLog}`;
      completeMessage += messageContent;

      if (process.env.MODE == 1) {
        await sleep(9000);
        sendKeybaseMessage("dx_dao", "Security", messageContent);
        /*
        createGithubIssue(`Manual Security Check ${dateFormat(
          new Date(),
          "dd/mm/yy"
        )}`, "");
        */
      } else {
        console.log(completeMessage);
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
