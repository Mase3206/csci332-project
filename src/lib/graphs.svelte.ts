import { Stack } from '#lib/dataStructures.ts';

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


export class DirectedGraph {
    public nodes: Array<DirectedNode>;  // This becomes a Svelte $state().
    public clock: number = $state(0);

    get headNode(): DirectedNode {
        return this.nodes[0];
    }

    constructor(nodes: Array<DirectedNode>) {
        this.nodes = $state(nodes);
    }

    dfs(v: DirectedNode): void {
        // let stack = new Stack<DirectedNode>();
        this.clock = 0;

        v.visited = true;
        this.clock++;
        v.pre = this.clock;

        v.neighbors.forEach(neighbor => {
            this.dfs(neighbor);
            this.clock++;
            v.post = this.clock;
        })

        // v.neighbors.forEach(neighbor => {
        //     stack.push(neighbor)
        // });

        // while (!stack.isEmpty()) {

            // if (stack.peek()!.prev != null) {
            //     let w: DirectedNode = stack.peek()!.prev!.data;
            //     if (!w.visited) {
            //         w.visited = true;
            //         w.neighbors.forEach(n => {
            //             stack.push(n)
            //         });
            //     }
            // }
        // }
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
