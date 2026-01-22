// netlify/functions/createFirstTripVoucher.js
const fetch = require("node-fetch"); // v2
const crypto = require("crypto");

exports.handler = async (event) => {
  try {
    // Only allow POST (optional but recommended)
    if (event.httpMethod && event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: "Method Not Allowed" }),
      };
    }

    const body = JSON.parse(event.body || "{}");
    const emailRaw = (body.email || "").trim();

    if (!emailRaw) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing email" }) };
    }

    const email = emailRaw.toLowerCase();

    // 1) Create a unique voucher in Voucherify (expires 10 days from now)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 10);

    const voucherifyRes = await fetch("https://us1.api.voucherify.io/v1/vouchers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-App-Id": process.env.VOUCHERIFY_APP_ID,
        "X-App-Token": process.env.VOUCHERIFY_APP_TOKEN,
      },
      body: JSON.stringify({
        // Use campaign ID (you already switched to this successfully)
        campaign: process.env.VOUCHERIFY_CAMPAIGN_ID, // e.g. camp_dB6P28BqHvC6yWsfdgDASLt6
        expiration_date: expiresAt.toISOString(),
        customer: { email },
        metadata: {
          source: "mailchimp",
          audience: process.env.MAILCHIMP_AUDIENCE_TAG || "AMPIDtest",
          offer: "first_trip_free",
        },
      }),
    });

    const voucherifyData = await voucherifyRes.json();

    if (!voucherifyRes.ok) {
      return {
        statusCode: voucherifyRes.status,
        body: JSON.stringify({ error: "Voucherify error", details: voucherifyData }),
      };
    }

    const code = voucherifyData.code;

    // 2) Update Mailchimp merge field for that subscriber
    // Mailchimp member hash = MD5(lowercase(email))
    const subscriberHash = crypto.createHash("md5").update(email).digest("hex");

    const serverPrefix = process.env.MAILCHIMP_SERVER_PREFIX; // like "us21"
    const listId = process.env.MAILCHIMP_LIST_ID;
    const apiKey = process.env.MAILCHIMP_API_KEY;

    if (!serverPrefix || !listId || !apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "Missing Mailchimp env vars (MAILCHIMP_SERVER_PREFIX, MAILCHIMP_LIST_ID, MAILCHIMP_API_KEY)",
        }),
      };
    }

    const mcUrl = `https://${serverPrefix}.api.mailchimp.com/3.0/lists/${listId}/members/${subscriberHash}`;

    // Mailchimp auth: Basic base64("anystring:apikey")
    const auth = "Basic " + Buffer.from(`anystring:${apiKey}`).toString("base64");

    const mailchimpRes = await fetch(mcUrl, {
      method: "PATCH",
      headers: {
        Authorization: auth,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        merge_fields: {
          FIRSTFREE: code,
          ADDRESS: "", // prevents “Please enter a complete address” from partial legacy data
        },
      }),
    });

    const mailchimpText = await mailchimpRes.text();
    let mailchimpData;
    try {
      mailchimpData = JSON.parse(mailchimpText);
    } catch {
      mailchimpData = mailchimpText;
    }

    if (!mailchimpRes.ok) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: `Mailchimp update failed (${mailchimpRes.status}): ${typeof mailchimpData === "string" ? mailchimpData : JSON.stringify(mailchimpData)}`,
        }),
      };
    }

    // Done
    return {
      statusCode: 200,
      body: JSON.stringify({ code }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};