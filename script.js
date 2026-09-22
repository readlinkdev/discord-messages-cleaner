(async () => {
    const CONFIG = {
        historyMinDelay: 1300,
        historyMaxDelay: 2200,
        deleteMinDelay: 2200,
        deleteMaxDelay: 3500,
        pauseEvery: 25,
        extraPauseMin: 10000,
        extraPauseMax: 16000,
        pageSize: 100
    };

    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

    const randomDelay = (min, max) =>
        Math.floor(Math.random() * (max - min + 1)) + min;

    const log = (text, color = "#5865F2") =>
        console.log(
            `%c[DeleteMyMessages] ${text}`,
            `color:${color};font-weight:bold`
        );

    try {
        const token = prompt("Enter your Discord token:");

        if (!token || !token.trim()) {
            throw new Error("Token not provided or invalid.");
        }

        const path = location.pathname.split("/").filter(Boolean);
        if (path[0] !== "channels" || !path[2]) {
            throw new Error("Please open the channel where you want to delete messages first.");
        }
        const channelId = path[2];

        const userRes = await fetch("https://discord.com/api/v9/users/@me", {
            headers: { "Authorization": token.trim() }
        });
        
        if (!userRes.ok) {
            throw new Error("Invalid or expired token. Please check and try again.");
        }
        
        const me = await userRes.json();

        log(`Account: ${me.username} (${me.id})`);
        log(`Current channel: ${channelId}`);

        const accepted = confirm(
`DELETE MY MESSAGES (WEB - MANUAL)

This script will:
• scan the history of the current channel
• locate ONLY messages sent by you
• delete those messages permanently

Account:
${me.username}

Channel ID:
${channelId}

Do you want to continue?`
        );

        if (!accepted) {
            log("Cancelled.", "#f0b232");
            return;
        }

        window.stopDeleteMyMessages = false;

        console.log("%cTo STOP, run:", "font-weight:bold;color:#ed4245");
        console.log("%cwindow.stopDeleteMyMessages = true", "font-size:16px;color:#ed4245");

        log("Searching for your messages...");

        let before = null;
        let scanned = 0;
        const messagesToDelete = [];

        while (!window.stopDeleteMyMessages) {
            let url = `https://discord.com/api/v9/channels/${channelId}/messages?limit=${CONFIG.pageSize}`;
            if (before) {
                url += `&before=${before}`;
            }

            let response;
            try {
                response = await fetch(url, {
                    headers: { "Authorization": token.trim() }
                });

                if (!response.ok) {
                    if (response.status === 429) {
                        const data = await response.json();
                        const retryAfter = (data.retry_after || 5) * 1000;
                        log(`Rate limit reached on history. Waiting ${retryAfter / 1000}s...`, "#f0b232");
                        await sleep(retryAfter);
                        continue;
                    }
                    throw new Error(`HTTP error: ${response.status}`);
                }
            } catch (error) {
                console.error("[DeleteMyMessages] Error fetching history:", error);
                log("Pausing for 15 seconds after error...", "#f0b232");
                await sleep(15000);
                continue;
            }

            const messages = await response.json();

            if (!Array.isArray(messages) || messages.length === 0) {
                break;
            }

            scanned += messages.length;

            for (const message of messages) {
                if (message?.author?.id === me.id && message?.id) {
                    messagesToDelete.push({
                        id: message.id,
                        timestamp: message.timestamp ?? null
                    });
                }
            }

            before = messages[messages.length - 1].id;

            log(
                `Scanned: ${scanned} | Your messages found: ${messagesToDelete.length}`,
                "#57F287"
            );

            if (messages.length < CONFIG.pageSize) {
                break;
            }

            await sleep(randomDelay(CONFIG.historyMinDelay, CONFIG.historyMaxDelay));
        }

        if (window.stopDeleteMyMessages) {
            log("Interrupted by user.", "#f0b232");
            return;
        }

        log(`Scan complete. ${messagesToDelete.length} messages will be deleted.`, "#57F287");

        if (messagesToDelete.length === 0) {
            log("No messages of yours found.", "#57F287");
            return;
        }

        await sleep(3000);

        let deleted = 0;
        let failed = 0;

        for (let i = 0; i < messagesToDelete.length; i++) {
            if (window.stopDeleteMyMessages) {
                log("Process interrupted.", "#f0b232");
                break;
            }

            const message = messagesToDelete[i];
            let success = false;

            while (!success && !window.stopDeleteMyMessages) {
                try {
                    const delRes = await fetch(`https://discord.com/api/v9/channels/${channelId}/messages/${message.id}`, {
                        method: "DELETE",
                        headers: { "Authorization": token.trim() }
                    });

                    if (delRes.status === 204 || delRes.ok) {
                        deleted++;
                        success = true;
                        log(`Deleted ${deleted}/${messagesToDelete.length}`, "#57F287");
                    } else if (delRes.status === 429) {
                        const data = await delRes.json();
                        const retryAfter = Math.ceil((data.retry_after || 2) * 1000) + 1500;
                        log(`Rate limit. Waiting ${(retryAfter / 1000).toFixed(1)}s...`, "#f0b232");
                        await sleep(retryAfter);
                        continue;
                    } else {
                        throw new Error(`HTTP error: ${delRes.status}`);
                    }
                } catch (error) {
                    console.error(`[DeleteMyMessages] Failed to delete ${message.id}:`, error);
                    failed++;
                    success = true;
                }
            }

            await sleep(randomDelay(CONFIG.deleteMinDelay, CONFIG.deleteMaxDelay));

            if (deleted > 0 && deleted % CONFIG.pauseEvery === 0) {
                const extraPause = randomDelay(CONFIG.extraPauseMin, CONFIG.extraPauseMax);
                log(`Preventive pause of ${(extraPause / 1000).toFixed(1)}s...`, "#5865F2");
                await sleep(extraPause);
            }
        }

        console.log("");
        console.log("%c================================", "color:#5865F2");
        log("FINISHED", "#57F287");
        console.log({
            scannedMessages: scanned,
            foundMessages: messagesToDelete.length,
            deletedMessages: deleted,
            failures: failed
        });
        console.log("%c================================", "color:#5865F2");

    } catch (error) {
        console.error("[DeleteMyMessages] ERROR:", error);
    }
})();
