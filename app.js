/*
 * DONE question generation (http://localhost/getQuestion)
 * DONE relationship creation (http://localhost/submitAnswer?target=3&required=4)
 * TODO web interface
 * TODO bot protection
 * TODO i18n
 */

var http = require("http");
var neo4j = require("neo4j");
var async = require("async");
var url = require('url');

var db = new neo4j.GraphDatabase('http://localhost:7474');

/**
 * Get total number of nodes
 */
function getNodeCount(processCountFunc) {
    db.query('START n=node(*)\nRETURN count(n)', {}, function (err, results) {
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
    while (true) {
        var rnd = Math.round(Math.random() * (numNodes - 1));
        if (rnd != prevNodeIndex) {
            prevNodeIndex = rnd;
            return rnd;
        }
    }
}

function createGetNodeByIndexTask(nodeIndex) {
    return function(cb) {
        db.query('START n=node(*)\nRETURN n\nSKIP {rnd} LIMIT 1', {"rnd": nodeIndex}, function (err, results) {
            if (err) throw err;
            var n = results[0]['n'];
            cb(null, n);
        });
    };
}

function createGetNodeByIdTask(nodeId) {
    return function(cb) {
        db.getNodeById(nodeId, cb);
    };
}

function createSaveRelationshipTask(n1, n2) {
    return function(cb) {
        db.query('START a=node({id2}), b=node({id1})\nMATCH (a)-[r]->(b)\nRETURN r', {

            "id1": n1.id,
            "id2": n2.id

        }, function (err, results) {

            if (err) throw err;

            if (results.length == 0) {

                // create new relationship
                n1.createRelationshipFrom(n2, "is based on", {"strength": 1}, cb);

            } else {

                // relationship already exists - increase strength
                var r = results[0]["r"];
                if (r.data.strength) {
                    r.data.strength++;
                } else {
                    r.data["strength"] = 1;
                }
                r.save(cb);

            }

        });
    };
}

function loadNodesAndQuestion (nodeRequests, response) {
    async.parallel(nodeRequests, function(err, results) {

        if (err) {
            response.writeHeader(500, {"Content-Type": "text/plain"});
            response.write("Internal server error");
            response.end();
            return;
        }

        var question = {
            target: results[0].data,
            required: new Array()
        };

        for (var i = 1; i < results.length; i++) {
            question.required.push(results[i].data);
        }

        response.writeHeader(200, {"Content-Type": "application/json; charset=UTF-8"});
        response.write(JSON.stringify(question));
        response.end();

    });
}

function saveRelationshipsAndNotify (relationshipSaveTasks, response) {
    async.parallel(relationshipSaveTasks, function(err, results) {

        if (err) {
            response.writeHeader(500, {"Content-Type": "text/plain"});
            response.write("Internal server error");
            response.end();
        } else {
            response.writeHeader(200, {"Content-Type": "text/plain"});
            response.write("Ok");
            response.end();
        }

    });
}

function loadNodesAndAnswer (nodeRequests, response) {
    async.parallel(nodeRequests, function(err, results) {

        if (err) {
            response.writeHeader(500, {"Content-Type": "text/plain"});
            response.write("Internal server error");
            response.end();
            return;
        }

        var i;

        /*
         save relationships
         */
        var relationshipSaveTasks = new Array();
        for (i = 1; i < results.length; i++) {
            relationshipSaveTasks.push(createSaveRelationshipTask(results[0], results[i]));
        }
        saveRelationshipsAndNotify(relationshipSaveTasks, response);

    });
}

function processQuestionRequest (request, response) {
    getNodeCount(function(nodeCount) {

        var i;

        /*
         create array of node indices
         */
        var nodeIndices = new Array();
        var numOfOptions = Math.min(nodeCount - 1, 4);
        nodeIndices.push(getRndNodeIndex(nodeCount));
        for (i = 0; i < numOfOptions; i++) {
            var slaveNodeIndex = getRndNodeIndex(nodeCount);
            if (nodeIndices.indexOf(slaveNodeIndex) != -1) {
                continue;
            }
            nodeIndices.push(slaveNodeIndex);
        }

        /*
         generate question
         */
        var nodeRequests = new Array();
        for (i = 0; i < nodeIndices.length; i++) {
            nodeRequests.push(createGetNodeByIndexTask(nodeIndices[i]));
        }
        loadNodesAndQuestion(nodeRequests, response);

    });
}

function submitAnswer(request, response) {

    var i;

    var query = url.parse(request.url, true).query;
    var targetNodeId = query["target"];
    var requiredNodeIds = query["required"].split(" ");

    /*
     submit answer
     */
    var nodeGetTasks = new Array();
    nodeGetTasks.push(createGetNodeByIdTask(targetNodeId));
    for (i = 0; i < requiredNodeIds.length; i++) {
        var nodeId = parseInt(requiredNodeIds[i]);
        nodeGetTasks.push(createGetNodeByIdTask(nodeId));
    }
    loadNodesAndAnswer(nodeGetTasks, response);

}

http.createServer(function (request, response){

    if (request.url == "/getQuestion") {
        processQuestionRequest(request, response);
    } else if (request.url.indexOf("/submitAnswer?") == 0) {
        submitAnswer(request, response);
    } else {
        response.writeHeader(404, {"Content-Type": "text/plain"});
        response.write("Not found");
        response.end();
    }

}).listen(80);

console.log("The server is running...");
