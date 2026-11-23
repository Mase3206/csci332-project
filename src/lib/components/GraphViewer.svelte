<script lang="ts">
  import { onMount } from "svelte";
  import { DirectedNode, DirectedGraph, defaultGraph, type DfsStep } from "#lib/graphs.svelte.ts";
  import { Range, Label, Button } from "flowbite-svelte";

  let graph: DirectedGraph = $state(defaultGraph());
  let nodes: Array<DirectedNode> = $derived(graph.nodes);
  let diameter = $state(60);
  
  // region Node movement
  let areaElement: HTMLDivElement | undefined = $state();
  let dragging: { node: DirectedNode; offsetX: number; offsetY: number } | null = $state(null);
  let hovering: DirectedNode | null = $state(null);
  let hasUserPositioned = false;
  let positions = $state<Record<string, { x: number; y: number }>>(
    Object.fromEntries(
      graph.nodes.map((node, index) => [
        node.name,
        {
          x: 80 + (index % 4) * 150,
          y: 80 + Math.floor(index / 4) * 150
        }
      ])
    )
  );

  let edges = $derived(
    nodes.flatMap((source) =>
      source.neighbors.map((target) => ({ source, target }))
    )
  );

  function positionOf(node: DirectedNode, index = nodes.indexOf(node)): { x: number; y: number } {
    return positions[node.name] ?? {
      x: 80 + (index % 4) * 150,
      y: 80 + Math.floor(index / 4) * 150
    };
  }

  function moveTo(node: DirectedNode, x: number, y: number): void {
    positions[node.name] = { x, y };
  }

  function calculateDepths(): Map<DirectedNode, number> {
    const depths = new Map<DirectedNode, number>(nodes.map((node) => [node, 0]));
    const indegree = new Map<DirectedNode, number>(nodes.map((node) => [node, 0]));

    for (const source of nodes) {
      for (const target of source.neighbors) {
        indegree.set(target, (indegree.get(target) ?? 0) + 1);
      }
    }

    const queue = nodes.filter((node) => (indegree.get(node) ?? 0) === 0);
    const remaining = new Map(indegree);

    while (queue.length > 0) {
      const source = queue.shift();
      if (!source) break;

      for (const target of source.neighbors) {
        depths.set(target, Math.max(depths.get(target) ?? 0, (depths.get(source) ?? 0) + 1));
        remaining.set(target, (remaining.get(target) ?? 1) - 1);
        if (remaining.get(target) === 0) queue.push(target);
      }
    }

    return depths;
  }

  function centeredAxisPosition(index: number, count: number, start: number, end: number): number {
    if (count <= 1) return (start + end) / 2 - diameter / 2;
    return start + (index * (end - start)) / (count - 1) - diameter / 2;
  }

  function runAutoLayout(rect: Pick<DOMRect, 'width' | 'height'>): void {
    if (nodes.length === 0) return;

    const depths = calculateDepths();
    const maxDepth = Math.max(0, ...depths.values());
    const groups = Array.from({ length: maxDepth + 1 }, () => [] as DirectedNode[]);

    for (const node of nodes) {
      groups[depths.get(node) ?? 0].push(node);
    }

    const yByNode = new Map<DirectedNode, number>();
    for (const group of groups) {
      group.forEach((node, index) => yByNode.set(node, index * 150));
    }

    for (let pass = 0; pass < 8; pass++) {
      for (let depth = 1; depth <= maxDepth; depth++) {
        const incomingPosition = (node: DirectedNode): number => {
          const predecessors = nodes.filter((source) => source.neighbors.includes(node));
          if (predecessors.length === 0) return yByNode.get(node) ?? 0;
          return predecessors.reduce((sum, source) => sum + (yByNode.get(source) ?? 0), 0) / predecessors.length;
        };
        groups[depth].sort((a, b) => incomingPosition(a) - incomingPosition(b));
        groups[depth].forEach((node, index) => yByNode.set(node, index * 150));
      }

      for (let depth = maxDepth - 1; depth >= 0; depth--) {
        const outgoingPosition = (node: DirectedNode): number => {
          if (node.neighbors.length === 0) return yByNode.get(node) ?? 0;
          return node.neighbors.reduce((sum, target) => sum + (yByNode.get(target) ?? 0), 0) / node.neighbors.length;
        };
        groups[depth].sort((a, b) => outgoingPosition(a) - outgoingPosition(b));
        groups[depth].forEach((node, index) => yByNode.set(node, index * 150));
      }
    }

    const paddingX = 80;
    const paddingY = 80;
    const usableWidth = Math.max(diameter * 2, rect.width - paddingX * 2);
    const usableHeight = Math.max(diameter * 2, rect.height - paddingY * 2);

    for (let depth = 0; depth <= maxDepth; depth++) {
      const group = groups[depth];
      const x = maxDepth === 0
        ? (rect.width - diameter) / 2
        : paddingX + (depth * usableWidth) / maxDepth - diameter / 2;

      group.forEach((node, index) => {
        const y = centeredAxisPosition(index, group.length, paddingY, paddingY + usableHeight);
        yByNode.set(node, y);
        moveTo(node, Math.min(Math.max(0, rect.width - diameter), x), y);
      });
    }

    for (const node of nodes) {
      if (!positions[node.name]) moveTo(node, paddingX, paddingY);
    }
  }

  function startDrag(event: PointerEvent, node: DirectedNode): void {
    if (!areaElement) return;

    const rect = areaElement.getBoundingClientRect();
    const position = positionOf(node);
    dragging = {
      node,
      offsetX: event.clientX - rect.left - position.x,
      offsetY: event.clientY - rect.top - position.y
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function dragNode(event: PointerEvent): void {
    if (!dragging || !areaElement) return;

    const rect = areaElement.getBoundingClientRect();
    const maxX = Math.max(0, rect.width - diameter);
    const maxY = Math.max(0, rect.height - diameter);
    const x = Math.min(maxX, Math.max(0, event.clientX - rect.left - dragging.offsetX));
    const y = Math.min(maxY, Math.max(0, event.clientY - rect.top - dragging.offsetY));
    hasUserPositioned = true;
    moveTo(dragging.node, x, y);
  }

  function stopDrag(event: PointerEvent): void {
    if (event.currentTarget instanceof HTMLElement) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragging = null;
  }

  function edgePoint(source: DirectedNode, target: DirectedNode): { x1: number; y1: number; x2: number; y2: number } {
    const sourcePosition = positionOf(source);
    const targetPosition = positionOf(target);
    const sourceX = sourcePosition.x + diameter / 2;
    const sourceY = sourcePosition.y + diameter / 2;
    const targetX = targetPosition.x + diameter / 2;
    const targetY = targetPosition.y + diameter / 2;
    const dx = targetX - sourceX;
    const dy = targetY - sourceY;
    const distance = Math.hypot(dx, dy);
    if (distance === 0) return { x1: sourceX, y1: sourceY, x2: targetX, y2: targetY };

    const unitX = dx / distance;
    const unitY = dy / distance;
    const radius = diameter / 2;
    return {
      x1: sourceX + unitX * radius,
      y1: sourceY + unitY * radius,
      x2: targetX - unitX * (radius + 8),
      y2: targetY - unitY * (radius + 8)
    };
  }

  function moveNodeWithKeyboard(event: KeyboardEvent, node: DirectedNode): void {
    const step = event.shiftKey ? 25 : 10;
    const movement: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step]
    };
    const delta = movement[event.key];
    if (!delta || !areaElement) return;

    event.preventDefault();
    const rect = areaElement.getBoundingClientRect();
    const position = positionOf(node);
    hasUserPositioned = true;
    moveTo(
      node,
      Math.min(Math.max(0, rect.width - diameter), position.x + delta[0]),
      Math.min(Math.max(0, rect.height - diameter), position.y + delta[1])
    );
  }

  onMount(() => {
    if (!areaElement) return;

    runAutoLayout(areaElement.getBoundingClientRect());

    const resizeObserver = new ResizeObserver((entries) => {
      if (hasUserPositioned) return;
      const entry = entries[0];
      if (entry) runAutoLayout(entry.contentRect);
    });
    resizeObserver.observe(areaElement);

    return () => resizeObserver.disconnect();
  });


  function onHover(node: DirectedNode) {
    hovering = node;
  }

  function offHover(node: DirectedNode) {
    hovering = null;
  }
  // endregion Node movement



  // region Preprocess

  let preprocessing = $state(false);
  let dfsSteps = $state<Array<DfsStep>>([]);
  let dfsStepIndex = $state(-1);
  let activeDfsNode = $state<string | null>(null);
  let activeDfsPath = $state<Array<string>>([]);
  let backtrackFrom = $state<string | null>(null);
  let backtrackTo = $state<string | null>(null);
  let siblingFrom = $state<string | null>(null);
  let sharedRoot = $state<string | null>(null);
  let dfsStepLabel = $state("");

  function applyDfsStep(index: number): void {
    const step = dfsSteps[index];
    if (!step) return;

    dfsStepIndex = index;
    dfsStepLabel = step.label;
    activeDfsNode = step.activeNode;
    activeDfsPath = step.path;
    backtrackFrom = step.backtrackFrom;
    backtrackTo = step.backtrackTo;
    siblingFrom = step.siblingFrom;
    sharedRoot = step.sharedRoot;
    graph.clock = step.clock;

    for (const node of nodes) {
      node.visited = step.visited.includes(node.name);
      node.pre = step.pre[node.name] ?? -1;
      node.post = step.post[node.name] ?? -1;
    }
  }

  function resetDfs(): void {
    graph.clock = 0;
    for (const node of nodes) {
      node.visited = false;
      node.pre = -1;
      node.post = -1;
    }
  }

  function togglePreprocessing(): void {
    if (!preprocessing) {
      preprocessing = true;

      if (dfsSteps.length === 0 || dfsStepIndex < 0) {
      resetDfs();
      dfsSteps = graph.buildDfsSteps();
      applyDfsStep(0);
      } else {
        applyDfsStep(dfsStepIndex);
      }
    } else {
      preprocessing = false;
    }
  }

  function clearDfs(): void {
    preprocessing = false;
    dfsStepIndex = -1;
    dfsStepLabel = "";
    activeDfsNode = null;
    activeDfsPath = [];
    backtrackFrom = null;
    backtrackTo = null;
    siblingFrom = null;
    sharedRoot = null;
    dfsSteps = [];
    resetDfs();
  }

  function previousDfsStep(): void {
    if (dfsStepIndex > 0) applyDfsStep(dfsStepIndex - 1);
  }

  function nextDfsStep(): void {
    if (dfsStepIndex >= 0 && dfsStepIndex < dfsSteps.length - 1) {
      applyDfsStep(dfsStepIndex + 1);
    }
  }

  function isDfsEdge(source: DirectedNode, target: DirectedNode): boolean {
    for (let index = 0; index < activeDfsPath.length - 1; index++) {
      if (activeDfsPath[index] === source.name && activeDfsPath[index + 1] === target.name) {
        return true;
      }
    }
    return false;
  }

  // endregion
