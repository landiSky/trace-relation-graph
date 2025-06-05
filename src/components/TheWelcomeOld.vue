
<template>
  <div ref="container" class="graph-container"></div>
</template>

<script setup>
/*
注意点：
1、 默认几层需要后端判断
2、 默认展开三层，第三层需要给我hasChildren字段来显示扩展按钮

实现复杂功能点：
1、展开收起需要收起子节点和其节点下所有有关联的连接线
2、环形关联前提下，需要从左向右按照层次布局
3、点击节点有小球流动动画，并且在drage布局情况下需要手动计算路径走势
4、动画需要判断按方向走势，多路径走势
5、拖拽节点时候需要重新计算路径小球动画走势
6、点击多次拖拽多次需要删除之前小球实例，重绘生成，不会会生成多个小球动画
7、支持画布拖拽，缩放，自适应
8、动态获取数据需要考虑：
    添加了fetchChildren模拟API请求
    扩展handleNodeClick处理动态加载逻辑
    使用loadingNodes集合防止重复请求
    检查现有子节点避免重复加载
    添加加载状态可视化（需在节点绘制代码中添加loading图标）
*/

import { ref, onMounted, reactive, nextTick } from "vue";
import G6 from "@antv/g6";

const container = ref(null);
const graph = ref(null);
let activeNodeId = ref(null);
const animationCache = new Map();
// const collapsedNodes = new Map(); // 存储已收起节点ID

const collapsedNodes = reactive(new Map());
const loadingNodes = reactive(new Set());
const nodeData = reactive({
  // nodes: new Array(12).fill(0).map((_, i) => ({ id: `${i}`, label: `${i}` })),
  nodes: [
    {
      id: "0",
      label: "0",
      // children: ["1", "2", "3", "4", "7"], // 支持ID引用或嵌套对象
    },
    {
      id: "1",
      label: "1",
      // children: [], // 支持ID引用或嵌套对象
    },
    {
      id: "2",
      label: "2",
      // children: [], // 支持ID引用或嵌套对象
    },
    {
      id: "3",
      label: "3",
      //  children: [], // 支持ID引用或嵌套对象
    },
    {
      id: "4",
      label: "4",
      //  children: ["5", "6"], // 支持ID引用或嵌套对象
    },
    {
      id: "5",
      label: "5",
      children: [], // 支持ID引用或嵌套对象 // 6
      hasChildren: true,
    },
    // {
    //   id: "6",
    //   label: "6",
    //  // children: ['11'], // 支持ID引用或嵌套对象
    // },
    {
      id: "7",
      label: "7",
      // children: ["8", "9"], // 支持ID引用或嵌套对象
    },
    {
      id: "8",
      label: "8",
      children: [], // 支持ID引用或嵌套对象 // 9
      hasChildren: true,
    },
    // {
    //   id: "9",
    //   label: "9",
    //   children: ['12'], // 支持ID引用或嵌套对象
    // },
  ],
  edges: [
    { source: "0", target: "1" },
    { source: "0", target: "2" },
    { source: "0", target: "3" },
    { source: "0", target: "4" },
    { source: "0", target: "5" },
    // { source: "6", target: "0" },
    { source: "0", target: "7" },
    { source: "0", target: "8" },
    { source: "2", target: "0" },
    { source: "4", target: "5" },
    // { source: "4", target: "6" },
    // { source: "5", target: "6" },
    { source: "5", target: "0" },
    { source: "7", target: "8" },
    // { source: "5", target: "6" },
    // { source: "8", target: "9" },
    // { source: "8", target: "10" },
    // { source: "6", target: "11" },
    // { source: "9", target: "12" },
    // { source: "9", target: "5" },
  ],
});

