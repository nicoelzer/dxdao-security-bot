require("dotenv").config();
const got = require("got");
const axios = require("axios");

async function createGithubIssue(title, body, label) {
  try {
    const issueHeaders = {
      headers: { Authorization: `token ${process.env.GITHUB_TOKEN}` },
    };

    const projectHeaders = {
      headers: {
        Authorization: `token ${process.env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github.inertia-preview+json",
      },
    };

    let createIssue = await axios.post(
      `${process.env.GITHUB_REPO}/issues`,
      {
        title,
        body,
        labels: [label],
      },
      issueHeaders
    );

    let issueId = createIssue.data.id;

    await axios.post(
      `https://api.github.com/projects/columns/${process.env.GITHUB_CARD_ID}/cards`,
      {
        content_id: issueId,
        content_type: "Issue",
      },
      projectHeaders
    );
  } catch (err) {
    console.log(err);
  }
}

module.exports = {
  createGithubIssue,
};
