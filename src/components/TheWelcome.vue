
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
let ballAnimation = null;

// 储存已经收起的节点id和加载过的数据，下次展开不用再次请求数据
const collapsedNodes = reactive(new Map());
const loadingNodes = reactive(new Set());
const activeEdges = ref(new Set()); // 存储当前激活的边ID
const animationCache = new Map();
const layerCollect = ref(new Map()); //计算每层级Y周的节点个数方便布局使用，防止重叠

const tooltip = new G6.Tooltip({
  offsetX: 10,
  offsetY: 10,
  fixToNode: [1, 0.5],
  // the types of items that allow the tooltip show up
  // 允许出现 tooltip 的 item 类型
  itemTypes: ["node"],
  // custom the tooltip's content
  // 自定义 tooltip 内容
  getContent: (e) => {
    const outDiv = document.createElement("div");
    outDiv.style.width = "fit-content";
    outDiv.style.height = "fit-content";
    const model = e.item.getModel();
    if (e.item.getType() === "node") {
      outDiv.innerHTML = `${model.code}`;
    } else {
      const source = e.item.getSource();
      const target = e.item.getTarget();
      outDiv.innerHTML = `来源：${source.getModel().name}<br/>去向：${
        target.getModel().name
      }`;
    }
    return outDiv;
  },
});

const nodeData = reactive({
  nodes: [
    {
      id: "0",
      label: "0",
      x: 200,
      y: 100,
      // children: ["1", "2", "3", "4", "7"], // 支持ID引用或嵌套对象
    },
    {
      id: "1",
      label: "1",
      x: 400,
      y: 100,
      // children: [], // 支持ID引用或嵌套对象
    },
    {
      id: "2",
      label: "2",
      x: 400,
      y: 200,
      // children: [], // 支持ID引用或嵌套对象
    },
    {
      id: "3",
      label: "3",
      x: 400,
      y: 300,
      children: [], // 支持ID引用或嵌套对象
    },
    {
      id: "4",
      label: "4",
      x: 400,
      y: 400,
      //  children: ["5", "6"], // 支持ID引用或嵌套对象
    },
    {
      id: "5",
      label: "5",
      children: [], // 支持ID引用或嵌套对象 // 6
      x: 600,
      y: 100,
      hasChildren: true,
    },
    {
      id: "6",
      label: "6",
      x: 600,
      y: 200,
      // children: ['11'], // 支持ID引用或嵌套对象
    },
    {
      id: "7",
      label: "7",
      x: 600,
      y: 300,
      // children: ["8", "9"], // 支持ID引用或嵌套对象
    },
    // {
    //   id: "8",
    //   label: "8",
    //   children: [], // 支持ID引用或嵌套对象 // 9
    //   hasChildren: true,
    // },
    // {
    //   id: "9",
    //   label: "9",
    //   children: ['12'], // 支持ID引用或嵌套对象
    // },
  ],
  edges: [
    { source: "0", target: "1" },
    { source: "1", target: "0" },
    { source: "1", target: "3" },
    { source: "0", target: "2" },
    { source: "0", target: "3" },
    { source: "3", target: "2" },
    { source: "0", target: "4" },
    { source: "0", target: "5" },
    { source: "6", target: "0" },
    { source: "0", target: "7" },
    { source: "0", target: "8" },
    { source: "2", target: "0" },
    { source: "4", target: "5" },
    { source: "5", target: "3" },
    { source: "4", target: "6" },
    { source: "5", target: "6" },
    { source: "5", target: "0" },
    // { source: "7", target: "8" },
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
    const r = cfg.size || 40;
    if (!graph.value.getNeighbors) return;
    // const hasChildren = graph.value.getNeighbors(cfg.id, "target").length > 0;
    const hasChildren = cfg.hasChildren;
    // 自定义节点
    const circle = group.addShape("circle", {
      attrs: {
        x: 0,
        y: 0,
        r,
        fill: cfg.style?.fill || "rgba(0, 165, 124, 1)",
        // fill: (context) => {
        //   const gradient = context.createRadialGradient(rgba(62, 186, 187, 0.7));
        //   gradient.addColorStop(0, "rgba(62, 186, 187, 0.7)");
        //   gradient.addColorStop(1, "rgba(62, 186, 187, 0.7)");
        //   return gradient;
        // },
        stroke: cfg.style?.stroke || "#3EBABB",
        lineWidth: 1,
      },
    });

    group.addShape("text", {
      attrs: {
        text: cfg.label,
        x: 0,
        y: 0,
        fontSize: 8,
        textAlign: "center",
        textBaseline: "middle",
        // width: 10,
        // textBaseline: "top", // 文本对齐基准线:ml-citation{ref="6" data="citationList"}
        // textAlign: "left",
        // textBaseline: 'top',
        width: 30, // 换行宽度阈值
        textWrap: {
          maxWidth: 30,
          autoWrap: true,
          lineHeight: 10,
        },
        fill: "#fff",
      },
    });
    if (hasChildren) {
      // 创建扩展收起按钮
      const buttonSize = 4;
      const buttonGroup = group.addGroup(); // 创建独立容器
      // 按钮背景
      buttonGroup.addShape("circle", {
        attrs: {
          x: r * 0.01,
          y: -r * 0.01,
          r: buttonSize,
          fill: "#fff",
          stroke: "rgba(0, 165, 124, 1)",
          cursor: "pointer",
        },
        name: "expand-button-bg",
      });
      const isCollapsed = collapsedNodes.has(cfg.id);
      const isLoadingNodes = loadingNodes.has(cfg.id);
      // 调整按钮组坐标：x方向移动到右侧边缘
      buttonGroup.setMatrix([1, 0, 0, 0, 1, 0, r * 1.2, 0, 1]);
      // 加减按钮
      buttonGroup.addShape("path", {
        attrs: {
          // path: isCollapsed
          path: isLoadingNodes
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
          stroke: "rgba(0, 165, 124, 1)",
          lineWidth: 1,
        },
        name: "button-symbol",
      });
    }
    return circle;
  },
  setState(name, value, item) {
    const shape = item.get("keyShape");
    if (name === "highlight") {
      shape.attr({
        stroke: "rgba(62, 186, 187, 0.5)",
        fill: "rgba(0, 165, 124, 1)",
        lineWidth: value ? 4 : 1,
      });
    } else if (name === "dark") {
      shape.attr("opacity", value ? 0.2 : 1);
    }
  },
});

