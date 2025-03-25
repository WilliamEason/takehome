const http = require('http');

const DB_PORT = 8901;
const PORT = 8902;

// When we discover the length of the ordered list from the DB, we stash it here.
let knownListLength;


// Track segment durations to enable our search to predict where a segment will be
let averageDuration = 0;
let durationsRecorded = 0;

// Track the lowest segment start to help make initial guesses
let lowestStartTime = 0;


function sendJSONResponse(res, status, response) {
    const message = JSON.stringify(response);

    res.writeHead(status, {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(message),
    });

    res.end(message);
}

function makeDatabaseRequest(pathname, callback) {
    http.get(`http://localhost:${DB_PORT}${pathname}`, (dbResponse) => {
        dbResponse.setEncoding('utf8');

        let rawUTF8 = '';

        dbResponse.on('data', (chunk) => {
            rawUTF8 += chunk;
        });

        dbResponse.on('end', () => {
            callback(JSON.parse(rawUTF8));
        });
    });
}

function findSegment(res, knownLength, position) {
    // The following represent both the indexes, and value boundaries of our binary search derived algorithm
    var leftBoundIdx = 0
    var leftBoundVal = 0
    var rightBoundIdx = knownLength
    var rightBoundVal = Number.MAX_SAFE_INTEGER

    // The functions below could likely be moved into a utility library, since they
    // are doing some basic math that could potentially be shared.
    function recomputeAverageDuration(thisDuration) {
        averageDuration = ((averageDuration * durationsRecorded) + thisDuration) / (durationsRecorded + 1);
        // console.log('durations recorded: %d, this duration %d', durationsRecorded, thisDuration)
        durationsRecorded++
    }

    function calculateTargetLookingRight(lIdx, lVal, targetVal, avgVal) {
        computedIndex = Math.round(lIdx + ((targetVal - lVal) / avgVal))
        // Because we're rounding, we may need to "bump" this value in the right direction if our
        // prediction landed on an existing boundary index
        if (computedIndex >= rightBoundIdx) {
            computedIndex = rightBoundIdx - 1
        }  else if (computedIndex <= leftBoundIdx) {
            computedIndex = leftBoundIdx + 1
        }
        // console.log('calculated right target idx %d', computedIndex)
        return computedIndex
    }

    function calculateTargetLookingLeft(rIdx, rVal, targetVal, avgVal) {
        computedIndex = Math.round(rIdx - ((rVal - targetVal) / avgVal))
        // Because we're rounding, we may need to "bump" this value in the right direction if our
        // prediction landed on an existing boundary index
        if (computedIndex <= leftBoundIdx) {
            computedIndex = leftBoundIdx + 1
        } else if (computedIndex >= rightBoundIdx) {
            computedIndex = rightBoundIdx - 1
        }

        // console.log('calculated left target idx %d', computedIndex)
        return computedIndex
    }

    function tryNext(index) {
        makeDatabaseRequest(`/query?index=${index}`, (data) => {
            const { result } = data;

            if (index === 0) {
                lowestStartTime = result.start
            }

            // console.log('get index %d', index)
            // Found our result!
            if (result.start <= position && position <= result.end) {
                return sendJSONResponse(res, 200, data);
            }

            // This shouldn't happen
            if (rightBoundIdx === leftBoundIdx) {
                return sendJSONResponse(res, 404, null)
            }

            // For each result we get, recalculate the average duration
            // to account for the new range. This eventually converges on
            // the average duration represented in the dataset (7500)
            recomputeAverageDuration(result.end - result.start)

            // Look left, or right
            if (result.start > position) {
                // the start of this segment is further along than our target position.
                // this means we're too far to the right. Record the new bounds and look left
                rightBoundVal = result.start
                rightBoundIdx = index
                nextGuess = calculateTargetLookingLeft(rightBoundIdx, rightBoundVal, position, averageDuration)
                //console.log('looking to the left', nextGuess)
            } else {
                // We're too far to the left, look right
                leftBoundVal = result.end
                leftBoundIdx = index
                nextGuess = calculateTargetLookingRight(leftBoundIdx, leftBoundVal, position, averageDuration)
                // console.log('looking to the right', nextGuess)
            }

            tryNext(nextGuess);
        });
    }

    var initialGuess = 0;
    if (durationsRecorded > 0) {
        initialGuess = calculateTargetLookingRight(0, lowestStartTime, position, averageDuration);
        // console.log('initial guess: %d', initialGuess)
    } 
    tryNext(initialGuess);
}

function getRange(res) {
    console.log('get range from database ordered list');

    makeDatabaseRequest('/range', (data) => {
        const { length } = data.result;

        knownListLength = length;

        sendJSONResponse(res, 200, data);
    });
}

const server = http.createServer((req, res) => {
    const base = `http://localhost:${server.address().port}`;
    const url = new URL(req.url, base);

    const response = { result: null };
    let status = 404;

    if (url.pathname === '/range') {
        return getRange(res);
    }

    if (url.pathname === '/media-segment') {
        const position = parseInt(url.searchParams.get('position'), 10);
        console.log('get media segment for position %d, running average %f, durations %d', position, averageDuration, durationsRecorded);

        if (!Number.isNaN(position)) {
            return findSegment(res, knownListLength, position);
        }
    }

    sendJSONResponse(res, status, response);
});

server.on('listening', () => {
    const { port } = server.address();
    console.log('Application server listening on port', port);
});

server.listen(PORT);