</script>

<style>
  .viewer {
    display: flex;
    min-height: 0;
    height: 100vh;
    /* height: 100%; */
    /* flex: 1; */
    &>* {
      margin: 8px;
    }
  }
  .toolbar {
    width: 15%;
    /* height: 100%; */
    border: 2px solid black;
    border-radius: 8px;
    padding: 16px;

    >:global(*) {
      margin-bottom: 8px;
    }
    h2 {
      font-weight: bold;
    }
  }

  .area {
    position: relative;
    flex-grow: 1;
    border: 2px solid black;
    border-radius: 8px;
    overflow: hidden;
    padding: 16px;
  }

  .edges {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 1;
  }

  .graph-node {
    position: absolute;
    border-radius: 50%;
    border: 2px solid black;
    padding: 4px;
    background-color: lightblue;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    cursor: grab;
    user-select: none;
    touch-action: none;
    z-index: 2;
    &:active {
      cursor: grabbing;
    }
    &:hover {
      background: lightgreen;
    }
  }

  .dfs-active {
    outline: 4px solid orange;
  }

  .dfs-backtrack-from {
    outline: 4px dashed crimson;
  }

  .dfs-backtrack-to {
    outline: 4px solid crimson;
  }

  .dfs-sibling {
    outline: 4px solid purple;
  }

  .dfs-arrow {
    stroke: orange;
    stroke-width: 4px;
  }

  .backtrack-label {
    color: crimson;
    font-weight: bold;
  }

  .sibling-label {
    color: purple;
    font-weight: bold;
  }

  .coordinates {
    font-family: monospace;
  }

  hr {
    margin: 16px 0px !important;
  }

  .order {
    display: flex;
    flex-direction: row;
  }
  .order-pre {
    color: red;
    font-size: 12px;
    margin-right: 12px;
  }
  .order-post {
    color: green;
    font-size: 12px;
  }