// 注册自定义圆弧连接线类型
G6.registerEdge("arc-edge", {
  draw(cfg, group) {
    const { startPoint, endPoint } = cfg;
    const midPoint = {
      x: (startPoint.x + endPoint.x) / 2 + (endPoint.y - startPoint.y) * 0.12, // 弧线的弯度
      y: (startPoint.y + endPoint.y) / 2 + (startPoint.x - endPoint.x) * 0.12,
    };

    const path = group.addShape("path", {
      attrs: {
        path: [
          ["M", startPoint.x, startPoint.y],
          ["Q", midPoint.x, midPoint.y, endPoint.x, endPoint.y],
        ],
        stroke: "#00A57C",
        lineWidth: 0.4,
        endArrow: {
          path: G6.Arrow.triangle(8, 10, 0), // 箭头尺寸（长度、宽度、偏移）
          fill: "#00A57C", // 填充色与边保持一致
          rotate: false, // 启用自动旋转
        },
      },
    });

    if (activeEdges.value.has(cfg.id)) {
      addAnimationBall(group, path);
    }
    return path;
  },
  // 设置不同状态下的样式 value是boolean用来判断是否执行setState事件
  setState(name, value, item) {
    const shape = item.get("keyShape");
    if (name === "highlight") {
      shape.attr({
        stroke: "#00A57C",
        lineWidth: value ? 1 : 0.4,
        // opacity: 1,
      });
    } else if (name === "dark") {
      shape.attr("opacity", value ? 0.2 : 1); // 清除state value为false还原
    }
  },
});

function addAnimationBall(group, path) {
  const ball = group.addShape("circle", {
    attrs: {
      r: 4,
      fill: "#00A57C",
      shadowColor: "#00A57C",
      shadowBlur: 12,
    },
    name: "ball-shape",
  });

  ball.animate(
    (ratio) => {
      const point = path.getPoint(ratio);
      return { x: point.x, y: point.y };
    },
    {
      duration: 2000,
      repeat: true,
      easing: undefined,
      // easing: "linear",
      callback: () => ball.remove(),
    }
  );
}

