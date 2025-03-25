const http = require('http');

const APP_PORT = 8902;
const NUM_QUERIES = 500;

function createURL(pathname) {
    return `http://localhost:${APP_PORT}${pathname}`;
}

function chooseNumberFromRange(min, max) {
    return Math.round(Math.random() * (max - min) + min);
}

function makeAPIRequest(pathname, callback) {
    http.get(createURL(pathname), (dbResponse) => {
        dbResponse.setEncoding('utf8');

        let rawUTF8 = '';

        dbResponse.on('data', (chunk) => {
            rawUTF8 += chunk;
        });

        dbResponse.on('end', () => {
            const { result } = JSON.parse(rawUTF8);
            callback(result);
        });
    });
}

function getDatabaseOrderedListRange(callback) {
    makeAPIRequest('/range', callback);
}

function makeQueriesRecursively(results, start, end, count, callback) {
    if (count) {
        const position = chooseNumberFromRange(start, end);
        const timeStart = Date.now();

        makeAPIRequest(`/media-segment?position=${position}`, (res) => {
            // Log it out to ensure progress is happening.
            console.log('got segment for media timeline position', position, Boolean(res));

            const sampleTime = Date.now() - timeStart;

            results.samples.push(sampleTime);

            makeQueriesRecursively(results, start, end, count - 1, callback);
        });
    } else {
        callback(results);
    }
}

getDatabaseOrderedListRange((range) => {
    const { start, end } = range;

    const results = { samples: [] };

    makeQueriesRecursively(results, start, end, NUM_QUERIES, (results) => {
        const samples = results.samples.sort((a, b) => {
            return a - b;
        });
        const min = samples[0];
        const max = samples[samples.length - 1];

        const sum = samples.reduce((sum, sample) => {
            return sum + sample;
        }, 0);

        const data = {
            totalTime: results.totalTime,
            min,
            max,
            average: Math.round(sum / samples.length)
        };

        console.log(JSON.stringify(data, null, 4));
    });
});
