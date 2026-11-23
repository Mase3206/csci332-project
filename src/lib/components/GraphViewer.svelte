<script lang="ts">
  import { onMount } from "svelte";
  import { DirectedNode, DirectedGraph, defaultGraph, type DfsStep } from "#lib/graphs.svelte.ts";
  import { Range, Label, Button, Checkbox } from "flowbite-svelte";

  let graph: DirectedGraph = $state(defaultGraph());
  let nodes: Array<DirectedNode> = $derived(graph.nodes);
  let diameter = $state(60);
  let endpointGap = $state(4);
  
  // region Node movement
  let areaElement: HTMLDivElement | undefined = $state();
  let dragging: { node: DirectedNode; offsetX: number; offsetY: number } | null = $state(null);
  let hovering: DirectedNode | null = $state(null);
  let hasUserPositioned = false;
  let topologicalLayout = $state(false);
  let programmaticMove = $state(false);
  let movementTimer: ReturnType<typeof setTimeout> | undefined;
  let preTopologicalPositions = $state<Record<string, { x: number; y: number }>>({});
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

  function snapshotPositions(): Record<string, { x: number; y: number }> {
    return Object.fromEntries(
      nodes.map((node) => [node.name, { ...positionOf(node) }])
    );
  }

  function applyTopologicalLayout(): void {
    if (!topologicalLayout || !areaElement) return;

    const rect = areaElement.getBoundingClientRect();
    const sortedNodes = nodes
      .filter((node) => node.post >= 0)
      .sort((left, right) => right.post - left.post);

    const padding = 40;
    const spacing = diameter + 44;
    const sortedWidth = Math.max(diameter, rect.width - padding * 2);
    const columns = Math.max(1, Math.floor(sortedWidth / spacing));
    const sortedBandHeight = rect.height * 0.42;
    const sortedTop = rect.height - sortedBandHeight;

    programmaticMove = true;
    if (movementTimer) clearTimeout(movementTimer);
    movementTimer = setTimeout(() => programmaticMove = false, 260);

    const unsortedNodes = nodes.filter((node) => node.post < 0);
    const unsortedAreaTop = 24;
    const unsortedAreaBottom = Math.max(unsortedAreaTop, sortedTop - diameter - 24);
    const unsortedOriginalXs = unsortedNodes.map((node) => {
      const saved = preTopologicalPositions[node.name];
      return saved?.x ?? positionOf(node).x;
    });
    const unsortedOriginalYs = unsortedNodes.map((node) => {
      const saved = preTopologicalPositions[node.name];
      return saved?.y ?? positionOf(node).y;
    });
    const originalMaxY = Math.max(...unsortedOriginalYs, unsortedAreaBottom);
    const originalMinY = Math.min(...unsortedOriginalYs, unsortedAreaTop);
    const yRange = Math.max(1, originalMaxY - originalMinY);
    const unsortedYs = unsortedNodes.map((node) => {
      const originalY = unsortedOriginalYs[unsortedNodes.indexOf(node)];
      return unsortedAreaTop +
        ((originalY - originalMinY) / yRange) *
        Math.max(0, unsortedAreaBottom - unsortedAreaTop);
    });

    unsortedNodes.forEach((node, index) => {
      moveTo(
        node,
        unsortedOriginalXs[index],
        Math.min(rect.height - diameter, unsortedYs[index])
      );
    });

    sortedNodes.forEach((node, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const rows = Math.max(1, Math.ceil(sortedNodes.length / columns));
      const bandCenter = sortedTop + (rect.height - sortedTop - diameter) / 2;
      const y = rows === 1
        ? bandCenter
        : bandCenter - ((rows - 1) * (diameter + 32)) / 2 + row * (diameter + 32);
      const x = sortedNodes.length === 1
        ? (rect.width - diameter) / 2
        : padding + (column * (rect.width - padding * 2 - diameter)) / Math.max(1, columns - 1);
      moveTo(
        node,
        Math.min(Math.max(0, rect.width - diameter), x),
        Math.min(Math.max(0, rect.height - diameter), y)
      );
    });
  }

  function setTopologicalLayout(enabled: boolean): void {
    if (enabled === topologicalLayout) return;

    if (enabled) {
      preTopologicalPositions = snapshotPositions();
      topologicalLayout = true;
      applyTopologicalLayout();
    } else {
      topologicalLayout = false;
      programmaticMove = true;
      if (movementTimer) clearTimeout(movementTimer);
      movementTimer = setTimeout(() => programmaticMove = false, 260);
      for (const node of nodes) {
        const position = preTopologicalPositions[node.name];
        if (position) moveTo(node, position.x, position.y);
      }
    }
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
    // const endpointGap = 4;
    return {
      x1: sourceX + unitX * (radius + endpointGap),
      y1: sourceY + unitY * (radius + endpointGap),
      x2: targetX - unitX * (radius + endpointGap),
      y2: targetY - unitY * (radius + endpointGap)
    };
  }

  function pulledArrowShaftEnd(points: { x1: number; y1: number; x2: number; y2: number }, buffer = 4): { x: number; y: number } {
    const dx = points.x2 - points.x1;
    const dy = points.y2 - points.y1;
    const distance = Math.hypot(dx, dy);
    if (distance === 0) return { x: points.x2, y: points.y2 };
    return {
      x: points.x2 - (dx / distance) * buffer,
      y: points.y2 - (dy / distance) * buffer
    };
  }

  function archedEdgePoints(source: DirectedNode, target: DirectedNode): { x1: number; y1: number; x2: number; y2: number } {
    return edgePoint(source, target);
  }

  function curvedEdgeGeometry(source: DirectedNode, target: DirectedNode): {
    d: string;
    target: { x: number; y: number };
    angle: number;
  } {
    const sourcePosition = positionOf(source);
    const targetPosition = positionOf(target);
    const sourceCenter = {
      x: sourcePosition.x + diameter / 2,
      y: sourcePosition.y + diameter / 2
    };
    const targetCenter = {
      x: targetPosition.x + diameter / 2,
      y: targetPosition.y + diameter / 2
    };
    const dx = targetCenter.x - sourceCenter.x;
    const dy = targetCenter.y - sourceCenter.y;
    const distance = Math.hypot(dx, dy);
    const unitX = distance === 0 ? 1 : dx / distance;
    const unitY = distance === 0 ? 0 : dy / distance;
    const normalX = -unitY;
    const normalY = unitX;
    const baseSpan = Math.max(
      diameter * 0.75,
      Math.abs(dx) * 0.35,
      Math.abs(dy) * 0.35
    );

    const candidates = [-1, 1].flatMap((side) => [1, 1.35, 1.7].map((scale) => {
      const span = baseSpan * scale;
      const sourceOutX = unitX + normalX * side * 0.75;
      const sourceOutY = unitY + normalY * side * 0.75;
      const targetOutX = -unitX + normalX * side * 0.75;
      const targetOutY = -unitY + normalY * side * 0.75;
      const sourceOutLength = Math.hypot(sourceOutX, sourceOutY);
      const targetOutLength = Math.hypot(targetOutX, targetOutY);
      const sourceUnitX = sourceOutX / sourceOutLength;
      const sourceUnitY = sourceOutY / sourceOutLength;
      const targetUnitX = targetOutX / targetOutLength;
      const targetUnitY = targetOutY / targetOutLength;
      const radius = diameter / 2 + 4;
      const sourcePoint = {
        x: sourceCenter.x + sourceUnitX * radius,
        y: sourceCenter.y + sourceUnitY * radius
      };
      const targetPoint = {
        x: targetCenter.x + targetUnitX * radius,
        y: targetCenter.y + targetUnitY * radius
      };
      const departure = Math.max(18, span * 0.7);
      const control1X = sourcePoint.x + sourceUnitX * departure;
      const control1Y = sourcePoint.y + sourceUnitY * departure;
      const control2X = targetPoint.x + targetUnitX * departure;
      const control2Y = targetPoint.y + targetUnitY * departure;
      const intersections = edges.reduce((count, other) => {
        if (other.source === source && other.target === target) return count;
        const otherPoints = archedEdgePoints(other.source, other.target);
        if (cubicIntersectsSegment(
          sourcePoint.x,
          sourcePoint.y,
          control1X,
          control1Y,
          control2X,
          control2Y,
          targetPoint.x,
          targetPoint.y,
          otherPoints.x1,
          otherPoints.y1,
          otherPoints.x2,
          otherPoints.y2
        )) return count + 1;
        return count;
      }, 0);
      const clearance = cubicMinimumNodeClearance(
        sourcePoint.x,
        sourcePoint.y,
        control1X,
        control1Y,
        control2X,
        control2Y,
        targetPoint.x,
        targetPoint.y,
        source,
        target
      );
      return {
        side,
        sourcePoint,
        targetPoint,
        control1X,
        control1Y,
        control2X,
        control2Y,
        intersections,
        clearance
      };
    }));

    candidates.sort((left, right) => {
      if (left.intersections !== right.intersections) {
        return left.intersections - right.intersections;
      }
      return right.clearance - left.clearance;
    });
    const clearCandidates = candidates.filter((candidate) => candidate.clearance >= 18);
    const selected = clearCandidates[0] ?? candidates[0];
    const tangentX = selected.targetPoint.x - selected.control2X;
    const tangentY = selected.targetPoint.y - selected.control2Y;
    const tangentLength = Math.hypot(tangentX, tangentY);
    const tangentUnitX = tangentLength === 0 ? -1 : tangentX / tangentLength;
    const tangentUnitY = tangentLength === 0 ? 0 : tangentY / tangentLength;
    const shaftEnd = {
      x: selected.targetPoint.x - tangentUnitX * 4,
      y: selected.targetPoint.y - tangentUnitY * 4
    };
    return {
      d: `M ${selected.sourcePoint.x} ${selected.sourcePoint.y} C ${selected.control1X} ${selected.control1Y}, ${selected.control2X} ${selected.control2Y}, ${shaftEnd.x} ${shaftEnd.y}`,
      target: selected.targetPoint,
      angle: Math.atan2(tangentY, tangentX)
    };
  }

  function arrowheadPoints(
    x: number,
    y: number,
    angle: number,
    size: number
  ): string {
    const directionX = Math.cos(angle);
    const directionY = Math.sin(angle);
    const normalX = -directionY;
    const normalY = directionX;
    const baseX = x - directionX * size;
    const baseY = y - directionY * size;
    const halfWidth = size * 0.38;
    return [
      `${x},${y}`,
      `${baseX + normalX * halfWidth},${baseY + normalY * halfWidth}`,
      `${baseX - normalX * halfWidth},${baseY - normalY * halfWidth}`
    ].join(" ");
  }

  function quadraticIntersectsSegment(
    x1: number,
    y1: number,
    cx: number,
    cy: number,
    x2: number,
    y2: number,
    sx1: number,
    sy1: number,
    sx2: number,
    sy2: number
  ): boolean {
    for (let index = 0; index < 20; index++) {
      const start = index / 20;
      const end = (index + 1) / 20;
      const point = (t: number): { x: number; y: number } => ({
        x: (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * cx + t * t * x2,
        y: (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * cy + t * t * y2
      });
      const a = point(start);
      const b = point(end);
      const abx = b.x - a.x;
      const aby = b.y - a.y;
      const acx = sx1 - a.x;
      const acy = sy1 - a.y;
      const adx = sx2 - a.x;
      const ady = sy2 - a.y;
      const cross = (x: number, y: number, u: number, v: number): number => x * v - y * u;
      const c1 = cross(abx, aby, acx, acy);
      const c2 = cross(abx, aby, adx, ady);
      if (c1 * c2 <= 0) return true;
    }
    return false;
  }

  function cubicPoint(
    t: number,
    x1: number,
    y1: number,
    c1x: number,
    c1y: number,
    c2x: number,
    c2y: number,
    x2: number,
    y2: number
  ): { x: number; y: number } {
    const oneMinusT = 1 - t;
    return {
      x: oneMinusT ** 3 * x1 +
        3 * oneMinusT ** 2 * t * c1x +
        3 * oneMinusT * t ** 2 * c2x +
        t ** 3 * x2,
      y: oneMinusT ** 3 * y1 +
        3 * oneMinusT ** 2 * t * c1y +
        3 * oneMinusT * t ** 2 * c2y +
        t ** 3 * y2
    };
  }

  function cubicIntersectsSegment(
    x1: number,
    y1: number,
    c1x: number,
    c1y: number,
    c2x: number,
    c2y: number,
    x2: number,
    y2: number,
    sx1: number,
    sy1: number,
    sx2: number,
    sy2: number
  ): boolean {
    for (let index = 0; index < 24; index++) {
      const start = index / 24;
      const end = (index + 1) / 24;
      const a = cubicPoint(start, x1, y1, c1x, c1y, c2x, c2y, x2, y2);
      const b = cubicPoint(end, x1, y1, c1x, c1y, c2x, c2y, x2, y2);
      const abx = b.x - a.x;
      const aby = b.y - a.y;
      const acx = sx1 - a.x;
      const acy = sy1 - a.y;
      const adx = sx2 - a.x;
      const ady = sy2 - a.y;
      const cross = (x: number, y: number, u: number, v: number): number => x * v - y * u;
      if (cross(abx, aby, acx, acy) * cross(abx, aby, adx, ady) <= 0) return true;
    }
    return false;
  }

  function cubicMinimumNodeClearance(
    x1: number,
    y1: number,
    c1x: number,
    c1y: number,
    c2x: number,
    c2y: number,
    x2: number,
    y2: number,
    source: DirectedNode,
    target: DirectedNode
  ): number {
    let minimum = Infinity;
    for (const node of nodes) {
      if (node === source || node === target) continue;
      const position = positionOf(node);
      const centerX = position.x + diameter / 2;
      const centerY = position.y + diameter / 2;
      for (let index = 1; index < 24; index++) {
        const point = cubicPoint(index / 24, x1, y1, c1x, c1y, c2x, c2y, x2, y2);
        minimum = Math.min(
          minimum,
          Math.hypot(point.x - centerX, point.y - centerY) - diameter / 2
        );
      }
    }
    return minimum === Infinity ? 100 : minimum;
  }

  function quadraticMinimumNodeClearance(
    x1: number,
    y1: number,
    cx: number,
    cy: number,
    x2: number,
    y2: number,
    source: DirectedNode,
    target: DirectedNode
  ): number {
    let minimum = Infinity;

    for (const node of nodes) {
      if (node === source || node === target) continue;
      const position = positionOf(node);
      const centerX = position.x + diameter / 2;
      const centerY = position.y + diameter / 2;

      for (let index = 1; index < 20; index++) {
        const t = index / 20;
        const x =
          (1 - t) * (1 - t) * x1 +
          2 * (1 - t) * t * cx +
          t * t * x2;
        const y =
          (1 - t) * (1 - t) * y1 +
          2 * (1 - t) * t * cy +
          t * t * y2;
        const clearance = Math.hypot(x - centerX, y - centerY) - diameter / 2;
        minimum = Math.min(minimum, clearance);
      }
    }

    return minimum === Infinity ? 100 : minimum;
  }

  function shouldCurveEdge(source: DirectedNode, target: DirectedNode): boolean {
    if (!topologicalLayout) return false;
    const sourcePosition = positionOf(source);
    const targetPosition = positionOf(target);

    const sourceCenter = { x: sourcePosition.x + diameter / 2, y: sourcePosition.y + diameter / 2 };
    const targetCenter = { x: targetPosition.x + diameter / 2, y: targetPosition.y + diameter / 2 };
    return nodes.some((node) => {
      if (node === source || node === target) return false;
      const nodePosition = positionOf(node);
      const nodeCenter = {
        x: nodePosition.x + diameter / 2,
        y: nodePosition.y + diameter / 2
      };
      const dx = targetCenter.x - sourceCenter.x;
      const dy = targetCenter.y - sourceCenter.y;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared === 0) return false;
      const t = Math.max(
        0,
        Math.min(
          1,
          ((nodeCenter.x - sourceCenter.x) * dx +
            (nodeCenter.y - sourceCenter.y) * dy) /
            distanceSquared
        )
      );
      const closestX = sourceCenter.x + t * dx;
      const closestY = sourceCenter.y + t * dy;
      return Math.hypot(closestX - nodeCenter.x, closestY - nodeCenter.y) < diameter / 2 + 4;
    });
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
    
    topologicalLayout = false;

    runAutoLayout(areaElement.getBoundingClientRect());

    const resizeObserver = new ResizeObserver((entries) => {
      if (hasUserPositioned) return;
      const entry = entries[0];
      if (entry) {
        runAutoLayout(entry.contentRect);
        if (topologicalLayout) applyTopologicalLayout();
      }
    });
    resizeObserver.observe(areaElement);

    return () => {
      resizeObserver.disconnect();
      if (movementTimer) clearTimeout(movementTimer);
    };
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
    applyTopologicalLayout();
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
    setTopologicalLayout(false);
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

  let preprocessingStartStopButtonText: string = $derived((() => {
      {
      if (!preprocessing) {
        if (dfsStepIndex < 0 || dfsSteps.length <= 0) {
          return 'Start'
        } else {
          return 'Resume'
        }

      } else {
        if (dfsStepIndex < dfsSteps.length - 1) {
          return 'Stop'
        } else {
          return 'Done'
        }
      }
    }
  })())
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
    width: 20%;
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

  .sorted-band {
    position: absolute;
    left: 16px;
    right: 16px;
    bottom: 16px;
    height: 42%;
    border: 2px dashed #94a3b8;
    border-radius: 12px;
    pointer-events: none;
    z-index: 0;
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

  .topo-moving {
    transition: left 240ms ease, top 240ms ease;
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
    <h2>Topo Sort Visualizer</h2>
    <p>
      This tool demonstrates how the DFS post order can be directly used to create the topological sort of a directed acyclical graph.
    </p>
    <p>
      Click "Start" below to begin preprocessing. Check "Sort topologically" to topo sort the graph live as the post-order is being determined.
    </p>

    <hr />

    <h2>Settings</h2>
    <div class="flex">
      <Label class="grow">Node diameter: {diameter}</Label>
      <Button onclick={() => {diameter = 60}} size="xs" color="secondary" class="px-1.5 py-0 text-[9px]">Reset</Button>
    </div>
    <Range min=40 max=100 bind:value={diameter} />

    <div class="flex">
      <Label class="grow">Arrow padding: {endpointGap}</Label>
      <Button onclick={() => {endpointGap = 4}} size="xs" color="secondary" class="px-1.5 py-0 text-[9px]">Reset</Button>
    </div>
    <Range min=4 max=24 bind:value={endpointGap} />
    
    <hr />

    <h2>Preprocessing</h2>
    <Button onclick={togglePreprocessing} class="w-full">{preprocessingStartStopButtonText}</Button>
    <div class="flex">
      <Button onclick={previousDfsStep} disabled={!preprocessing || dfsStepIndex <= 0} class="mr-2 grow">Prev</Button>
      <Button onclick={nextDfsStep} disabled={!preprocessing || dfsStepIndex >= dfsSteps.length - 1} class="grow">Next</Button>
    </div>
    <Button onclick={clearDfs} disabled={!dfsSteps.length && dfsStepIndex < 0} class="w-full">Clear ordering</Button>
    <Checkbox checked={topologicalLayout} onchange={(event) => setTopologicalLayout(event.currentTarget.checked)}>Sort topologically</Checkbox>
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
  </div>


  <div class="area" bind:this={areaElement}>
    {#if topologicalLayout}
      <div class="sorted-band" aria-hidden="true"></div>
    {/if}

    <!-- Arrows -->
    <svg class="edges" aria-hidden="true">
      {#each edges as edge (edge)}
        {const points = $derived(edgePoint(edge.source, edge.target))}
        {const dfsEdge = $derived(isDfsEdge(edge.source, edge.target))}
        {const curveEdge = $derived(shouldCurveEdge(edge.source, edge.target))}
        {#if topologicalLayout && curveEdge}
          {const curvedGeometry = $derived(curvedEdgeGeometry(edge.source, edge.target))}
          <path
            class={dfsEdge ? "dfs-arrow" : ""}
            d={curvedGeometry.d}
            fill="none"
            stroke={dfsEdge ? "orange" : "black"}
            stroke-width="2"
            stroke-linecap="butt"
          ></path>
          <polygon
            points={arrowheadPoints(
              curvedGeometry.target.x,
              curvedGeometry.target.y,
              curvedGeometry.angle,
              12
            )}
            fill={dfsEdge ? "orange" : "black"}
          ></polygon>
        {:else}
          {const shaftEnd = $derived(pulledArrowShaftEnd(points, 4))}
          <line
            class={dfsEdge ? "dfs-arrow" : ""}
            x1={points.x1}
            y1={points.y1}
            x2={shaftEnd.x}
            y2={shaftEnd.y}
            stroke={dfsEdge ? "orange" : "black"}
            stroke-width="2"
            stroke-linecap="butt"
          ></line>
          <polygon
            points={arrowheadPoints(
              points.x2,
              points.y2,
              Math.atan2(points.y2 - points.y1, points.x2 - points.x1),
              topologicalLayout ? 12 : 16
            )}
            fill={dfsEdge ? "orange" : "black"}
          ></polygon>
        {/if}
      {/each}
    </svg>

    <!-- Nodes -->
    {#each nodes as node (node)}
      {const position = $derived(positionOf(node))}
      <div
        class={[
          "graph-node",
          programmaticMove ? "topo-moving" : "",
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
