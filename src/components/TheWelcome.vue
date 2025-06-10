
<template>
  <div ref="container" class="graph-container">
    <VueShape
      v-if="activeNode"
      class="vue-node"
      :nodeInfo="activeNode"
      :offset="graphMoveDelta"
    ></VueShape>
  </div>
</template>
  
  <script setup>
import { ref, onMounted, reactive } from "vue";
import G6 from "@antv/g6";
import VueShape from "./InfoSelect.vue";
import insertCss from "insert-css";
let initialZoom = 1; // 此处新增一个变量来存储初始缩放比例

insertCss(`
  .g6-component-toolbar li {
    list-style-type: none !important;
  }
`);

const container = ref(null);
const graph = ref(null);
const ballSize = 30; // 每个节点小球的大小
const baseSep = 50; // Y轴溢出小球的间距基准
const maxYHeight = window.innerHeight - 50; // 设置小球Y轴的最大总高度
let activeNodeId = ref(null);

const activeNode = ref(null);
//画布移动的偏移量
const graphMoveDelta = ref({ dx: 0, dy: 0 });

// 储存已经收起的节点id和加载过的数据，下次展开不用再次请求数据
const collapsedNodes = reactive(new Map());
const activeEdges = ref(new Set()); // 存储当前激活的边ID
const animationCache = new Map();
const layerCollect = ref(new Map()); //计算每层级Y周的节点个数方便布局使用，防止重叠

const nodeData = reactive({
  nodes: [],
  edges: [],
});

// const toolbar = new G6.ToolBar({
//   position: { x: window.innerWidth / 2, y: window.innerHeight - 50 },
// });
const tc = document.createElement("div");
tc.id = "toolbarContainer";
document.body.appendChild(tc);

function updateSliderValue() {
  if (!graph.value) return;
  const slider = document.getElementById("zoom-slider");
  if (slider) {
    const currentZoom = graph.value.getZoom();
    slider.value = currentZoom.toFixed(1);
  }
}

// 监听进度条缩放
const addSliderEventListener = () => {
  const slider = document.getElementById("zoom-slider");
  if (slider) {
    slider.addEventListener("input", (event) => {
      const zoomValue = parseFloat(event.target.value);
      graph.value.zoomTo(zoomValue);
      // console.log("Zoom value changed to:", zoomValue);
    });
  } else {
    console.error("Failed to find zoom-slider element on the DOM.");
  }
};

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
      outDiv.innerHTML = `${model.label}<br/>${model.code}`;
      // 创建可点击的文字
      const clickableText = document.createElement("span");
      clickableText.innerHTML =
        "<span style='color: #1890ff; cursor: pointer;margin-left: 5px;'>查看详情</span>";
      // 添加点击事件
      clickableText.addEventListener("click", (event) => {
        // 阻止事件冒泡，避免触发节点的点击事件
        event.stopPropagation();
        const tooltipDom = document.querySelector(".g6-component-tooltip");
        if (tooltipDom) {
          // 获取tooltip的位置信息
          const tooltipRect = tooltipDom.getBoundingClientRect();
          // 设置activeNode的值为model
          activeNode.value = model;

          // 设置activeNode的坐标为tooltip左下角的坐标
          activeNode.value.x = tooltipRect.left + 0;
          activeNode.value.y = tooltipRect.bottom - 20;
          console.log("点击查看详情 - tooltip左下角坐标:", {
            x: tooltipRect.left,
            y: tooltipRect.bottom,
          });
        }
      });

      // 将可点击文字添加到tooltip内容中
      outDiv.appendChild(clickableText);
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

