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
                version: "1.3.0",
                urlLength: 180
            });
        }

        // =========================================================
        // DOWNLOAD STARTED NOTIFICATION
        // =========================================================

        if (
            request.method === "POST" &&
            url.pathname === "/api/download-started"
        ) {
            try {

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

                const event =
                    typeof data.event === "string"
                        ? data.event.trim().slice(0, 100)
                        : "download_started";

                const timestamp =
                    typeof data.timestamp === "string"
                        ? data.timestamp.slice(0, 100)
                        : new Date().toISOString();

                const fileName =
                    typeof data.fileName === "string"
                        ? data.fileName.trim().slice(0, 255)
                        : "Unknown";

                const pageUrl =
                    typeof data.pageUrl === "string"
                        ? data.pageUrl.trim().slice(0, 2000)
                        : "Unknown";

                const referrer =
                    typeof data.referrer === "string"
                        ? data.referrer.trim().slice(0, 2000)
                        : "None";

                const userAgent =
                    request.headers.get("user-agent") ||
                    (
                        typeof data.userAgent === "string"
                            ? data.userAgent.slice(0, 2000)
                            : "Unknown"
                    );

                const origin =
                    request.headers.get("origin") ||
                    "Unknown";

                const message =
`⬇️ Download Started

Event:
${event}

File:
${fileName}

Time:
${timestamp}

Page:
${pageUrl}

Origin:
${origin}

Referrer:
${referrer}

User Agent:
${userAgent}`;

                ctx.waitUntil(
                    sendTelegramMessage(
                        env,
                        message
                    )
                );

                return json({
                    success: true,
                    message:
                        "Download notification accepted."
                }, 202);

            }
            catch (error) {

                console.error(
                    "Download notification endpoint error:",
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
        // UNINSTALL / UNSUBSCRIBE REQUEST
        // =========================================================

        if (
            request.method === "POST" &&
            url.pathname === "/api/uninstall"
        ) {
            try {

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

                let data;

                try {
                    data = await request.json();
                }
                catch {
                    return json({
                        success: false,
                        message:
                            "Invalid JSON request."
                    }, 400);
                }

                const reason =
                    typeof data.reason === "string"
                        ? data.reason.trim()
                        : "";

                if (!reason) {
                    return json({
                        success: false,
                        message:
                            "Reason is required."
                    }, 400);
                }

                if (reason.length > 2000) {
                    return json({
                        success: false,
                        message:
                            "Reason is too long."
                    }, 400);
                }

                const page =
                    typeof data.page === "string"
                        ? data.page.trim().slice(0, 1000)
                        : "Unknown";

                const timestamp =
                    typeof data.timestamp === "string"
                        ? data.timestamp.slice(0, 100)
                        : new Date().toISOString();

                const generatedLink =
                    typeof data.generatedLink === "string"
                        ? data.generatedLink.slice(0, 1000)
                        : "";

                const userAgent =
                    request.headers.get("user-agent") ||
                    "Unknown";

                const origin =
                    request.headers.get("origin") ||
                    "Unknown";

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

                const telegramResult =
                    await sendTelegramMessage(
                        env,
                        message
                    );

                if (!telegramResult.ok) {

                    return json({
                        success: false,
                        message:
                            "Unable to deliver notification."
                    }, 502);
                }

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
        // 180-CHARACTER ENTRY URL
        // =========================================================
        //
        // Supported:
        //
        // /
        // /index
        // /index.html
        // /redirect
        // /redirect.html
        //
        // The Worker generates a URL exactly 180 characters long
        // whenever the requested hostname/path permits it.
        //
        // The padding is placed in the query string because URL
        // fragments are never sent to Cloudflare Workers.
        //
        // =========================================================

        if (
            request.method === "GET" &&
            (
                url.pathname === "/" ||
                url.pathname === "/index" ||
                url.pathname === "/index.html" ||
                url.pathname === "/redirect" ||
                url.pathname === "/redirect.html"
            )
        ) {

            if (!env.ASSETS) {
                return json({
                    success: false,
                    message:
                        "Static asset binding ASSETS is not configured."
                }, 500);
            }

            // -----------------------------------------------------
            // Select requested document
            // -----------------------------------------------------

            const assetPath =
                (
                    url.pathname === "/redirect" ||
                    url.pathname === "/redirect.html"
                )
                    ? "/redirect.html"
                    : "/index.html";

            // -----------------------------------------------------
            // Detect our generated URL
            // -----------------------------------------------------

            const generatedMarker =
                url.searchParams.get("__180");

            if (generatedMarker === "1") {

                const assetUrl =
                    new URL(
                        assetPath,
                        request.url
                    );

                // Remove the internal 180-character query before
                // passing the request to the static asset system.
                assetUrl.search = "";

                const assetRequest =
                    new Request(
                        assetUrl.toString(),
                        request
                    );

                return env.ASSETS.fetch(
                    assetRequest
                );
            }

            // -----------------------------------------------------
            // Generate the exact 180-character entry URL
            // -----------------------------------------------------

            const generatedUrl =
                create180CharacterUrl(
                    request,
                    assetPath
                );

            if (generatedUrl) {

                return new Response(null, {
                    status: 302,

                    headers: {
                        "Location":
                            generatedUrl,

                        "Cache-Control":
                            "no-store, no-cache, must-revalidate",

                        "Pragma":
                            "no-cache",

                        ...corsHeaders()
                    }
                });
            }

            // -----------------------------------------------------
            // Safe fallback
            // -----------------------------------------------------
            //
            // If the hostname/path itself makes an exact 180
            // character URL impossible, serve the page normally.
            // Never break the site merely to satisfy the length.
            // -----------------------------------------------------

            const assetUrl =
                new URL(
                    assetPath,
                    request.url
                );

            const assetRequest =
                new Request(
                    assetUrl.toString(),
                    request
                );

            return env.ASSETS.fetch(
                assetRequest
            );
        }

        // =========================================================
        // STATIC ASSETS
        // =========================================================
        //
        // Examples:
        //
        // /instructions.pdf
        // /pdf.worker.min.js
        // /assets/...
        // /favicon.ico
        //
        // =========================================================

        if (
            request.method === "GET" &&
            env.ASSETS
        ) {
            return env.ASSETS.fetch(request);
        }

        // =========================================================
        // METHOD NOT ALLOWED
        // =========================================================

        if (
            url.pathname === "/api/uninstall" ||
            url.pathname === "/api/download-started"
        ) {
            return json({
                success: false,
                message:
                    "Method not allowed."
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
// CREATE EXACT 180-CHARACTER URL
// =============================================================

function create180CharacterUrl(
    request,
    assetPath
) {

    const TARGET_LENGTH = 180;

    const originalUrl =
        new URL(request.url);

    // ---------------------------------------------------------
    // Preserve the actual hostname.
    // ---------------------------------------------------------

    const baseUrl =
        `${originalUrl.origin}${assetPath}`;

    // ---------------------------------------------------------
    // Already exactly 180.
    // ---------------------------------------------------------

    if (
        baseUrl.length === TARGET_LENGTH
    ) {
        return baseUrl;
    }

    // ---------------------------------------------------------
    // Cannot shorten without changing routing.
    // ---------------------------------------------------------

    if (
        baseUrl.length > TARGET_LENGTH
    ) {
        console.warn(
            "Base URL is already longer than 180 characters.",
            baseUrl.length
        );

        return null;
    }

    // ---------------------------------------------------------
    // Internal marker.
    // ---------------------------------------------------------

    const prefix =
        "?__180=1&pad=";

    // ---------------------------------------------------------
    // Calculate exact padding.
    // ---------------------------------------------------------

    const paddingLength =
        TARGET_LENGTH -
        baseUrl.length -
        prefix.length;

    if (
        paddingLength < 1
    ) {
        return null;
    }

    const padding =
        generateUrlSafePadding(
            paddingLength
        );

    const generatedUrl =
        `${baseUrl}${prefix}${padding}`;

    // ---------------------------------------------------------
    // Hard verification.
    // ---------------------------------------------------------

    if (
        generatedUrl.length !== TARGET_LENGTH
    ) {
        console.error(
            "180-character URL generation failed.",
            {
                generatedLength:
                    generatedUrl.length,

                expectedLength:
                    TARGET_LENGTH
            }
        );

        return null;
    }

    return generatedUrl;
}


// =============================================================
// URL-SAFE RANDOM PADDING
// =============================================================

function generateUrlSafePadding(
    length
) {

    const characters =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ" +
        "abcdefghijklmnopqrstuvwxyz" +
        "0123456789" +
        "-_";

    const values =
        new Uint32Array(length);

    crypto.getRandomValues(
        values
    );

    let result = "";

    for (
        let i = 0;
        i < length;
        i++
    ) {
        result +=
            characters[
                values[i] %
                characters.length
            ];
    }

    return result;
}


// =============================================================
// TELEGRAM MESSAGE
// =============================================================

async function sendTelegramMessage(
    env,
    message
) {

    if (!env.TELEGRAM_BOT_TOKEN) {

        console.error(
            "Missing TELEGRAM_BOT_TOKEN secret."
        );

        return {
            ok: false,
            status: 500
        };
    }

    if (!env.TELEGRAM_CHAT_ID) {

        console.error(
            "Missing TELEGRAM_CHAT_ID secret."
        );

        return {
            ok: false,
            status: 500
        };
    }

    const telegramUrl =
        `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;

    try {

        const response =
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

        if (!response.ok) {

            const errorText =
                await response.text();

            console.error(
                "Telegram API error:",
                errorText
            );
        }

        return {
            ok:
                response.ok,

            status:
                response.status
        };

    }
    catch (error) {

        console.error(
            "Telegram request failed:",
            error
        );

        return {
            ok: false,
            status: 500
        };
    }
}


// =============================================================
// CORS
// =============================================================

function corsHeaders() {

    return {
        "Access-Control-Allow-Origin":
            "*",

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

function json(
    data,
    status = 200
) {

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