// 自定义节点类型
G6.registerNode("expand-node", {
  draw(cfg, group) {
    const r = cfg.size || 30;
    if (!graph.value.getNeighbors) return;
    // const hasChildren = graph.value.getNeighbors(cfg.id, "target").length > 0;
    const hasChildren = cfg.hasChildren;
    // console.log("cfg", cfg, cfg.children);
    const circle = group.addShape("circle", {
      attrs: {
        x: 0,
        y: 0,
        r,
        fill: cfg.style?.fill || "#DEE9FF",
        stroke: cfg.style?.stroke || "#5B8FF9",
        lineWidth: 2,
      },
    });

    group.addShape("text", {
      attrs: {
        text: cfg.label,
        x: 0,
        y: 0,
        textAlign: "center",
        textBaseline: "middle",
        fill: "#333",
      },
    });
    if (hasChildren) {
      const buttonSize = 4;
      const buttonGroup = group.addGroup(); // 创建独立容器
      // 按钮背景
      buttonGroup.addShape("circle", {
        attrs: {
          x: r * 0.01,
          y: -r * 0.01,
          r: buttonSize,
          fill: "#fff",
          stroke: "#999",
          cursor: "pointer",
        },
        name: "expand-button-bg",
      });
      const isCollapsed = collapsedNodes.has(cfg.id);
      // 调整按钮组坐标：x方向移动到右侧边缘
      buttonGroup.setMatrix([1, 0, 0, 0, 1, 0, r * 1.2, 0, 1]);
      buttonGroup.addShape("path", {
        attrs: {
          path: isCollapsed
            ? [
                ["M", -1, 0],
                ["L", 5, 0],
              ]
            : [
                ["M", -2, 0],
                ["L", 2, 0],
                ["M", 0, -2],
                ["L", 0, 2],
              ],
          stroke: "#000",
          lineWidth: 1,
        },
        name: "button-symbol",
      });
    }
    return circle;
  },
});

// 判断节点是否在右侧
const isNodeOnRight = (parentNode, childNode) => {
  return childNode.getModel().x > parentNode.getModel().x;
};

// 获取右侧子节点
const getRightChildren = (nodeId) => {
  const node = graph.value.findById(nodeId);
  const children = graph.value.getNeighbors(nodeId, "target");
  return children.filter((child) => isNodeOnRight(node, child));
};

// 安全递归获取右侧子节点
const getSafeRightChildren = (nodeId, visited = new Set()) => {
  if (visited.has(nodeId)) return [];
  visited.add(nodeId);

  const children = getRightChildren(nodeId);
  let allChildren = [...children];

  if (visited.size > 100) {
    console.warn("检测到可能的循环引用", nodeId);
    return allChildren;
  }

  children.forEach((child) => {
    allChildren = [
      ...allChildren,
      ...getSafeRightChildren(child.getID(), visited),
    ];
  });

  return allChildren;
};

// 清除所有动画
// const clearAllAnimations = () => {
//   animationCache.forEach(anim => anim.stop());
//   animationCache.clear();
// };

// 创建边动画
const createEdgeAnimation = (edge) => {
  const group = edge.getContainer();
  const shape = group.find((e) => e.get("name") === "edge-shape");

  const circle = group.addShape("circle", {
    attrs: {
      x: 0,
      y: 0,
      r: 6,
      fill: "#1890FF",
      shadowColor: "#1890FF",
      shadowBlur: 10,
    },
    name: "moving-circle",
  });

  const animation = circle.animate(
    (ratio) => {
      const pos = shape.getPoint(ratio);
      return { x: pos.x, y: pos.y };
    },
    {
      duration: 3000,
      repeat: true,
    }
  );

  animationCache.set(edge.getID(), animation);
};

// 更新所有动画
// const updateAnimations = () => {
//   clearAllAnimations();
//   graph.value.getEdges().forEach(edge => {
//     if(!isEdgeHidden(edge)) {
//       createEdgeAnimation(edge);
//     }
//   });
// };

// 判断边是否被隐藏
const isEdgeHidden = (edge) => {
  return (
    collapsedNodes.has(edge.getSource().getID()) ||
    collapsedNodes.has(edge.getTarget().getID())
  );
};

// 收起右侧子节点
const collapseRightChildren = (nodeId) => {
  const children = getSafeRightChildren(nodeId);
  const childIds = children.map((n) => n.getID());
  const edges = graph.value
    .getEdges()
    .filter((edge) => childIds.includes(edge.getTarget().getID()));

  collapsedNodes.set(nodeId, {
    children: childIds,
    edges: edges.map((e) => e.getID()),
  });

  childIds.forEach((id) => graph.value.hideItem(id));
  edges.forEach((edge) => graph.value.hideItem(edge.getID()));

  graph.value.updateItem(nodeId, {
    style: { fill: "#FFE0B2", stroke: "#FFA726" },
  });

  // updateAnimations();
};

// 展开节点
const expandNode = (nodeId) => {
  const data = collapsedNodes.get(nodeId);
  if (!data) return; // 需要判断是请求过的还是收起过的

  data.children.forEach((id) => graph.value.showItem(id));
  data.edges.forEach((id) => graph.value.showItem(id));

  graph.value.updateItem(nodeId, {
    style: { fill: "#DEE9FF", stroke: "#5B8FF9" },
  });

  collapsedNodes.delete(nodeId);
  // updateAnimations();
};

