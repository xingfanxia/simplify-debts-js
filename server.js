"use strict";
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
var express_1 = require("express");
var body_parser_1 = require("body-parser");
var Edge = /** @class */ (function () {
    function Edge(startNode, endNode, weight) {
        this.startNode = startNode;
        this.endNode = endNode;
        this.weight = weight;
    }
    Edge.prototype.toGraphvizString = function () {
        return "".concat(this.startNode, " -> ").concat(this.endNode, " [ label=\"").concat(this.weight.toFixed(2), "\" ];");
    };
    Edge.prototype.toString = function () {
        return "".concat(this.startNode, " -> ").concat(this.endNode, ": ").concat(this.weight.toFixed(2));
    };
    Edge.prototype.normalize = function () {
        var _a;
        if (this.weight < 0) {
            this.weight *= -1;
            _a = [this.endNode, this.startNode], this.startNode = _a[0], this.endNode = _a[1];
        }
    };
    return Edge;
}());
var app = (0, express_1.default)();
app.use(body_parser_1.default.urlencoded({ extended: true }));
app.post('/parse', function (req, res) {
    var input = req.body.input;
    var lines = input.split('\n');
    var edges = [];
    var emptyNodes = [];
    var SEARCH_EDGE = /(\w+|\*) *-> *(\w+|\*): *([0-9]+(\.[0-9]+)?)/;
    var SEARCH_NODE = /^(\w+)$/;
    var SEARCH_COMMENT = /^(#| *$)/;
    lines.forEach(function (line, i) {
        var edgeMatch = SEARCH_EDGE.exec(line);
        if (edgeMatch) {
            var _ = edgeMatch[0], startNode = edgeMatch[1], endNode = edgeMatch[2], weight = edgeMatch[3];
            edges.push(new Edge(startNode, endNode, parseFloat(weight)));
        }
        else if (SEARCH_NODE.test(line)) {
            emptyNodes.push(line.trim());
        }
        else if (!SEARCH_COMMENT.test(line)) {
            res.status(400).send("Invalid input on line ".concat(i + 1, ": ").concat(line.trim()));
            return;
        }
    });
    var splitStarNodes = function (edges, emptyNodes) {
        var nodes = Array.from(new Set(__spreadArray(__spreadArray(__spreadArray([], emptyNodes, true), edges.map(function (e) { return e.startNode !== '*' ? e.startNode : ''; }).filter(Boolean), true), edges.map(function (e) { return e.endNode !== '*' ? e.endNode : ''; }).filter(Boolean), true)));
        var newEdges = [];
        edges.forEach(function (edge) {
            if (edge.startNode === '*') {
                nodes.forEach(function (node) {
                    if (node !== edge.endNode) {
                        newEdges.push(new Edge(node, edge.endNode, edge.weight / nodes.length));
                    }
                });
            }
            else if (edge.endNode === '*') {
                nodes.forEach(function (node) {
                    if (node !== edge.startNode) {
                        newEdges.push(new Edge(edge.startNode, node, edge.weight / nodes.length));
                    }
                });
            }
            else {
                newEdges.push(edge);
            }
        });
        return newEdges;
    };
    var getNodeWeights = function (edges) {
        var weights = {};
        edges.forEach(function (edge) {
            weights[edge.endNode] = (weights[edge.endNode] || 0) + edge.weight;
            weights[edge.startNode] = (weights[edge.startNode] || 0) - edge.weight;
        });
        return weights;
    };
    var sortWeights = function (weights) {
        return Object.entries(weights).map(function (_a) {
            var key = _a[0], value = _a[1];
            return [value, key];
        }).sort(function (a, b) { return a[0] - b[0]; });
    };
    var removeZeroWeights = function (weights) {
        return weights.filter(function (w) { return w[0] !== 0; });
    };
    var findGreaterWeight = function (weightComp, weights) {
        for (var _i = 0, _a = Object.entries(weights); _i < _a.length; _i++) {
            var _b = _a[_i], node = _b[0], weight = _b[1];
            if (weight >= weightComp) {
                return node;
            }
        }
        return null;
    };
    var weightsToEdges = function (sortedWeights, weights) {
        var edges = [];
        for (var i = 0; i < sortedWeights.length - 1; i++) {
            var currentNode = sortedWeights[i][1];
            var currentWeight = weights[currentNode];
            if (currentWeight === 0)
                continue;
            var transact = Math.abs(currentWeight);
            var target = findGreaterWeight(transact, weights);
            if (!target) {
                target = sortedWeights[i + 1][1];
            }
            edges.push(new Edge(currentNode, target, transact));
            weights[target] += currentWeight;
        }
        return edges;
    };
    var edgesAfterSplit = splitStarNodes(edges, emptyNodes);
    var weights = getNodeWeights(edgesAfterSplit);
    var sortedWeights = sortWeights(weights);
    sortedWeights = removeZeroWeights(sortedWeights);
    var finalEdges = weightsToEdges(sortedWeights, weights);
    var graphvizString = "digraph G {\n".concat(finalEdges.map(function (edge) { return edge.toGraphvizString(); }).join('\n'), "\n}");
    res.send("<pre>".concat(graphvizString, "</pre>"));
});
app.get('/', function (req, res) {
    res.send("\n        <form action=\"/parse\" method=\"post\">\n            <textarea name=\"input\" rows=\"10\" cols=\"30\"></textarea><br>\n            <input type=\"submit\" value=\"Submit\">\n        </form>\n    ");
});
var PORT = 3000;
app.listen(PORT, function () {
    console.log("Server is running on http://localhost:".concat(PORT));
});
