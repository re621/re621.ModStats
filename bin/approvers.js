
//// CONFIG START

const when = "May 2023";                // Month to look up
const expectation = 100;                // Expected number of DAILY actions
const exemptUsers = [                   // Users to skip
    "Dari",
    "DasaDevil",
    "Varka",
]
const autoMod = "auto_moderator";       // Automod - only unapproved deletions count
const scoreModifiers = {                // Score calculation parameters
    approvals: 1,
    replacements: 1.1,
    flags: 1.25,
}

const outputName = "approvers";         // Name of the output files

//// CONFIG END



const fetch = require("node-fetch");
const fs = require("fs");
const Common = require("./_common");



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
            user.score = calculateScore(user.approvals, user.replacements, user.flags);

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
    const users = await fetch(`https://e621.net/users.json?search[can_approve_posts]=true`, Common.RequestOptions).then(response => response.json());
    Common.log("Fetching data for " + users.length + " users");
    Common.sleep();


    for(const user of users) {

        if(exemptUsers.includes(user.name)) continue;

        Common.log("", "Analyzing: " + user.name);
        let page = 0,
            results = 0,
            usefulResults = 0,
            isAutoMod = user.name === autoMod;

        Common.log(`  Approvals:`);
        page = 0, results = 0;
        do {
            page++;

            let lookup = await fetch(`https://e621.net/post_approvals.json?search[user_name]=${user.name}&search[created_at]=${whenInterval}&page=${page}&limit=320`, Common.RequestOptions).then(response => response.json());
            if(lookup["post_approvals"]) lookup = lookup["post_approvals"];

            // Fallback in case the username search fails and thus returns _all_ results for all approvals
            if(lookup.length > 0 && lookup[0].user_id != user.id) {
                Common.log("Trouble counting approvals");
                Common.log(`https://e621.net/post_approvals.json?search[user_name]=${user.name}&search[created_at]=${whenInterval}&page=${page}&limit=320`);
                Common.sleep();
                results = 0;
                break;
            }

            results = lookup.length;
            Common.logUpdate(`  Approvals: page ${page}, results ${results}`);

            Common.sleep();
        } while(results == 320)
        const approvals = ((page - 1) * 320) + results;
        Common.logUpdate(`  Approvals: ${approvals}`);


        Common.log(`  Replacements:`);
        page = 0, results = 0;
        do {
            page++;

            let lookup = await fetch(`https://e621.net/post_replacements.json?search[approver_name]=${user.name}&search[created_at]=${whenInterval}&search[status]=approved&page=${page}&limit=320`, Common.RequestOptions).then(response => response.json());
            if(lookup["post_replacements"]) lookup = lookup["post_replacements"];

            results = lookup.length;
            Common.logUpdate(`  Replacements: page ${page}, results ${results}`);

            Common.sleep();
        } while(results == 320)
        const replacements = ((page - 1) * 320) + results;
        Common.logUpdate(`  Replacements: ${replacements}`);


        Common.log(`  Flags:`);
        page = 0, results = 0, usefulResults = 0;
        do {
            page++;

            let lookup = await fetch(`https://e621.net/post_flags.json?search[creator_name]=${user.name}&search[created_at]=${whenInterval}&page=${page}&limit=320`, Common.RequestOptions).then(response => response.json());
            if(lookup["post_flags"]) lookup = lookup["post_flags"];

            results = lookup.length;
            if(isAutoMod) {
                for(const flag of lookup)
                    if(flag.reason && flag.reason === "Unapproved in 30 days")
                        usefulResults++;
            } else usefulResults = results;
            Common.logUpdate(`  Flags: page ${page}, results ${results}`);

            Common.sleep();
        } while(results == 320)
        const flags = isAutoMod ? usefulResults : ((page - 1) * 320) + results;
        Common.logUpdate(`  Flags: ${flags}`);


        const score = calculateScore(approvals, replacements, flags);
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

            approvals: approvals,
            replacements: replacements,
            flags: flags,

            score: score,
        };
        
        printToFile(approverStats, secondHighest, expectedScore);
    }

    printToFile(approverStats, secondHighest, expectedScore);
    Common.log("", "=== Lookup Finished ===");

})();

function calculateScore(approvals, replacements, flags) {
    return (scoreModifiers.approvals * approvals) + (scoreModifiers.approvals * replacements) + (scoreModifiers.approvals * flags);
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
        "Approved",
        "Replaced",
        "Deleted",
        "Score",
        "Grade",
        "Ranking",
    ]);

    for(const user of Object.values(approverStats)) {
        printData.push([
            user.name,
            user.id,
            user.level,
            user.approvals,
            user.replacements,
            user.flags,
            user.score,
            calculateLetterGrade(user.score, expectedScore, true),
            calculateLetterRanking(user.score, secondHighest),
        ].join(","));
    }

    fs.writeFileSync(`./data/${outputName}.csv`, printData.join("\n"));
    fs.writeFileSync(`./data/${outputName}.json`, JSON.stringify(approverStats, null, 4));

}
