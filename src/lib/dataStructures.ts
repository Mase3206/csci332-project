class Node<T> {
    public next: Node<T> | null = null;
    public prev: Node<T> | null = null;
    // public visited: boolean = false;
    constructor(public data: T) {}

    // hasNext(): boolean { return this.next != null; }
}


export class Stack<T> {
    private top: Node<T> | null = null;

    isEmpty(): boolean {
        return (this.top == null);
    }

    push(data: T): void {
        let node = new Node(data);
        if (this.top == null) {
            this.top = node;
        } else {
            // let prevTop = this.top;
            this.top.next = node;  // previousTop points to new
            node.prev = this.top;  // new points to previousTop
            this.top = node;       // replace with prevTop with new
        }
    }

    pop(): T {
        if (this.top == null) {
            throw Error("Can't pop from this stack, stack is empty")

        } else {
            let toPop = this.top;
            // If this top has a previous node, make that one the new top.
            if (this.top.prev != null) {
                let prev = this.top.prev;
    
                prev.next = null;  // The prev (new top) will have no next
                this.top = prev;   // Set the top to the prev
    
            }
            return toPop.data;
        }
    }

    peek(): Node<T> | null {
        // return this.top ? this.top.data : null;
        return this.top;
    }

    clear(): void {
        while (!this.isEmpty) {
            this.pop();
        }
    }
}
