const fetch = require("node-fetch");
const crypto = require("crypto");

function md5(str) {
  return crypto.createHash("md5").update(str).digest("hex");
}

async function updateMailchimpMergeField({ email, code }) {
  const apiKey = process.env.MAILCHIMP_API_KEY;
  const dc = process.env.MAILCHIMP_SERVER_PREFIX; // e.g. "us21"
  const listId = process.env.MAILCHIMP_LIST_ID;

  if (!apiKey || !dc || !listId) {
    throw new Error("Missing Mailchimp env vars (MAILCHIMP_API_KEY, MAILCHIMP_SERVER_PREFIX, MAILCHIMP_LIST_ID)");
  }

  const subscriberHash = md5(email.trim().toLowerCase());
  const url = `https://${dc}.api.mailchimp.com/3.0/lists/${listId}/members/${subscriberHash}`;

const res = await fetch(url, {
  method: "PATCH",
  headers: {
    "Content-Type": "application/json",
    Authorization: "Basic " + Buffer.from(`anystring:${apiKey}`).toString("base64"),
  },
  body: JSON.stringify({
    merge_fields: { FIRSTFREE: code },
  }),
});

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  if (!res.ok) {
    throw new Error(`Mailchimp update failed (${res.status}): ${JSON.stringify(data)}`);
  }

  return data;
}

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const email = body.email;

    if (!email) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing email" }) };
    }

    // 10-day rolling expiry
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 10);

    // Create voucher in Voucherify (US1 endpoint)
    const voucherRes = await fetch("https://us1.api.voucherify.io/v1/vouchers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-App-Id": process.env.VOUCHERIFY_APP_ID,
        "X-App-Token": process.env.VOUCHERIFY_APP_TOKEN,
      },
      body: JSON.stringify({
        campaign: "camp_dB6P28BqHvC6yWsfdgDASLt6",
        expiration_date: expiresAt.toISOString(),
        customer: { email },
        metadata: { source: "mailchimp", audience: "AMPIDtest", offer: "first_trip_free" },
      }),
    });

    const voucherData = await voucherRes.json();

    if (!voucherRes.ok) {
      return {
        statusCode: voucherRes.status,
        body: JSON.stringify({ error: "Voucherify error", details: voucherData }),
      };
    }

    const code = voucherData.code;

    // Write code back to Mailchimp merge field FIRSTFREE
    await updateMailchimpMergeField({ email, code });

    return { statusCode: 200, body: JSON.stringify({ code }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};