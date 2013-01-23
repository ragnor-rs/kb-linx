/*
 * TODO: prepare test graph with Gephi (with Neo4j NOT running)
 * TODO: i18n
 * TODO: add question answering method
 */

var http = require("http");
var neo4j = require("neo4j");
var async = require("async");

var db = new neo4j.GraphDatabase('http://localhost:7474');

var numNodes = 2;
var prevNodeIndex;

/**
 * Generates non-repeating node index
 */
function getRndNodeIndex () {

    var rnd;

    while (true) {
        rnd = Math.round(Math.random() * (numNodes - 1) + 1);
        if (rnd != prevNodeIndex) {
            prevNodeIndex = rnd;
            return rnd;
        }
    }

}

/**
 * Asynchronously returns a node by index
 */
function getNodeByIndex(i, cb) {

    var query = [
        'START n=node(*)',
        'RETURN n',
        'SKIP {rnd} LIMIT 1'
    ].join('\n');

    var params = {
        rnd: i
    };

    db.query(query, params, function (err, results) {
        if (err) throw err;
        var n = results[0]['n'];
        cb(n);
    });

}

var numOfOptions = 4;

function makeNodeGetFunc(nodeIndex) {
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
            question.options.push({
                id: results[i].id,
                name: results[i].name
            });
        }

        response.writeHeader(200, {"Content-Type": "application/json"});
        response.write(JSON.stringify(question));
        response.end();

    });
}

http.createServer(function (request, response){

    if (request.path != "question") {
        response.writeHeader(404, {"Content-Type": "text/plain"});
        response.write("Not found");
        response.end();
        return;
    }

    var i;

    // choose node index 1
    var masterNodeIndex = getRndNodeIndex();

    /*
     choose node indices 2..(numOfOptions + 1)
     */
    var slaveNodeIndices = new Array();

    slaveNodeIndices.push(masterNodeIndex);

    for (i = 0; i < numOfOptions; i++) {

        var nodeIndex = getRndNodeIndex();

        // eliminate repetitive indices
        if (slaveNodeIndices.indexOf(nodeIndex) != -1) {
            continue;
        }

        slaveNodeIndices.push(nodeIndex);

    }

    /*
     run async.series() to get nodes
     */
    var nodeRequests = new Array();

    for (i = 0; i < slaveNodeIndices.length; i++) {
        nodeRequests.push(makeNodeGetFunc(slaveNodeIndices[i]));
    }

    generateResponse(nodeRequests, response);

}).listen(80);

console.log("The server is running...");