// 清除所有非活跃节点动画
const clearInactiveAnimations = () => {
  animationCache.forEach((value, nodeId) => {
    if (nodeId !== activeNodeId.value) {
      value.anim.stop();
      value.circle.remove();
      animationCache.delete(nodeId);
    }
  });
};

// 判断节点是否在右侧
const isNodeOnRight = (parentNode, childNode) => {
  return childNode.getModel().x > parentNode.getModel().x;
};

// 获取右侧子节点
const getRightChildren = (nodeId) => {
  const node = graph.value.findById(nodeId);
  // 获取右侧子节点
  const children = graph.value.getNeighbors(nodeId, "target");
  // return children.filter((child) => isNodeOnRight(node, child));
  return children;
};

// 安全递归获取右侧子节点
const getSafeRightChildren = (nodeId, visited = new Set()) => {
  if (visited.has(nodeId)) return [];
  visited.add(nodeId);

  const children = getRightChildren(nodeId);
  let allChildren = [...children];

  // 超过100个子节点就跳出不在循环，性能保护！
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

  // 储存节点收起展开状态
  collapsedNodes.set(nodeId, {
    ...(collapsedNodes.get(nodeId)|| {}),
    isCollapsed: true, // 收起
  });
  // 收起节点和关联线
  childIds.forEach((id) => graph.value.hideItem(id));
  edges.forEach((edge) => graph.value.hideItem(edge.getID()));

  // 收起更新节点颜色
  graph.value.updateItem(nodeId, {
    style: {},
  });

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

// 模拟API请求获取子节点
const fetchChildren = async (url) => {
  const response = await fetch(url);
  return response.json();
};
// 节点展开
const handleExpand = async (node, nodec) => {
  const nodeId = node.id;
  const parentLayerNum = node.layer;
  if (loadingNodes.has(nodeId) || !graph.value) return;
  try {
    loadingNodes.add(nodeId);
    // 这里判断已经收起的子节点存在则不走请求，直接获取即可
    let children = {};
    const collapsedData = collapsedNodes.get(nodeId);
    const exsitData =
      collapsedData && collapsedData.nodes && collapsedData.edges;
    if (exsitData) {
      children = {
        nodes: collapsedData.nodes,
        edges: collapsedData.edges
      }
    } else {
      children = await fetchChildren("/data2.json");
      if (!children.nodes && !children.edges) return;
      // 将新获取的子节点layer+1
      children.nodes.forEach((d) => {
        d.layer = parentLayerNum + 1;
      });
      nodeData.nodes = [...nodeData.nodes, ...children.nodes];
      nodeData.edges = [...nodeData.edges, ...children.edges];
    }

    // 更新折叠状态
    collapsedNodes.set(nodeId, {
      // ...(collapsedNodes.set(nodeId) || {}),
      ...children,
      isCollapsed: false, // 展开
    });
    handleNodeSort(nodeData); // 这里每次展开都要重新排序，重置原来的位置需要解决？？
    // // return;
    // await nextTick();
    // safeUpdateGraph();
  } finally {
    // 失败走这里，保持原视图不变，防止白屏
    // 这里删除折叠状态
    // collapsedNodes.delete(nodeId);
    loadingNodes.delete(nodeId); // 删除下次请求，不做嵌套children太麻烦也没必要重新遍历
  }
};

const safeUpdateGraph = () => {
  if (!graph.value || graph.value.destroyed) {
    console.warn("Graph实例未初始化或已销毁");
    return;
  }

  // 数据预处理（防止null/undefined）
  const nodes = (nodeData.nodes || []).map((node) => ({
    id: String(node?.id || Math.random().toString(36).substr(2, 9)),
    x: node?.x || Math.random() * 500,
    y: node?.y || Math.random() * 500,
    // x: node?.x,
    // y: node?.y,
    label: node?.label || `Node_${node.id}`,
    size: node?.size || 20,
    style: node?.style || { fill: "#DEE9FF", stroke: "#5B8FF9" },
    hasChildren: node.hasChildren,
  }));

  const edges = (nodeData.edges || [])
    .filter(
      (edge) =>
        nodes.some((n) => n.id === edge?.source) &&
        nodes.some((n) => n.id === edge?.target)
    )
    .map((edge) => ({
      ...edge,
      id: edge?.id || `${edge.source}-${edge.target}`,
    }));
  try {
    // 4.x版本安全更新流程
    graph.value.getNodes().forEach((node) => node.clearStates());
    // graph.value.changeData({ nodes, edges });
    graph.value.data({ nodes, edges });
    graph.value.render();
    setTimeout(() => {
      graph.value.refreshPositions();
      // graph.value.fitView();
    }, 50);
  } catch (err) {
    console.error("图表更新失败:", err);
    initGraph(); // 自动重建实例
  }
};

const initGraph = () => {
  if (graph.value && !graph.value.destroyed) {
    graph.value.destroy();
  }

  graph.value = new G6.Graph({
    container: container.value,
    width: window.innerWidth,
    height: window.innerHeight,
    modes: {
      default: ["click-select", "drag-node", "drag-canvas"],
    },
    layout: {
      // type: "dagre",
      // rankdir: "LR",
      nodesep: 20,
      edgesep: 40,
      // 启用自动层级检测
      // sortByCombo: true,
    },
    plugins: [tooltip],
    defaultNode: {
      type: "expand-node",
      size: 20,
    },
    defaultEdge: {
      type: "arc-edge",
    },
    nodeStateStyles: {
      highlight: {
        fill: "#FF6A00",
        stroke: "#FF6A00",
      },
      dark: {
        opacity: 0.2,
      },
    },
    edgeStateStyles: {
      highlight: {
        stroke: "#FF6A00",
      },
      dark: {
        opacity: 0.1,
      },
    },
  });

  // 拖拽时实时更新所有边动画
  graph.value.on("node:drag", (e) => {
    const nodeId = e.item.getModel().id;
    graph.value.getEdges().forEach((edge) => {
      if (edge.getModel().source === nodeId) {
        // updateEdgeAnimation(edge, nodeId);
      }
    });
  });

  const nodeTracker = {
    originPositions: new Map(), // 存储节点原始坐标
    currentMatrix: [1, 0, 0, 0, 1, 0, 0, 0, 1], // 画布当前变换矩阵
  };

  // 初始化节点坐标记录
  function initNodeTracker(graph) {
    graph.getNodes().forEach((node) => {
      const model = node.getModel();
      nodeTracker.originPositions.set(model.id, {
        x: model.x,
        y: model.y,
      });
    });
  }

  // 实时坐标计算函数
  function getNodeRealPosition(nodeId) {
    const origin = nodeTracker.originPositions.get(nodeId);
    return {
      x: origin.x + nodeTracker.currentMatrix[6],
      y: origin.y + nodeTracker.currentMatrix[7],
    };
  }

  // 绑定画布拖拽事件
  // graph.value.on("canvas:drag", (e) => {
  //   // 更新当前变换矩阵
  //   nodeTracker.currentMatrix = graph.value.getGroup().getMatrix();

  //   // 实时输出所有节点坐标
  //   graph.value.getNodes().forEach((node) => {
  //     const realPos = getNodeRealPosition(node.getID());
  //     console.log(`节点 ${node.getID()} 实时坐标:`, realPos);
  //   });
  // });

  // 点击节点触发关联边动画
  graph.value.on("node:click", (e) => {
    const nodeId = e.item.getModel().id;
    const shape = e.target.get("name");
    // 区别点击节点小球还是扩展按钮
    if (shape === "expand-button-bg" || shape === "button-symbol") {
      // 先判断是否存在子节点
      // 第一次没有子节点，这里请求数据，注意请求过的就不在请求
      // 检查是否已有子节点数据
      const hasExistingChildren = nodeData.edges.some(
        (edge) => edge.source === nodeId // 判断原有数据是否存在当前子节点的关联
      );
      const isLoadingNodes = loadingNodes.has(nodeId);
      const isCollapsed = collapsedNodes.get(nodeId)?.isCollapsed;
      // 扩展收起子节点 前者为undefined代表没有加载过数据
      if (!collapsedNodes.get(nodeId) || isCollapsed) {
        handleExpand(e.item.getModel(), e);
      } else {
        collapseRightChildren(nodeId);
      }
      return;
    }
    handleNodeClick(e);
    handleLightHight(e);
  });

  // 画布点击恢复默认
  graph.value.on("click", (e) => {
    // 点击节点为circle执行
    if (
      e.target &&
      e.target.get("type") !== "circle" &&
      e.target.get("type") !== "text"
    ) {
      graph.value.getNodes().forEach((node) => {
        graph.value.clearItemStates(node);
      });
      graph.value.getEdges().forEach((edge) => {
        clearBallAnimate(edge);
        graph.value.clearItemStates(edge);
      });
    }
  });

  // setTimeout(() => {
  //   graph.value.refreshPositions();
  //   // graph.value.fitView();
  // }, 50);
  // 渲染画布
  // safeUpdateGraph();
  graph.value.data(nodeData);
  graph.value.render();
};

// 节点高亮处理
const handleLightHight = (e) => {
  const clickedNode = e.item;
  const nodeId = e.item.getModel().id;
  // 重置所有状态
  graph.value.getNodes().forEach((node) => {
    graph.value.clearItemStates(node);
  });
  graph.value.getEdges().forEach((edge) => {
    graph.value.clearItemStates(edge);
  });
  // 高亮关联边
  graph.value.getEdges().forEach((edge) => {
    const model = edge.getModel();
    if (model.source === nodeId || model.target === nodeId) {
      graph.value.setItemState(edge, "highlight", true);
    } else {
      graph.value.setItemState(edge, "dark", true);
    }
  });
  // 高亮点击节点
  const relatedNodes = graph.value.getNeighbors(nodeId, "both"); // both含有source targe
  const relatedId = relatedNodes.map((node) => node.getID());
  graph.value.getNodes().forEach((node) => {
    if (
      node.getModel().id === nodeId ||
      relatedId.includes(node.getModel().id)
    ) {
      graph.value.setItemState(clickedNode, "highlight", true);
    } else {
      graph.value.setItemState(node, "dark", true);
    }
  });
};

const clearBallAnimate = (edge) => {
  const group = edge.get("group");
  // 清除其他节点动画！
  const ballShape = group.find((ele) => {
    const name = ele.get("name");
    return name === "ball-shape";
  });
  if (ballShape) {
    ballShape.stopAnimate();
    group.removeChild(ballShape);
  }
};

// 节点点击处理
const handleNodeClick = (e) => {
  const nodeId = e.item.getID();
  activeEdges.value.clear();
  // 清除所有节点动画
  graph.value.getEdges().forEach((edge) => {
    const model = edge.getModel();
    clearBallAnimate(edge);
    // 只过滤带向运动
    if (model.source === nodeId || model.target === nodeId) {
      activeEdges.value.add(model.id);
      graph.value.updateItem(edge, {}); // 触发重绘
    }
  });
  activeNodeId.value = nodeId;
};
// 动态计算节点排序！
const handleNodeSort = (data) => {
  let tempLayer = 1;
  let countY = 100;
  //每次排序需要清空layerCollect
  layerCollect.value.clear();
  // 计算Y轴每层的个数
  data.nodes.map((d) => {
    if (layerCollect.value.has(d.layer)) {
      const currentL = layerCollect.value.get(d.layer);
      layerCollect.value.set(d.layer, currentL + 1);
    } else {
      layerCollect.value.set(d.layer, 1);
    }
  });
  // 计算Y轴每个的间距
  const rankNode = data.nodes.map((d) => {
    d.x = d.layer * 220;
    if (tempLayer === d.layer) {
      countY += (d.layer <= 1 ? 300 : 500) / layerCollect.value.get(d.layer);
    } else {
      countY = (d.layer <= 1 ? 300 : 500) / layerCollect.value.get(d.layer);
    }
    d.y = countY;
    tempLayer = d.layer;
    return d;
  });
  nodeData.edges = data.edges;
  nodeData.nodes = rankNode;
  initGraph();
};

onMounted(async () => {
  // 模拟API请求获取子节点
  const response = await fetch("/data1.json");
  // const layerCollect = {};
  // const sameLayerMaxCount = 10; // 一屏竖向最大可放数量
  response.json().then((data) => {
    handleNodeSort(data);

    // nodeData.edges = data.edges;
    // nodeData.nodes = nodes;
    // initGraph();
  });
});

if (typeof window !== "undefined")
  window.onresize = () => {
    if (!graph.value || graph.value.get("destroyed")) return;
    if (!container || !container.scrollWidth || !container.scrollHeight) return;
    graph.value.changeSize(container.scrollWidth, container.scrollHeight);
  };
</script>
  
<style scoped>
.graph-container {
  width: 100%;
  height: 100%;
}
</style>
  