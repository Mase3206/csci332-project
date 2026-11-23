export class DirectedNode {
    public neighbors: Array<DirectedNode> = $state(new Array<DirectedNode>());
    public pre: number = $state(-1);
    public post: number = $state(-1);
    public visited: boolean = $state(false);
    public name: string = $state("");

    constructor(name: string) {
        this.name = name;
    }

    isNeighborsWith(node: DirectedNode): boolean {
        return (this.neighbors.includes(node));
    }

    /**
     * Makes the `node` a neighbor of this node.
     * Returns `false` if the node is already a neighbor, `true` otherwise.
     */
    makeNeighbor(node: DirectedNode): boolean {
        if (!this.isNeighborsWith(node)) {
            this.neighbors.push(node);
            return true;
        } else {
            return false;
        }
    }
}


export type DfsStep = {
    label: string;
    clock: number;
    activeNode: string | null;
    path: Array<string>;
    backtrackFrom: string | null;
    backtrackTo: string | null;
    siblingFrom: string | null;
    sharedRoot: string | null;
    pre: Record<string, number>;
    post: Record<string, number>;
    visited: Array<string>;
};


export class DirectedGraph {
    public nodes: Array<DirectedNode>;  // This becomes a Svelte $state().
    public clock: number = $state(0);
    
    
    get headNode(): DirectedNode {
        return this.nodes[0];
    }
    
    constructor(nodes: Array<DirectedNode>) {
        this.nodes = $state(nodes);
        this.clock = 0;
    }
    
    dfs(v: DirectedNode): void {
        this.clock = 0;
        for (const node of this.nodes) {
            node.visited = false;
            node.pre = -1;
            node.post = -1;
        }
        this.dfsRecursive(v);
    }

    private dfsRecursive(v: DirectedNode): void {
        if (v.visited) return;

        v.visited = true;
        this.clock++;
        v.pre = this.clock;
        
        v.neighbors.forEach(neighbor => {
            if (!neighbor.visited) this.dfsRecursive(neighbor);
        });

        this.clock++;
        v.post = this.clock;
    }

    dfsAll(): void {
        this.clock = 0;
        for (const node of this.nodes) {
            node.visited = false;
            node.pre = -1;
            node.post = -1;
        }

        for (const node of this.nodes) {
            if (!node.visited) this.dfsRecursive(node);
        }
    }

    buildDfsSteps(): Array<DfsStep> {
        const pre: Record<string, number> = {};
        const post: Record<string, number> = {};
        const visited = new Set<string>();
        const steps: Array<DfsStep> = [];
        const callStack: Array<string> = [];
        let clock = 0;

        const snapshot = (
            label: string,
            activeNode: string | null,
            backtrackFrom: string | null = null,
            backtrackTo: string | null = null
        ): void => {
            steps.push({
                label,
                clock,
                activeNode,
                path: [...callStack],
                backtrackFrom,
                backtrackTo,
                siblingFrom: null,
                sharedRoot: null,
                pre: { ...pre },
                post: { ...post },
                visited: [...visited]
            });
        };

        for (const node of this.nodes) {
            pre[node.name] = -1;
            post[node.name] = -1;
        }
        snapshot("Before depth-first search", null);

        const visit = (
            node: DirectedNode,
            siblingFrom: string | null = null,
            sharedRoot: string | null = null
        ): void => {
            if (visited.has(node.name)) return;

            visited.add(node.name);
            clock++;
            pre[node.name] = clock;
            callStack.push(node.name);
            snapshot(`Preprocess ${node.name}`, node.name);
            if (siblingFrom && sharedRoot) {
                steps[steps.length - 1].siblingFrom = siblingFrom;
                steps[steps.length - 1].sharedRoot = sharedRoot;
                steps[steps.length - 1].label =
                    `Preprocess ${node.name} (sibling of ${siblingFrom}; share root ${sharedRoot})`;
            }

            for (let index = 0; index < node.neighbors.length; index++) {
                const neighbor = node.neighbors[index];
                if (!visited.has(neighbor.name)) {
                    const earlierNeighbor = node.neighbors
                        .slice(0, index)
                        .find((candidate) => visited.has(candidate.name));
                    visit(neighbor, earlierNeighbor?.name ?? null, earlierNeighbor ? node.name : null);
                }
            }

            clock++;
            post[node.name] = clock;
            snapshot(`Postprocess ${node.name}`, node.name);
            callStack.pop();

            if (callStack.length > 0) {
                const parent = callStack[callStack.length - 1];
                snapshot(`Backtrack ${node.name} \u2192 ${parent}`, parent, node.name, parent);
            }
        };

        for (const node of this.nodes) {
            if (!visited.has(node.name)) visit(node);
        }

        return steps;
    }
}




export function defaultGraph(): DirectedGraph {
    let A = new DirectedNode('A');
    let B = new DirectedNode('B');
    let C = new DirectedNode('C');
    let D = new DirectedNode('D');
    let E = new DirectedNode('E');
    let F = new DirectedNode('F');
    let G = new DirectedNode('G');
    let H = new DirectedNode('H');
    let I = new DirectedNode('I');
    let J = new DirectedNode('J');
    let K = new DirectedNode('K');

    A.makeNeighbor(B);
    A.makeNeighbor(D);

    B.makeNeighbor(C);
    B.makeNeighbor(D);
    B.makeNeighbor(H);

    C.makeNeighbor(H);
    C.makeNeighbor(K);

    D.makeNeighbor(E);

    E.makeNeighbor(F);
    E.makeNeighbor(G);
    E.makeNeighbor(K);

    // F has no outgoing connections

    G.makeNeighbor(F);

    H.makeNeighbor(I);
    H.makeNeighbor(J);

    // I, J, and K have no outgoing connections

    return new DirectedGraph([A, B, C, D, E, F, G, H, I, J, K]);;
}
