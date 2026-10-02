export default {
    async fetch(request, env, ctx) {

        const url = new URL(request.url);

        // =========================================================
        // CORS
        // =========================================================

        if (request.method === "OPTIONS") {
            return new Response(null, {
                status: 204,
                headers: corsHeaders()
            });
        }

        // =========================================================
        // HEALTH CHECK
        // =========================================================

        if (
            request.method === "GET" &&
            url.pathname === "/health"
        ) {
            return json({
                success: true,
                service: "PDF Instruction Gateway",
                version: "1.0.0"
            });
        }

        // =========================================================
        // UNINSTALL / UNSUBSCRIBE REQUEST
        // =========================================================

        if (
            request.method === "POST" &&
            url.pathname === "/api/uninstall"
        ) {
            try {

                // -------------------------------------------------
                // Validate Content-Type
                // -------------------------------------------------

                const contentType =
                    request.headers.get("content-type") || "";

                if (
                    !contentType
                        .toLowerCase()
                        .includes("application/json")
                ) {
                    return json({
                        success: false,
                        message: "Invalid request format."
                    }, 400);
                }

                // -------------------------------------------------
                // Read JSON body
                // -------------------------------------------------

                let data;

                try {
                    data = await request.json();
                }
                catch {
                    return json({
                        success: false,
                        message: "Invalid JSON request."
                    }, 400);
                }

                // -------------------------------------------------
                // Reason
                // -------------------------------------------------

                const reason =
                    typeof data.reason === "string"
                        ? data.reason.trim()
                        : "";

                if (!reason) {
                    return json({
                        success: false,
                        message: "Reason is required."
                    }, 400);
                }

                if (reason.length > 2000) {
                    return json({
                        success: false,
                        message: "Reason is too long."
                    }, 400);
                }

                // -------------------------------------------------
                // Page
                // -------------------------------------------------

                const page =
                    typeof data.page === "string"
                        ? data.page.trim().slice(0, 1000)
                        : "Unknown";

                // -------------------------------------------------
                // Timestamp
                // -------------------------------------------------

                const timestamp =
                    typeof data.timestamp === "string"
                        ? data.timestamp.slice(0, 100)
                        : new Date().toISOString();

                // -------------------------------------------------
                // Optional generated 256-character link
                // -------------------------------------------------
                //
                // The frontend can optionally send this value.
                // It is NOT required for the request to succeed.
                //

                const generatedLink =
                    typeof data.generatedLink === "string"
                        ? data.generatedLink.slice(0, 1000)
                        : "";

                // -------------------------------------------------
                // Client information
                // -------------------------------------------------

                const userAgent =
                    request.headers.get("user-agent") || "Unknown";

                const origin =
                    request.headers.get("origin") || "Unknown";

                // =================================================
                // TELEGRAM MESSAGE
                // =================================================

                let message =
`🔔 Uninstall / Unsubscribe Request

Reason:
${reason}

Page:
${page}

Time:
${timestamp}`;

                if (generatedLink) {
                    message +=
`

Generated Link:
${generatedLink}`;
                }

                message +=
`

Origin:
${origin}

User Agent:
${userAgent}`;

                // =================================================
                // VALIDATE TELEGRAM CONFIGURATION
                // =================================================

                if (!env.TELEGRAM_BOT_TOKEN) {
                    console.error(
                        "Missing TELEGRAM_BOT_TOKEN secret."
                    );

                    return json({
                        success: false,
                        message: "Telegram configuration is missing."
                    }, 500);
                }

                if (!env.TELEGRAM_CHAT_ID) {
                    console.error(
                        "Missing TELEGRAM_CHAT_ID secret."
                    );

                    return json({
                        success: false,
                        message: "Telegram chat configuration is missing."
                    }, 500);
                }

                // =================================================
                // SEND TO TELEGRAM
                // =================================================

                const telegramUrl =
                    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;

                const telegramResponse =
                    await fetch(
                        telegramUrl,
                        {
                            method: "POST",

                            headers: {
                                "Content-Type":
                                    "application/json"
                            },

                            body: JSON.stringify({
                                chat_id:
                                    env.TELEGRAM_CHAT_ID,

                                text:
                                    message,

                                disable_web_page_preview:
                                    true
                            })
                        }
                    );

                // =================================================
                // TELEGRAM FAILURE
                // =================================================

                if (!telegramResponse.ok) {

                    const telegramError =
                        await telegramResponse.text();

                    console.error(
                        "Telegram API error:",
                        telegramError
                    );

                    return json({
                        success: false,
                        message:
                            "Unable to deliver notification."
                    }, 502);
                }

                // =================================================
                // SUCCESS
                // =================================================

                return json({
                    success: true,
                    message:
                        "Request submitted successfully."
                }, 200);

            }
            catch (error) {

                console.error(
                    "Uninstall endpoint error:",
                    error
                );

                return json({
                    success: false,
                    message:
                        "Internal server error."
                }, 500);
            }
        }

        // =========================================================
        // METHOD NOT ALLOWED
        // =========================================================

        if (
            url.pathname === "/api/uninstall"
        ) {
            return json({
                success: false,
                message: "Method not allowed."
            }, 405);
        }

        // =========================================================
        // NOT FOUND
        // =========================================================

        return json({
            success: false,
            message: "Not found."
        }, 404);
    }
};


// =============================================================
// CORS HEADERS
// =============================================================

function corsHeaders() {

    return {
        "Access-Control-Allow-Origin": "*",

        "Access-Control-Allow-Methods":
            "GET, POST, OPTIONS",

        "Access-Control-Allow-Headers":
            "Content-Type",

        "Access-Control-Max-Age":
            "86400"
    };
}


// =============================================================
// JSON RESPONSE
// =============================================================

function json(data, status = 200) {

    return new Response(
        JSON.stringify(data),

        {
            status,

            headers: {
                "Content-Type":
                    "application/json; charset=utf-8",

                ...corsHeaders()
            }
        }
    );
}