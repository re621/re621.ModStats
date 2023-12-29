
//// CONFIG START

const exemptUsers = [                   // Users to skip
    "Dari",
    "DasaDevil",
    "Varka",
]
const zeroExpectations = [              // Users who are not expected to handle approvals
    "auto_moderator",
    "Xch3l",
    "Earlopain",
    "Ratte",
    "Rainbow_Dash",
    "NotMeNotYou",
]
const autoMod = "auto_moderator";       // Automod - only unapproved deletions count
const scoreModifiers = {                // Score calculation parameters
    approvals: 1,
    replacements: 1.1,
    flags: 1.25,
}

const outputName = "janitors";         // Name of the output files

//// CONFIG END



const fetch = require("node-fetch");
const fs = require("fs");
const Common = require("./_common");



(async function() {

    Common.setup();
    const whenInterval = Common.formatInterval(Common.lookupWhen);
    Common.logName = outputName;

    Common.log("=== Starting Lookup ===", "Period: " + whenInterval);





    // Calculate the number of posts uploaded that month
    Common.log("Calculating workload");

    Common.log(`  Uploads:`);
    let page = Common.expectedPostPages, total = 0, resultsPerPage = 0, descending = false, requests = 0;
    do {
        requests++;
        let lookup = await fetch(`https://e621.net/posts.json?tags=date:${whenInterval}&page=${page}&limit=320`, Common.RequestOptions).then(response => response.json());
        Common.sleep();

        if(lookup["posts"]) lookup = lookup["posts"];
        resultsPerPage = lookup.length;

        if(resultsPerPage == 320) {
            total = 320 * page;
            Common.logUpdate(`  Uploads: >${total}, page: ${page} [${requests}]`);

            if(descending) break;
            else page += 10;
        } else if(resultsPerPage == 0) {
            total = 320 * page;
            Common.logUpdate(`  Uploads: <${total}, page: ${page} [${requests}]`);

            if(page <= 1) {
                total = 0;
                Common.logUpdate(`  Uploads: ${total}, page: ${page} [${requests}]`);
                break;
            }
            
            descending = true;
            page--;
        } else {
            total = (320 * (page - 1)) + resultsPerPage;
            Common.logUpdate(`  Uploads: ${total}, page: ${page} [${requests}]`);
            break;
        }
    } while(true)
    const totalApprovals = total;

    Common.log(`  Replacements:`);
    total = 0, resultsPerPage = 0, page = 1, descending = false, requests = 0;
    do {
        requests++;
        let lookup = await fetch(`https://e621.net/post_replacements.json?search[created_at]=${whenInterval}&search[status]=approved&page=${page}&limit=320`, Common.RequestOptions).then(response => response.json());
        Common.sleep();

        if(lookup["post_replacements"]) lookup = lookup["post_replacements"];
        resultsPerPage = lookup.length;

        if(resultsPerPage == 320) {
            total = 320 * page;
            Common.logUpdate(`  Replacements: >${total}, page: ${page} [${requests}]`);

            if(descending) break;
            else page += 2;
        } else if(resultsPerPage == 0) {
            total = 320 * page;
            Common.logUpdate(`  Replacements: <${total}, page: ${page} [${requests}]`);

            if(page <= 1) {
                total = 0;
                break;
            }
            
            descending = true;
            page--;
        } else {
            total = (320 * (page - 1)) + resultsPerPage;
            Common.logUpdate(`  Replacements: ${total}, page: ${page} [${requests}]`);
            break;
        }
    } while(true)
    const totalReplacements = total;

    Common.log(`  Deletions:`);
    total = 0, resultsPerPage = 0, page = 1, descending = false, requests = 0;
    do {
        requests++;
        let lookup = await fetch(`https://e621.net/post_flags.json?search[created_at]=${whenInterval}&search[type]=deletion&page=${page}&limit=320`, Common.RequestOptions).then(response => response.json());
        Common.sleep();

        if(lookup["post_flags"]) lookup = lookup["post_flags"];
        resultsPerPage = lookup.length;

        if(resultsPerPage == 320) {
            total = 320 * page;
            Common.logUpdate(`  Deletions: >${total}, page: ${page} [${requests}]`);

            if(descending) break;
            else page += 2;
        } else if(resultsPerPage == 0) {
            total = 320 * page;
            Common.logUpdate(`  Deletions: <${total}, page: ${page} [${requests}]`);

            if(page <= 1) {
                total = 0;
                break;
            }
            
            descending = true;
            page--;
        } else {
            total = (320 * (page - 1)) + resultsPerPage;
            Common.logUpdate(`  Deletions: ${total}, page: ${page} [${requests}]`);
            break;
        }
    } while(true)
    const totalDeletions = total;

    const totalScore = calculateScore(totalApprovals, totalReplacements, totalDeletions);
    Common.log(`  Score: ${totalScore}`);


    // Calculate the number of approvers on staff
    Common.log(`  Approvers:`);
    const approvalPerm = await fetch(`https://e621.net/users.json?search[can_approve_posts]=true&limit=320`, Common.RequestOptions).then(response => response.json());
    Common.sleep();
    const approvers = [],   // Active staff members with approval permissions
          janitors = [],    // Staff members expected to regularly handle approvals
          staffData = {};   // Full user profiles
    for(const user of approvalPerm) {
        const name = user.name;
        if(exemptUsers.includes(name)) continue;
        approvers.push(name);
        staffData[name] = user;
        if(!zeroExpectations.includes(name))
            janitors.push(name);
    }
    Common.logUpdate(`  Approvers: ${janitors.length} (+${approvers.length - janitors.length})`);

    const expectedScore = Math.round(totalScore / janitors.length);
    Common.log(`Expectation: ${expectedScore}`);





    // Fetching approver stats
    const approverStats = {};
    let highestScore = 0,
        secondHighest = 0;

    for(const user of approvers) {

        Common.log("", "Analyzing: " + user);
        let page = 0,               // Page number
            total = 0,              // Total number of results (could be approximate)
            resultsPerPage = 0,     // Latest count of results per page
            descending = false,     // True if lookup reached 0 RPP and is counting pages backwards

            requests = 0,           // Number of API requests
            usefulResults = 0,      // ???
            isAutoMod = user === autoMod;



        Common.log(`  Approvals:`);
        page = 1, total = 0, resultsPerPage = 0, descending = false, requests = 0;
        do {
            requests++;
            let lookup = await fetch(`https://e621.net/post_approvals.json?search[user_name]=${user}&search[created_at]=${whenInterval}&page=${page}&limit=320`, Common.RequestOptions).then(response => response.json());
            Common.sleep();
            if(lookup["post_approvals"]) lookup = lookup["post_approvals"];

            // Fallback in case the username search fails and thus returns _all_ results for all approvals
            if(lookup.length > 0 && lookup[0].user_id != staffData[user].id) {
                Common.log("Trouble counting approvals");
                Common.log(`https://e621.net/post_approvals.json?search[user_name]=${user}&search[created_at]=${whenInterval}&page=${page}&limit=320`);
                Common.sleep();
                total = 0;
                break;
            }

            resultsPerPage = lookup.length;

            
            if(resultsPerPage == 320) {
                total = 320 * page;
                Common.logUpdate(`  Approvals: >${total}, page: ${page} [${requests}]`);

                if(descending) break;
                else page += 3;
            } else if(resultsPerPage == 0) {
                total = 320 * page;
                Common.logUpdate(`  Approvals: <${total}, page: ${page} [${requests}]`);

                if(page <= 1) {
                    total = 0;
                    Common.logUpdate(`  Approvals: ${total}, page: ${page} [${requests}]`);
                    break;
                }
                
                descending = true;
                page--;
            } else {
                total = (320 * (page - 1)) + resultsPerPage;
                Common.logUpdate(`  Approvals: ${total}, page: ${page} [${requests}]`);
                break;
            }
        } while(true)
        const approvals = total;



        Common.log(`  Replacements:`);
        page = 0, resultsPerPage = 0;
        do {
            page++;

            let lookup = await fetch(`https://e621.net/post_replacements.json?search[approver_name]=${user}&search[created_at]=${whenInterval}&search[status]=approved&page=${page}&limit=320`, Common.RequestOptions).then(response => response.json());
            if(lookup["post_replacements"]) lookup = lookup["post_replacements"];

            resultsPerPage = lookup.length;
            Common.logUpdate(`  Replacements: page ${page}, results ${resultsPerPage}`);

            Common.sleep();
        } while(resultsPerPage == 320)
        const replacements = ((page - 1) * 320) + resultsPerPage;
        Common.logUpdate(`  Replacements: ${replacements}`);


        Common.log(`  Flags:`);
        page = 0, resultsPerPage = 0, usefulResults = 0;
        do {
            page++;

            let lookup = await fetch(`https://e621.net/post_flags.json?search[creator_name]=${user}&search[created_at]=${whenInterval}&page=${page}&limit=320`, Common.RequestOptions).then(response => response.json());
            if(lookup["post_flags"]) lookup = lookup["post_flags"];

            resultsPerPage = lookup.length;
            if(isAutoMod) {
                for(const flag of lookup)
                    if(flag.reason && flag.reason === "Unapproved in 30 days")
                        usefulResults++;
            } else usefulResults = resultsPerPage;
            Common.logUpdate(`  Flags: page ${page}, results ${resultsPerPage}`);

            Common.sleep();
        } while(resultsPerPage == 320)
        const flags = isAutoMod ? usefulResults : ((page - 1) * 320) + resultsPerPage;
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

        approverStats[user] = {
            name: user,
            id: staffData[user].id,
            level: staffData[user].level,

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

function printToFile(approverStats, secondHighest, expectedScore) {

    const printData = [];
    printData.push([

        // Publicly Visible
        Common.lookupWhen.toLocaleDateString("en-us", {month: "long", year: "numeric"}),
        "Approved",
        "Replaced",
        "Deleted",
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
            user.approvals,
            user.replacements,
            user.flags,
            `"=IF(Q${iterator},""X"", VLOOKUP($K$2:$K$52,Utility!$B$4:$C$24,2,TRUE))"`, // Grade calculations done in the spreadsheet
            `"=IF(Q${iterator}, """", VLOOKUP($L$2:$L$52,Utility!$E$4:$F$24,2,TRUE))"`, // Same for the tendency
            "",

            // Histogram
            `"=IFERROR(XLOOKUP(A${iterator}, INDIRECT(H$1&""!A2:A""), INDIRECT(H$1&""!K2:K"")), 0)"`,
            `"=IFERROR(XLOOKUP(A${iterator}, INDIRECT(I$1&""!A2:A""), INDIRECT(I$1&""!K2:K"")), 0)"`,
            `"=IFERROR(XLOOKUP(A${iterator}, INDIRECT(J$1&""!A2:A""), INDIRECT(J$1&""!K2:K"")), 0)"`,
            Math.round((user.score / expectedScore) * 100),
            `"=K${iterator} - ROUND(AVERAGE(H${iterator}:J${iterator}))"`,
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
