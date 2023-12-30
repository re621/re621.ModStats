
//// CONFIG START

const exemptUsers = [                   // Users to skip
    "auto_moderator",
    "Dari",
    "Varka",
]
const zeroExpectations = [              // Users who are not expected to handle approvals
    "Xch3l",
    "Earlopain",
    "NotMeNotYou",
    "DasaDevil",
    "Knotty_Curls",
]
const scoreModifiers = {                // Score calculation parameters
    tickets: 1,
}

const outputName = "moderators";        // Name of the output files

//// CONFIG END



const fetch = require("node-fetch");
const fs = require("fs");
const Common = require("./_common");



// Lookup
(async function() {

    Common.setup();
    const whenInterval = Common.formatInterval(Common.lookupWhen);
    Common.logName = outputName;

    Common.log("=== Starting Lookup ===", "Period: " + whenInterval);


    Common.log("Moderators:");
    const lookup = await fetch(`https://e621.net/users.json?search[min_level]=40`, Common.RequestOptions).then(response => response.json());
    Common.sleep();

    let ticketHandlers = [],
        userData = {},
        userIndex = {},
        statsBucket = {};
    for(const user of lookup) {
        userIndex[user.id] = user.name;
        userData[user.name] = user;

        if(exemptUsers.includes(user.name)) continue;
        statsBucket[user.name] = 0;

        if(!zeroExpectations.includes(user.name))
            ticketHandlers.push(user.name);
    }
    Common.logUpdate(`Moderators: ${ticketHandlers.length}`);

    


    Common.log("Finding tickets [page 1]:");

    let results = 0,
        page = 1,
        totalTickets = 0;

    const unfoundUsers = new Set();

    do {
        let lookup = await fetch(`https://e926.net/mod_actions.json?search[action]=ticket_update&search[created_at]=${whenInterval}&page=${page}&limit=320`, Common.RequestOptions).then(response => response.json());
        results = lookup.length;
        totalTickets += results;

        Common.logUpdate(`Finding tickets [page 1]:`);

        for(const entry of lookup) {
            let userName = userIndex[entry["creator_id"]];
            if(typeof userName == "undefined") {
                userName = entry["creator_id"];
                unfoundUsers.add(entry["creator_id"]);
            }

            if(typeof statsBucket[userName] == "undefined")
                statsBucket[userName] = 0;
            else statsBucket[userName]++;
        }

        const message = [];
        for(const [userName, ticketNumber] of Object.entries(statsBucket))
            message.push(`  ${userName}: ${ticketNumber}`);
            Common.logUpdate(`Finding tickets [page 1]:\n  ` + message.join("\n  "));

        page++;
        Common.sleep();
    } while(results == 320);

    if(unfoundUsers.size > 0) {
        Common.log(`Unidentified users: ${unfoundUsers.size}`);

        const lookup = await fetch(`https://e621.net/users.json?search[id]=${Array.from(unfoundUsers).join(",")}`, Common.RequestOptions).then(response => response.json());
        Common.sleep();

        for(const user of lookup) {
            userIndex[user.id] = user.name;
            userData[user.name] = user;
    
            if(exemptUsers.includes(user.name)) {
                delete statsBucket[user.id];
                continue;
            }
            statsBucket[user.name] = statsBucket[user.id];
            delete statsBucket[user.id];
    
            if(!zeroExpectations.includes(user.name))
                ticketHandlers.push(user.name);
        }
    }

    const approverStats = {};
    for(const [userName, ticketCount] of Object.entries(statsBucket)) {
        approverStats[userName] = {
            name: userName,
            id: userData[userName].id,
            level: userData[userName].level,

            tickets: ticketCount,
            score: calculateScore(ticketCount),
        };
    }

    printToFile(approverStats, Math.round(calculateScore(totalTickets) / ticketHandlers.length));
    Common.log("\n=== Lookup Finished ===");
})();


function calculateScore(tickets) {
    return scoreModifiers.tickets * tickets;
}

function printToFile(approverStats, expectedScore) {

    const printData = [];
    printData.push([

        // Publicly Visible
        Common.lookupWhen.toLocaleDateString("en-us", {month: "long", year: "numeric"}),
        "Tickets",
        "Grade",
        "Trend",
        " ",

        // Histogram
        `"=TEXT(DATE(YEAR(A1), MONTH(A1) - 2, 0), ""mmmm"")"`,
        `"=TEXT(DATE(YEAR(A1), MONTH(A1) - 1, 0), ""mmmm"")"`,
        `"=TEXT(DATE(YEAR(A1), MONTH(A1), 0), ""mmmm"")"`,
        `"=TEXT(DATE(YEAR(A1), MONTH(A1), 1), ""mmmm"")"`,
        "Trend",
        " ",

        // Background info
        "ID",
        "Level",
        "Score",
        "Inactive",
    ]);

    let iterator = 2;
    for(const user of Object.values(approverStats)) {
        printData.push([

            // Publicly Visible
            user.name,
            user.tickets,
            `"=IF(O${iterator},""X"", VLOOKUP($I$2:$I$52,Utility!$B$4:$C$24,2,TRUE))"`, // Grade calculations done in the spreadsheet
            `"=IF(O${iterator}, """", VLOOKUP($J$2:$J$52,Utility!$E$4:$F$24,2,TRUE))"`, // Same for the tendency
            "",

            // Histogram
            `"=IFERROR(XLOOKUP(A${iterator}, INDIRECT(F$1&""!A2:A""), INDIRECT(F$1&""!I2:I"")), 0)"`,
            `"=IFERROR(XLOOKUP(A${iterator}, INDIRECT(G$1&""!A2:A""), INDIRECT(G$1&""!I2:I"")), 0)"`,
            `"=IFERROR(XLOOKUP(A${iterator}, INDIRECT(H$1&""!A2:A""), INDIRECT(H$1&""!I2:I"")), 0)"`,
            Math.round((user.score / expectedScore) * 100),
            `"=I${iterator} - ROUND(AVERAGE(F${iterator}:H${iterator}))"`,
            "",

            // Background info
            user.id,
            user.level,
            user.score,
            zeroExpectations.includes(user.name) ? "TRUE" : "",
        ].join(","));
        iterator++;
    }

    fs.writeFileSync(`./data/${outputName}.csv`, printData.join("\n"));
    fs.writeFileSync(`./data/${outputName}.json`, JSON.stringify(approverStats, null, 4));
}