// 定义正三角形箭头路径（高度为d）
const createEquilateralArrow = (d) => {
  const height = d; // 箭头高度（顶点到底边垂直距离）
  const sideLength = (2 * height) / Math.sqrt(3); // 计算边长
  const halfBase = sideLength / 2; // 底边一半长度

  // SVG路径指令
  return [
    ["M", 0, 0], // 起始点为顶点（箭头尖端）
    ["L", -halfBase, height], // 左下角
    ["L", halfBase, height], // 右下角
    ["Z"], // 闭合路径
  ];
};

const clearAllAnimations = () => {
  animationCache.forEach((anim, edgeId) => {
    if (anim && typeof anim.stop === "function") {
      anim.stop();
    }
  });
  animationCache.clear();

  graph.value.getEdges().forEach((edge) => {
    edge
      .getContainer()
      .findAll((child) => child.get("name") === "moving-circle")
      .forEach((c) => c.remove());
  });
};

const updateEdgeAnimation = (edge, nodeId) => {
  activeNodeId.value = nodeId;
  const edgeId = edge.getID();
  const edgeGroup = edge.getContainer();
  const keyShape = edge.getKeyShape();
  const path = keyShape.attr("path");

  // 停止旧动画
  if (animationCache.has(edgeId)) {
    const cachedAnim = animationCache.get(edgeId);
    if (cachedAnim && typeof cachedAnim.stop === "function") {
      cachedAnim.stop();
    }
    animationCache.delete(edgeId);
  }

  // 清除现有标记
  edgeGroup
    .findAll((child) => child.get("name") === "moving-circle")
    .forEach((c) => c.remove());

  const circle = edgeGroup.addShape("circle", {
    attrs: {
      x: path[0][1],
      y: path[0][2],
      r: 8,
      fill: "#FF6B6B",
      shadowColor: "#FF0000",
      shadowBlur: 10,
    },
    name: "moving-circle",
  });

  const animation = circle.animate(
    (ratio) => {
      const start = { x: path[0][1], y: path[0][2] };
      const end = { x: path[1][1], y: path[1][2] };
      return {
        x: start.x + (end.x - start.x) * ratio,
        y: start.y + (end.y - start.y) * ratio,
      };
    },
    {
      duration: 2000,
      repeat: true,
      // easing: 'easeCubicInOut'
    }
  );
  animationCache.set(edgeId, animation);
};

