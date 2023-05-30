require("dotenv").config();
const fs = require("fs");

class Common {

    /**
     * Actions taken before the rest of the script can run.
     * Sets up the file structure.
     */
    static setup() {
        if(!fs.existsSync("./data/")) fs.mkdirSync("./data/");
    }

    /** True if data is being rebuilt from JSON, false otherwise */
    static get useCache() {
        return process.env.CACHE === "true";
    }

    static _lookupWhen;
    /** Origin date for the lookup interval */
    static get lookupWhen() {
        if(!this._lookupWhen) {
            const when = process.env.LOOKUP;
            this._lookupWhen = when ? new Date(when) : new Date();
        }
        return this._lookupWhen;
    }


    
    // ===== Misc =====

    /**
     * Returns a promise that resolves after a specified period of time
     * @param {number} time Time to wait
     * @returns Promise
     */
    static async sleep(time = 500) {
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve();
            }, time);
        });
    }
    
    /**
     * Converts a Date object into the format e621 recognizes
     * @param {Date} date Original date
     * @returns Date string in a YYYY-MM-DD format
     */
    static formatDate(date) {
        return date.getFullYear() + "-" + (date.getMonth() + 1) + "-" + date.getDate();
    }

    /**
     * Creates a date interval in e621-compatible format from the specified month
     * @param {Date} whenDate Original month: ex. "May 2012"
     * @returns Interval string in a YYYY-MM-DD..YYYY-MM-DD format
     */
    static formatInterval(whenDate) {
        const startDate = new Date(whenDate.getFullYear(), whenDate.getMonth(), 1);
        const endDate = new Date(whenDate.getFullYear(), whenDate.getMonth() + 1, 0);
        return this.formatDate(startDate) + ".." + this.formatDate(endDate);
    }

    /**
     * Returns the number of days in the specified month
     * @param {Date} whenDate Original month: ex. "May 2012"
     * @returns Number of days in the month
     */
    static countDays(whenDate) {
        return new Date(whenDate.getFullYear(), whenDate.getMonth() + 1, 0).getDate();
    }



    // ===== Request options =====

    /** Object containing default headers for API requests */
    static get RequestOptions() {
        if(!this._requestOptions)
            this._requestOptions = {
                headers: {
                    "method": "GET",
                    "User-Agent": "cinder/staff-stats",
                    "Authorization": `Basic ${Common.toBase64(process.env.API_NAME + ":" + process.env.API_PASS)}`,
                }
            };
        return this._requestOptions;
    };
    static _requestOptions;

    /**
     * Converts a string into base64
     * @param {string} value 
     * @returns Base64 string
     */
    static toBase64(value) {
        return Buffer.from(value).toString('base64');
    }



    // ===== Logging =====

    static _logCache = [];
    static _logName = "default";
    static get logName() { return this._logName; }
    static set logName(value) {
        this._logName = value;
        fs.writeFileSync("./data/approvers.log", "");
    }

    /**
     * Writes a message into the log file
     * @param  {...string} messages Messages to write
     */
    static log(...messages) {
        for(const message of messages) this._logCache.push(message + "");
        fs.writeFileSync("./data/" + this.logName + ".log", this._logCache.join("\n"));
    }

    /**
     * Removes the last written message and writes a provided string in its stead
     * @param {string} message Message to write
     */
    static logUpdate(message) {
        this._logCache.pop();
        this.log(message);
    }

}

module.exports = Common;
