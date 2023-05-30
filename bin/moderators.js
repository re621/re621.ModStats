
//// CONFIG START

const when = "May 2023";                // Month to look up
const expectation = 10;                 // Expected number of DAILY actions
const exemptUsers = [                   // Users to skip
    "auto_moderator",
    "Dari",
    "DasaDevil",
    "Varka",
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
    const whenDate = new Date(when);
    const whenInterval = Common.formatInterval(whenDate);
    const expectedScore = Common.countDays(whenDate) * expectation;
    Common.logName = outputName;


    
    if(Common.useCache && fs.existsSync(`./data/${outputName}.json`)) {

        Common.log("=== Rebuilding CSV File ===");
        const approverStats = JSON.parse(fs.readFileSync(`./data/${outputName}.json`));
        let highestScore = 0,
            secondHighest = 0;

        for(const user of Object.values(approverStats)) {
            user.score = calculateScore(user.tickets);

            Common.log("", "Analyzing: " + user.name, `  Score: ${user.score}`);
            if(user.score > highestScore) {
                secondHighest = highestScore;
                highestScore = user.score;
                Common.logUpdate(`  Score: ${user.score} FIRST (${highestScore}, ${secondHighest})`);
            } else if(user.score > secondHighest) {
                secondHighest = user.score;
                Common.logUpdate(`  Score: ${user.score} SECOND (${highestScore}, ${secondHighest})`);
            }
        }

        printToFile(approverStats, secondHighest, expectedScore);
        Common.log("", "=== CSV File Complete ===");

        return;
    }


    Common.log("=== Starting Lookup ===", "Period: " + whenInterval);
    const approverStats = {};
    let highestScore = 0,
        secondHighest = 0;

    // If we ever have more than 75 approvers, this will be a problem
    const users = await fetch(`https://e621.net/users.json?search[min_level]=40`, Common.RequestOptions).then(response => response.json());
    Common.log("Fetching data for " + users.length + " users");
    Common.sleep();


    for(const user of users) {
        if(exemptUsers.includes(user.name)) continue;

        Common.log("", "Analyzing: " + user.name);
        let page = 0, results = 0;

        Common.log(`  Tickets:`);
        page = 0, results = 0;
        do {
            page++;

            let lookup = await fetch(`https://e926.net/mod_actions.json?search[action]=ticket_update&search[creator_name]=${user.name}&search[created_at]=${whenInterval}&page=${page}&limit=320`, Common.RequestOptions).then(response => response.json());

            results = lookup.length;
            Common.logUpdate(`  Tickets: page ${page}, results ${results}`);

            Common.sleep();
        } while(results == 320)
        const tickets = ((page - 1) * 320) + results;
        Common.logUpdate(`  Tickets: ${tickets}`);

        const score = calculateScore(tickets);
        Common.log(`  Score: ${score}`);
        if(score > highestScore) {
            secondHighest = highestScore;
            highestScore = score;
            Common.logUpdate(`  Score: ${score} FIRST (${highestScore}, ${secondHighest})`);
        } else if(score > secondHighest) {
            secondHighest = score;
            Common.logUpdate(`  Score: ${score} SECOND (${highestScore}, ${secondHighest})`);
        }
    
        approverStats[user.name] = {
            name: user.name,
            id: user.id,
            level: user.level,
    
            tickets: tickets,
    
            score: score,
        };

        printToFile(approverStats, secondHighest, expectedScore);
    }

    printToFile(approverStats, secondHighest, expectedScore);
    Common.log("\n=== Lookup Finished ===");
})();


function calculateScore(tickets) {
    return scoreModifiers.tickets * tickets;
}

function calculateLetterGrade(score, target) {
    const percent = Math.round((score / target) * 100);
    if(percent >= 100) return "A";
    if(percent >= 70) return "B";
    if(percent >= 40) return "C";
    if(percent >= 10) return "D";
    return "F";
}

function calculateLetterRanking(score, highest) {
    if(score > highest) return "S";

    const percent = Math.round((score / highest) * 100);
    if(percent >= 80) return "A";
    if(percent >= 60) return "B";
    if(percent >= 40) return "C";
    if(percent >= 20) return "D";
    return "F";
}

function printToFile(approverStats, secondHighest, expectedScore) {

    const printData = [];
    printData.push([
        "Username",
        "ID",
        "Level",

        "Tickets",

        "Score",
        "Grade",
        "Ranking",
    ]);

    for(const user of Object.values(approverStats)) {
        printData.push([
            user.name,
            user.id,
            user.level,

            user.tickets,

            user.score,
            calculateLetterGrade(user.score, expectedScore, true),
            calculateLetterRanking(user.score, secondHighest),
        ].join(","));
    }

    fs.writeFileSync(`./data/${outputName}.csv`, printData.join("\n"));
    fs.writeFileSync(`./data/${outputName}.json`, JSON.stringify(approverStats, null, 4));
}
