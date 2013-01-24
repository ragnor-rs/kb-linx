/*
 * TODO: i18n
 * TODO: add question answering method
 */

var http = require("http");
var neo4j = require("neo4j");
var async = require("async");

var db = new neo4j.GraphDatabase('http://localhost:7474');

/**
 * Get total number of nodes
 */
function getNodeCount(processCountFunc) {

    var query = [
        'START n=node(*)',
        'RETURN count(n)'
    ].join('\n');

    db.query(query, {}, function (err, results) {
        if (err) throw err;
        var n = results[0]["count(n)"];
        processCountFunc(n);
    });

}

/**
 * Generates non-repeating node index
 */
var prevNodeIndex = -1;
function getRndNodeIndex(numNodes) {

    var rnd;

    while (true) {
        rnd = Math.round(Math.random() * (numNodes - 1));
        if (rnd != prevNodeIndex) {
            prevNodeIndex = rnd;
            return rnd;
        }
    }

}

/**
 * Asynchronously returns a node by index
 */
function getNodeByIndex(i, processNodeFunc) {

    var query = [
        'START n=node(*)',
        'RETURN n',
        'SKIP {rnd} LIMIT 1'
    ].join('\n');

    db.query(query, {"rnd": i}, function (err, results) {
        if (err) throw err;
        var n = results[0]['n'];
        processNodeFunc(n);
    });

}

function createGetNodeTask(nodeIndex) {
    return function(cb) {
        getNodeByIndex(nodeIndex, function(n) {
            cb(null, n);
        });
    };
}

function generateResponse(nodeRequests, response) {
    async.series(nodeRequests, function(err, results) {

        if (err) {
            response.writeHeader(500, {"Content-Type": "text/plain"});
            response.write("Internal server error");
            response.end();
            return;
        }

        /*
         return question
         */

        var question = {options: new Array()};

        for (var i = 0; i < results.length; i++) {
            question.options.push(results[i].data);
        }

        response.writeHeader(200, {"Content-Type": "application/json; charset=UTF-8"});
        response.write(JSON.stringify(question));
        response.end();

    });
}

http.createServer(function (request, response){

    if (request.url != "/question") {
        response.writeHeader(404, {"Content-Type": "text/plain"});
        response.write("Not found");
        response.end();
        return;
    }

    getNodeCount(function(nodeCount) {

        var i;

        var numOfOptions = Math.min(nodeCount - 1, 4);

        // choose node index 1
        var masterNodeIndex = getRndNodeIndex(nodeCount);

        /*
         choose node indices 2..(numOfOptions + 1)
         */
        var nodeIndices = new Array();

        nodeIndices.push(masterNodeIndex);

        for (i = 0; i < numOfOptions; i++) {

            var slaveNodeIndex = getRndNodeIndex(nodeCount);

            // eliminate repetitive indices
            if (nodeIndices.indexOf(slaveNodeIndex) != -1) {
                continue;
            }

            nodeIndices.push(slaveNodeIndex);

        }

        /*
         run async.series() to get nodes
         */
        var nodeRequests = new Array();

        for (i = 0; i < nodeIndices.length; i++) {
            nodeRequests.push(createGetNodeTask(nodeIndices[i]));
        }

        generateResponse(nodeRequests, response);

    });

}).listen(80);

console.log("The server is running...");