</style>

<div class="viewer">
  <div class="toolbar">
    <h2>Settings</h2>
    <Label>Node diameter: {diameter}</Label>
    <Range id="nodeDiameter" min=40 max=100 bind:value={diameter} />
    
    <hr />

    <h2>Preprocessing</h2>
    <Button onclick={togglePreprocessing} class="w-full">{preprocessing ? 'Stop' : dfsStepIndex >= 0 ? 'Resume' : 'Start'}</Button>
    <div class="flex">
      <Button onclick={previousDfsStep} disabled={!preprocessing || dfsStepIndex <= 0} class="mr-2 grow">Prev</Button>
      <Button onclick={nextDfsStep} disabled={!preprocessing || dfsStepIndex >= dfsSteps.length - 1} class="grow">Next</Button>
    </div>
    <Button onclick={clearDfs} disabled={!dfsSteps.length && dfsStepIndex < 0} class="w-full">Clear ordering</Button>
    <div class="min-h-18">
      {#if preprocessing}
        <p><span class="font-bold">Step:</span> {dfsStepLabel}</p>
        {#if backtrackFrom && backtrackTo}
          <p class="backtrack-label">Backtracking {backtrackFrom} &rarr; {backtrackTo} (return to parent)</p>
        {/if}
        {#if siblingFrom && sharedRoot}
          <p class="sibling-label">{siblingFrom} and {activeDfsNode} share root {sharedRoot}</p>
        {/if}
      {/if}
    </div>

    <hr />

    <h2>Topological sorting</h2>
    <Button onclick={() => {alert("farts")}} class="w-full">Topologize</Button>
    <div class="flex">
      <Button onclick={() => {}} class="mr-2 grow">Prev</Button>
      <Button onclick={() => {}} class="grow">Next</Button>
    </div>
    <Button onclick={() => {}} class="w-full">Reset topo sort</Button>
  </div>


  <div class="area" bind:this={areaElement}>
    <!-- Arrows -->
    <svg class="edges" aria-hidden="true">
      <defs>
        <marker id="dag-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="black"></path>
        </marker>
        <marker id="dfs-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="orange"></path>
        </marker>
      </defs>
      {#each edges as edge (edge)}
        {const points = $derived(edgePoint(edge.source, edge.target))}
        {const dfsEdge = $derived(isDfsEdge(edge.source, edge.target))}
        <line
          class={dfsEdge ? "dfs-arrow" : ""}
          x1={points.x1}
          y1={points.y1}
          x2={points.x2}
          y2={points.y2}
          stroke={dfsEdge ? "orange" : "black"}
          stroke-width="2"
          marker-end={dfsEdge ? "url(#dfs-arrow)" : "url(#dag-arrow)"}
        ></line>
      {/each}
    </svg>

    <!-- Nodes -->
    {#each nodes as node (node)}
      {const position = $derived(positionOf(node))}
      <div
        class={[
          "graph-node",
          activeDfsNode === node.name ? "dfs-active" : "",
          backtrackFrom === node.name ? "dfs-backtrack-from" : "",
          backtrackTo === node.name ? "dfs-backtrack-to" : "",
          siblingFrom && activeDfsNode === node.name ? "dfs-sibling" : ""
        ]}
        role="button"
        tabindex="0"
        style="left: {position.x}px; top: {position.y}px; width: {diameter}px; height: {diameter}px; {dragging?.node == node ? 'background-color: #ffaeae;' : ''}"
        onpointerdown={(event) => startDrag(event, node)}
        onpointermove={dragNode}
        onpointerup={stopDrag}
        onpointercancel={stopDrag}
        onkeydown={(event) => moveNodeWithKeyboard(event, node)}
        onmouseover={() => onHover(node)}
        onfocus={() => onHover(node)}
        onmouseout={() => offHover(node)}
        onblur={() => offHover(node)}
      >
        <p>
          {node.name}
        </p>

        <div class="order">
          {#if node.pre >= 0}
            <p class="order-pre">{node.pre}</p>
          {/if}
          {#if node.post >= 0}
            <p class="order-post">{node.post}</p> 
          {/if}
        </div>
      </div>
    {/each}

    <!-- Node coordinates (if hover or drag) -->
    <div class="coordinates">
      {#if dragging != null}
        {let pos = $derived(positionOf(dragging.node))}
        {Math.floor(pos.x)} x {Math.floor(pos.y)}
      {:else if hovering != null}
        {let pos = $derived(positionOf(hovering))}
        {Math.floor(pos.x)} x {Math.floor(pos.y)}
      {/if}
    </div>
  </div>
</div>