onMounted(() => {
  // const initNode = new Array(10)
  //   .fill(0)
  //   .map((_, i) => ({ id: `${i}`, label: `${i}` }));

  graph.value = new G6.Graph({
    container: container.value,
    width: window.innerWidth,
    height: window.innerHeight,
    modes: {
      default: ["click-select", "drag-node", "drag-canvas"],
    },
    layout: {
      type: "dagre",
      rankdir: "LR",
      nodesep: 14,
      edgesep: 30,
      // 启用自动层级检测
      sortByCombo: true,
    },
    defaultNode: { type: "expand-node", size: 20 },
    // defaultNode: {
    //   type: "circle",
    //   size: 40,
    //   style: {
    //     fill: "#C6E5FF",
    //     stroke: "#5B8FF9",
    //   },
    // },
    defaultEdge: {
      type: "line",
      style: {
        lineWidth: 1,
        stroke: "#00A57C",
        lineDash: [6, 5], // 添加虚线样式配置
        endArrow: {
          path: G6.Arrow.triangle(10, 12, 4), // 宽度10，高度12，偏移25
          fill: "#1890ff", // 填充颜色
          d: 4, // 偏移距离
        },
      },
    },
  });

  graph.value.data(nodeData);
  graph.value.render();

  // 拖拽时实时更新所有边动画
  graph.value.on("node:drag", (e) => {
    const nodeId = e.item.getModel().id;
    clearAllAnimations();
    graph.value.getEdges().forEach((edge) => {
      if (edge.getModel().source === nodeId) {
        updateEdgeAnimation(edge, nodeId);
      }
    });
  });

  // 初始渲染动画
  // graph.value.on('afterrender', () => {
  //   graph.value.getEdges().forEach(edge => {
  //     updateEdgeAnimation(edge);
  //   });
  // });

  // 模拟API请求获取子节点
  const fetchChildren = async (nodeId) => {
    // const mockData = {
    //   5: [{ id: "6", label: "6" }],
    //   8: [{ id: "9", label: "9" }],
    // };
    const response = await fetch("/childData1.json");
    return response.json();
  };

  // 在changeData前校验边数据
  // const validateEdges = (edges) => {
  //   return edges.filter((edge) => {
  //     const sourceExists = nodeData.nodes.some((n) => n.id === edge.source);
  //     const targetExists = nodeData.nodes.some((n) => n.id === edge.target);
  //     return sourceExists && targetExists; // 确保边两端节点存在:ml-citation{ref="6" data="citationList"}
  //   });
  // };

  const safeUpdateGraph = () => {
    if (!graph.value || !graph.value.changeData) return;

    // 数据格式转换（兼容4.x）
    const formattedNodes = nodeData.nodes.map((node) => ({
      ...node,
      x: node.x, // 必须包含坐标
      y: node.y,
      size: 20,
      style: { fill: "#DEE9FF", stroke: "#5B8FF9" },
    }));

    // 边数据过滤（防止关联节点不存在）
    const validEdges = nodeData.edges.filter(
      (edge) =>
        nodeData.nodes.some((n) => n.id === edge.source) &&
        nodeData.nodes.some((n) => n.id === edge.target)
    );

    try {
      // graph.value.changeData({
      //   nodes: formattedNodes,
      //   edges: validEdges,
      // });
      // graph.value.refreshPositions(); // 关键方法
      console.log('')
      graph.value.data(nodeData);
      graph.value.render();
    } catch (err) {
      console.error("更新失败:", err);
      // initGraph(); // 重建实例
    }
  };

  // 点击节点触发关联边动画
  graph.value.on("node:click", (e) => {
    const nodeId = e.item.getModel().id;
    clearAllAnimations();
    const shape = e.target.get("name");
    // 区别点击节点小球还是扩展按钮
    if (shape === "expand-button-bg" || shape === "button-symbol") {
      console.log("collapse", loadingNodes.has(nodeId));
      // 先判断是否存在子节点
      // 第一次没有子节点，这里请求数据，注意请求过的就不在请求

      if (loadingNodes.has(nodeId)) return;
      // 检查是否已有子节点数据
      const hasExistingChildren = nodeData.edges.some(
        (edge) => edge.source === nodeId // 判断原有数据是否存在当前子节点的关联
      );
      console.log("hasExistingChildren", hasExistingChildren);
      if (!hasExistingChildren) {
        try {
          loadingNodes.add(nodeId);
          fetchChildren(nodeId)
            .then(async (children) => {
              console.log('fetchChildren', children)
              // 更新数据源，添加children
              const parentNode = nodeData.nodes.find((n) => n.id === nodeId);
              // nodeData.nodes.push(...data.nodes);
              // nodeData.edges.push(...data.edges);
              children.nodes.forEach((child) => {
                if (!nodeData.nodes.some((n) => n.id === child.id)) {
                  nodeData.nodes.push({
                    ...child,
                    x: null, // 布局器自动计算
                    y: null,
                  });
                }
              });
              nodeData.edges = [...nodeData.edges, ...children.edges];
              parentNode.children = [
                ...(parentNode.children || []),
                ...children.nodes.map((c) => c.id),
              ];
              console.log("nodeData", nodeData, children);
              // 重新渲染
              await nextTick();
              safeUpdateGraph();
              // console.log("nodeData nextTick", nodeData, data);
              // graph.value.changeData({
              //   nodes: [...nodeData.nodes],
              //   edges: [...nodeData.edges]
              // });
              // // 重新布局
              // graph.value.layout();
              // graph.value.changeData({ nodes: [...nodeData.nodes], edges: [...nodeData.edges] });
              // graph.value.refreshItem(nodeId);
              // graph.value.layout();
            })
            .catch((e) => {
              console.log(111, e);
              loadingNodes.delete(nodeId);
            }); // 请求子节点
        } finally {
          console.log(222);
          loadingNodes.delete(nodeId);
        }
      }
      // return;
      collapsedNodes.has(nodeId)
        ? expandNode(nodeId)
        : collapseRightChildren(nodeId);
      return;
    }
    console.log("click");
    graph.value.getEdges().forEach((edge) => {
      if (edge.getModel().source === nodeId) {
        updateEdgeAnimation(edge, nodeId);
      }
    });
  });
});
</script>

<style scoped>
.graph-container {
  width: 100%;
  height: 100%;
}
</style>
