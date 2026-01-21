const fetch = require("node-fetch");

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const email = body.email;

    if (!email) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing email" })
      };
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 10);

const res = await fetch("https://us1.api.voucherify.io/v1/vouchers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-App-Id": process.env.VOUCHERIFY_APP_ID,
        "X-App-Token": process.env.VOUCHERIFY_APP_TOKEN
      },
      body: JSON.stringify({
        campaign: "camp_dB6P28BqHvC6yWsfdgDASLt6", // IMPORTANT: use campaign ID, not name
        expiration_date: expiresAt.toISOString(),
        customer: { email },
        metadata: {
          source: "mailchimp",
          audience: "AMPID",
          offer: "first_trip_free"
        }
      })
    });

    const data = await res.json();

    if (!res.ok) {
      return {
        statusCode: res.status,
        body: JSON.stringify({
          error: "Voucherify error",
          details: data
        })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ code: data.code })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};