// 自定义节点类型
G6.registerNode("expand-node", {
  draw(cfg, group) {
    const r = cfg.size || 30;
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
        lineWidth: 2,
      },
    });

    group.addShape("text", {
      attrs: {
        text: `${formatString(cfg.label)}`,
        x: 0,
        y: 0,
        fontSize: 12,
        textAlign: "center",
        textBaseline: "middle",
        // width: 10,
        // textBaseline: "top", // 文本对齐基准线:ml-citation{ref="6" data="citationList"}
        // textAlign: "left",
        // width: 30, // 换行宽度阈值
        textWrap: {
          maxWidth: 30,
          autoWrap: true,
          lineHeight: 50,
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
      // 节点存在，以后面展开收起状态为主，不存在默认收起
      const isCollapsed =
        collapsedNodes.get(cfg.id) && !collapsedNodes.get(cfg.id)?.isCollapsed;
      // 调整按钮组坐标：x方向移动到右侧边缘
      buttonGroup.setMatrix([1, 0, 0, 0, 1, 0, r * 1.2, 0, 1]);
      // 加减按钮
      buttonGroup.addShape("path", {
        attrs: {
          path: isCollapsed
            ? [
                ["M", -3, 0],
                ["L", 3, 0],
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

const getAllChildren = (parentNodeId, childNode) => {
  const result = [];
  const children = collapsedNodes.get(parentNodeId)?.nodes || [];
  if (!children[0]) return;
  const findDeepChild = (children) => {
    children.forEach((child) => {
      const childrenData = collapsedNodes.get(child.id)?.nodes;
      result.push(child);
      if (childrenData)
        findDeepChild(collapsedNodes.get(child.id)?.nodes || []);
    });
  };
  findDeepChild(children);
  return result;
};

// 收起右侧子节点
const collapseRightChildren = (nodeId) => {
  // 这里需要递归计算出点击收起按钮的父节点的子节点，也包括子节点的子节点
  const children = getAllChildren(nodeId);
  // const nodeIds = children.map((n) => n.getID());
  const nodeIds = children.map((n) => n.id);
  // 通过节点找到对应连接线
  const edgesIds = graph.value
    .getEdges()
    .filter(
      (edge) =>
        nodeIds.includes(edge.getTarget().getID()) ||
        nodeIds.includes(edge.getSource().getID())
    );
  collapsedNodes.set(nodeId, {
    ...(collapsedNodes.get(nodeId) || {}),
    isCollapsed: true, // 收起
  });
  // 更新当前节点按钮
  graph.value.updateItem(nodeId, {
    style: {},
  });
  children.forEach((child) => {
    if (child.hasChildren) {
      collapsedNodes.set(child.id, {
        ...(collapsedNodes.get(child.id) || {}),
        isCollapsed: true, // 收起
      });
    }
    const childProxy = graph.value.findById(child.id);
    childProxy.hide();
    // 单独收起根节点要把所有子节点按钮更新
    graph.value.updateItem(child.id, {
      style: {},
    });
  });
  edgesIds.forEach((id) => graph.value.hideItem(id));
  // 注意相应数据也要同步删除,后续排序使用
  nodeData.nodes = nodeData.nodes.filter((n) => !nodeIds.includes(n.id));
  nodeData.edges = nodeData.edges.fill((e) => !edgesIds.includes(e.id));
};

// 模拟API请求获取子节点
const fetchChildren = async (url) => {
  const response = await fetch(url);
  return response.json();
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

  // 工具栏的设置
  const toolbar = new G6.ToolBar({
    container: tc,
    position: { x: 20, y: window.innerHeight - 50 },
    getContent: () => {
      return `
      <ul>
        <li code='zoom-out'>放大</li>
        <input type='range' code='zoom-slider' id='zoom-slider' min='0.1' max='2' step='0.1' value='1'/>
        <li code='zoom-in'>缩小</li>
        <li code='fit'>适应画布</li>
        <li code='redo'>重置视图</li>
      </ul>
    `;
    },
    handleClick: (code, graph) => {
      if (code === "zoom-out") {
        toolbar.zoomOut();
        updateSliderValue();
      } else if (code === "zoom-in") {
        // 自定义 undo
        toolbar.zoomIn();
        updateSliderValue();
      } else if (code === "fit") {
        graph.fitView();
        setTimeout(updateSliderValue, 500);
      } else if (code === "redo") {
        resetGraph();
      } else {
        // 其他操作保持默认不变
        toolbar.handleDefaultOperator(code);
      }
    },
  });

  graph.value = new G6.Graph({
    container: container.value,
    width: window.innerWidth,
    height: window.innerHeight - 50,
    modes: {
      default: [
        "click-select",
        "drag-node",
        "drag-canvas",
        "shortcuts-call",
        "zoom-canvas",
      ], //"zoom-canvas"
    },
    layout: {
      nodesep: 20,
      edgesep: 40,
      // ranksep: 100,
      // animate: true,
      // 启用自动层级检测
      sortByCombo: true,
    },
    // fitCenter: true,
    animate: true,
    animateCfg: {
      duration: 500, // 动画持续时间（毫秒）
      easing: "easeCubic", // 动画缓动效果
    },

    plugins: [tooltip, toolbar],
    defaultNode: {
      type: "expand-node",
      size: ballSize, // 设置小球的大小
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

  // 监听 afterrender 事件，记录初始缩放比例
  graph.value.on("afterrender", () => {
    if (graph.value) {
      initialZoom = graph.value.getZoom(); // 获取当前缩放比例并存储为初始值
      // graph.value.fitCenter(); // 将图的中心对齐到画布中心
    }
  });

  // 拖拽时实时更新所有边动画
  graph.value.on("node:drag", (e) => {
    // console.log("node:drag", e);
    const nodeId = e.item.getModel().id;
    graph.value.getEdges().forEach((edge) => {
      if (edge.getModel().source === nodeId) {
        // updateEdgeAnimation(edge, nodeId);
      }
    });
  });

  graph.value.on("wheelzoom", (evt) => {
    updateSliderValue();
  });

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

  // 不用
  // graph.value.on("node:dblclick", (e) => {
  //   activeEdges.value.clear();
  //   //清除所有节点动画
  //   activeNode.value = e.item.getModel();
  //   activeNode.value.x = e.clientX;
  //   activeNode.value.y = e.clientY;
  // });

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
      //清除激活节点
      activeNodeId.value = null;
      activeNode.value = null;
    }
  });

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
  activeNode.value = null;
};
// 动态计算节点排序！这里必须是全部数据因为设置到动态加载部分数据，没办法部分排序会出问题

// 节点展开
const handleExpand = async (node) => {
  const nodeId = node.id;
  const parentLayerNum = node.layer;
  // 当为展开状态的时候直接return出去
  if (!graph.value && !collapsedNodes.get(nodeId)?.isCollapsed) return;
  try {
    // 这里判断已经收起的子节点存在则不走请求，直接获取即可
    let children = {};
    const collapsedData = collapsedNodes.get(nodeId);
    const exsitData =
      collapsedData && collapsedData.nodes && collapsedData.edges;
    if (exsitData) {
      children = {
        nodes: collapsedData.nodes,
        edges: collapsedData.edges,
      };
    } else {
      // 模拟数据
      const jsonUrl = {
        7: "/data2.json",
        9: "/data3.json",
        15: "/data4.json",
      };
      children = await fetchChildren(jsonUrl[nodeId]);
      if (!children.nodes && !children.edges) return;
      // 将新获取的子节点layer+1
      children.nodes.forEach((d) => {
        d.layer = parentLayerNum + 1;
        d.parentNode = node;
      });
    }
    // 更新折叠状态
    collapsedNodes.set(nodeId, {
      // ...(collapsedNodes.set(nodeId) || {}),
      ...children,
      isCollapsed: false, // 展开
    });
    // 同步数据后续排序要用
    nodeData.nodes = [...nodeData.nodes, ...children.nodes];
    nodeData.edges = [...nodeData.edges, ...children.edges];
    // 指给新增的子节点排序, 这里需要区分是物理删除还是隐藏
    handleNodeSort(children, nodeId, exsitData, parentLayerNum + 1);
    // await nextTick();
    // safeUpdateGraph();
  } catch (e) {
    // 失败走这里，保持原视图不变，防止白屏
    console.log("catch", e);
    initGraph();
  }
};

// 计算Y周每层的个数
const recordLayerNum = (data) => {
  //每次排序需要清空layerCollect
  layerCollect.value.clear();
  // 这里需要按照层级排序，防止分层计算Y轴间距会有问题!!
  data.nodes.sort((a, b) => a.layer - b.layer);
  // 计算Y轴每层的个数
  data.nodes.map((d) => {
    if (layerCollect.value.has(d.layer)) {
      const currentL = layerCollect.value.get(d.layer);
      layerCollect.value.set(d.layer, currentL + 1);
    } else {
      layerCollect.value.set(d.layer, 1);
    }
  });
};

// 指给新加载的节点和初始化排序，之后都是基于画布拖拽的矩阵排序
const handleNodeSort = (data, nodeId, hasExist, currentLayer) => {
  recordLayerNum(data);
  let tempLayer = 1;
  let countY = 0;
  // let rankNode = [];
  // 计算Y轴每个的间距, 这里需要兼容拖拽画布的位置！！
  if (!nodeId) {
    // 初始化 默认展示3层
    const rankNode = data.nodes.map((d) => {
      d.x = d.layer * 220;
      const isOverClientaHeight =
        window.innerHeight -
          (layerCollect.value.get(d.layer) * (ballSize + baseSep) - baseSep) <
        0;
      const restBallNum = Math.floor(
        (window.innerHeight -
          (layerCollect.value.get(d.layer) * (ballSize + baseSep) - baseSep)) /
          (ballSize + baseSep)
      );
      if (tempLayer === d.layer) {
        // countY += (d.layer <= 1 ? 300 : 600) / layerCollect.value.get(d.layer);
        // 如果整体整屏高度处于层数加上节点间隔小于1代表一屏放不下，需要让小球Y轴叠加计算
        if (!isOverClientaHeight) {
          countY +=
            (d.layer === 1 ? maxYHeight / 2 : maxYHeight) /
            layerCollect.value.get(d.layer);
        } else {
          // countY += (ballSize + baseSep);
          countY += ballSize + baseSep;
        }
      } else {
        // 每层的第一个小球如果按照溢出为负数计算
        // countY = (d.layer <= 1 ? 300 : 600) / layerCollect.value.get(d.layer);
        if (!isOverClientaHeight) countY = ballSize + baseSep;
        else countY = (restBallNum * (ballSize + baseSep)) / 2;
      }
      d.y = countY;
      tempLayer = d.layer;
      return d;
    });
    nodeData.edges = data.edges;
    nodeData.nodes = rankNode;
    initGraph();
  } else {
    const sameCdLayerNodeData = nodeData.nodes.filter(
      (n) => n.layer === currentLayer
    );
    // 每次需要重新计算layer层数
    recordLayerNum(nodeData);
    // 按照父节点Y轴从小到大排序
    sameCdLayerNodeData.sort((a, b) => a.parentNode.y - b.parentNode.y);
    let countY = 0;
    const isOverClientaHeight =
      window.innerHeight -
        (layerCollect.value.get(currentLayer) * (ballSize + baseSep) -
          baseSep) <
      0;
    const restBallNum = Math.floor(
      (window.innerHeight -
        (layerCollect.value.get(currentLayer) * (ballSize + baseSep) -
          baseSep)) /
        (ballSize + baseSep)
    );
    sameCdLayerNodeData.forEach((d, idx) => {
      // 先算出第一个基准Y轴的起始点, 通过当前有层级有几个子节点来计算
      // countY += idx === 0 ? ballSize : maxYHeight / layerCollect.value.get(currentLayer)
      if (!isOverClientaHeight) {
        countY +=
          idx === 0
            ? ballSize
            : maxYHeight / layerCollect.value.get(currentLayer);
      } else {
        countY +=
          idx === 0
            ? (restBallNum * (ballSize + baseSep)) / 2
            : ballSize + baseSep;
      }
      d.y = countY;
      d.x = d.parentNode.x + 220;
    });
    // 第一次使用addItem这里很重要。可以保证原有的节点位置保持不变！！！
    graph.value.updateLayout({ freeze: true }); // 冻结现有节点位置
    data.nodes.forEach((node) => {
      const node1 = graph.value.findById(node.id);
      hasExist
        ? node1.show()
        : graph.value.addItem("node", {
            ...node,
            // layer: node.layer || 1, // 确保有层级信息
          });
    });
    data.edges.forEach((edge) => {
      graph.value.addItem("edge", {
        ...edge,
        // layer: node.layer || 1, // 确保有层级信息
      });
    });
    sameCdLayerNodeData.forEach((child, index) => {
      graph.value.updateItem(child.id, {
        y: child.y, // 对当前子节点的坐标进行重排！！
      });
    });
    graph.value.updateItem(nodeId, { style: {} }); // 强制触发父节点重绘
  }

  // nodeData.edges = data.edges;
  // nodeData.nodes = rankNode;
  // initGraph();
};

function formatString(input) {
  if (typeof input !== "string" || !input) return input;

  const chars = [...input]; // 正确处理Unicode字符
  const length = chars.length;

  if (length <= 4) {
    return input; // 不超过4个字符直接返回
  }

  if (length > 8) {
    // 前4个字符 + 换行 + 第5-7个字符 + 省略号
    return (
      chars.slice(0, 4).join("") + "\n" + chars.slice(4, 7).join("") + "..."
    );
  }

  // 长度在5-8之间：第4个后加换行
  return chars.slice(0, 4).join("") + "\n" + chars.slice(4).join("");
}

const resetGraph = async () => {
  // 模拟API请求获取子节点
  const response = await fetch("/data1.json");
  // const layerCollect = {};
  // const sameLayerMaxCount = 10; // 一屏竖向最大可放数量
  response.json().then((data) => {
    // 重置按钮状态
    collapsedNodes.clear();
    handleNodeSort(data);
    addSliderEventListener();
  });
};

onMounted(async () => {
  await resetGraph();
});

if (typeof window !== "undefined")
  window.onresize = () => {
    if (!graph.value || graph.value.get("destroyed")) return;
    if (
      !container.value ||
      !container.value.scrollWidth ||
      !container.value.scrollHeight
    )
      return;
    graph.value.changeSize(
      container.value.scrollWidth,
      container.value.scrollHeight
    );
  };
</script>
  
<style scoped>
.graph-container {
  position: relative;
}
</style>
  