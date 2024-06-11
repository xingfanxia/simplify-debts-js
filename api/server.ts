import express from 'express';
import bodyParser from 'body-parser';
const dot2svg = require('@aduh95/viz.js/async');

class Edge {
    startNode: string;
    endNode: string;
    weight: number;

    constructor(startNode: string, endNode: string, weight: number) {
        this.startNode = startNode;
        this.endNode = endNode;
        this.weight = weight;
    }

    toGraphvizString(): string {
        return `${this.startNode} -> ${this.endNode} [ label="${this.weight.toFixed(2)}" ];`;
    }

    toString(): string {
        return `${this.startNode} -> ${this.endNode}: ${this.weight.toFixed(2)}`;
    }

    normalize() {
        if (this.weight < 0) {
            this.weight *= -1;
            [this.startNode, this.endNode] = [this.endNode, this.startNode];
        }
    }
}

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));

const SEARCH_COMMENT = /^(#| *$)/;
const SEARCH_EDGE = /(\w+|\*) *-> *(\w+|\*): *([0-9]+(\.[0-9]+)?)/;
const SEARCH_NODE = /^(\w+)$/;

const parseEdge = (line: string): Edge => {
    const m = SEARCH_EDGE.exec(line);
    if (m) {
        console.log('Matched groups:', m); // Debugging line
        const startNode = m[1];
        const endNode = m[2];
        const weight = parseFloat(m[3]);
        return new Edge(startNode, endNode, weight);
    }
    throw new Error("Invalid input line");
};

const splitStarNodes = (edges: Edge[], emptyNodes: string[], verbose: boolean): Edge[] => {
    const nodes = Array.from(new Set([...emptyNodes, ...edges.map(e => e.startNode !== '*' ? e.startNode : '').filter(Boolean), ...edges.map(e => e.endNode !== '*' ? e.endNode : '').filter(Boolean)]));
    if (verbose) {
        console.log(`Found these ${nodes.length} unique nodes: ${nodes}`);
    }
    const newEdges: Edge[] = [];
    edges.forEach(edge => {
        if (edge.startNode === '*') {
            nodes.forEach(node => {
                if (node !== edge.endNode) {
                    newEdges.push(new Edge(node, edge.endNode, edge.weight / nodes.length));
                }
            });
        } else if (edge.endNode === '*') {
            nodes.forEach(node => {
                if (node !== edge.startNode) {
                    newEdges.push(new Edge(edge.startNode, node, edge.weight / nodes.length));
                }
            });
        } else {
            newEdges.push(edge);
        }
    });
    return newEdges;
};

const addWeight = (weights: { [key: string]: number }, nodeName: string, weightDelta: number) => {
    weights[nodeName] = (weights[nodeName] || 0) + weightDelta;
};

const getNodeWeights = (edges: Edge[]): { [key: string]: number } => {
    const weights: { [key: string]: number } = {};
    edges.forEach(edge => {
        addWeight(weights, edge.endNode, edge.weight);
        addWeight(weights, edge.startNode, -edge.weight);
    });
    return weights;
};

const sortWeights = (weights: { [key: string]: number }): [number, string][] => {
    return Object.entries(weights).map(([key, value]) => [value as number, key] as [number, string]).sort((a, b) => a[0] - b[0]);
};

const removeZeroWeights = (weights: [number, string][]): [number, string][] => {
    return weights.filter(w => w[0] !== 0);
};

const findGreaterWeight = (weightComp: number, weights: { [key: string]: number }): string | null => {
    for (const [node, weight] of Object.entries(weights)) {
        if (weight >= weightComp) {
            return node;
        }
    }
    return null;
};

const weightsToEdges = (sortedWeights: [number, string][], weights: { [key: string]: number }): Edge[] => {
    const edges: Edge[] = [];
    for (let i = 0; i < sortedWeights.length - 1; i++) {
        const currentNode = sortedWeights[i][1];
        const currentWeight = weights[currentNode];
        if (currentWeight === 0) continue;

        const transact = Math.abs(currentWeight);
        let target = findGreaterWeight(transact, weights);
        if (!target) {
            target = sortedWeights[i + 1][1];
        }
        edges.push(new Edge(currentNode, target, transact));
        weights[target] += currentWeight;
    }
    return edges;
};

app.post('/parse', async (req, res) => {
    const input: string = req.body.input;
    const lines: string[] = input.split('\n');
    console.log('Input lines:', lines); // Debugging line
    const edges: Edge[] = [];
    const emptyNodes: string[] = [];
    const errors: string[] = [];

    lines.forEach((line: string, i: number) => {
        line = line.trim(); // Trim any extra whitespace
        console.log(`Processing line ${i + 1}: '${line}'`); // Debugging line
        try {
            edges.push(parseEdge(line));
        } catch (err) {
            if (SEARCH_NODE.test(line)) {
                emptyNodes.push(line);
            } else if (!SEARCH_COMMENT.test(line)) {
                errors.push(`Invalid input on line ${i + 1}: ${line}`);
            }
        }
    });

    if (errors.length > 0) {
        res.status(400).send(errors.join('\n'));
        return;
    }

    const verbose = false;
    const edgesAfterSplit = splitStarNodes(edges, emptyNodes, verbose);
    const weights = getNodeWeights(edgesAfterSplit);
    let sortedWeights = sortWeights(weights);
    sortedWeights = removeZeroWeights(sortedWeights);
    const finalEdges = weightsToEdges(sortedWeights, weights);

    const graphvizString = `digraph G {
${finalEdges.map(edge => edge.toGraphvizString()).join('\n')}
}`;
    console.log('Graphviz String:', graphvizString); // Debugging line

    try {
        const svg = await dot2svg(graphvizString);
        res.send(`
            <div>
                ${svg}
            </div>
            <a href="/">Back</a>
        `);
    } catch (err) {
        console.error('Render Error:', err); // Log the error for debugging
        res.status(500).send('Error rendering Graphviz image');
    }
});

app.get('/', (req, res) => {
    res.send(`
        <html>
        <head>
            <title>Split Debt Better!</title>
        </head>
        <body>
            <h1>Split Debt Better! A Simple Debt Simplifier</h1>
            <p>I created this because even tho this feature already exists in the app Splitwise, but not every one has a splitwise account and it seems fun to implement it myself. \n\n</p>
            
            <p>Basically it's a graph problem and we can always simplify any number of transactions among n person to n-1 transactions.</p>

            <p>I know this UI is dead simple and looks shitty, hopefully gpt can be
            good enough some day to make this more pleasing.</p>
            <h2>How to use</h2>
            <p>Enter your graph definition in the textarea below. Use the following format:</p>
            <pre>
# Everyone owes Joe (Including Joe himself, i.e. Joe paid for everyone involved for a bill)
* -> Joe: 16.80

# Sue owes Joe
Sue -> Joe: 24.40

# Bob owes Sue
Bob -> Sue: 12.20

# Ellen is part of all the debt and didn't pay for anything
Ellen
                </pre>
            <form action="/parse" method="post">
                <textarea name="input" rows="10" cols="30"></textarea><br>
                <input type="submit" value="Submit">
            </form>
        </body>
        </html>
    `);
});

if (process.env.NODE_ENV !== 'production') {
    const PORT = 3000;
    app.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
    });
}

export default app;