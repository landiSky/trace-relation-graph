
import G6 from '@antv/g6';

// 注册自定义流动边
G6.registerEdge('flow-edge', {
  afterDraw(cfg, group) {
    const shape = group.get('children')[0];
    if (!shape) return;
    
    // 初始虚线动画
    shape.animate(
      { lineDashOffset: -20 },
      { repeat: true, duration: 2000 }
    );
  }
});

// 初始化图实例
const graph = new G6.Graph({
  container: 'container',
  width: 800,
  height: 600,
  layout: {
    type: 'dagre',
    rankdir: 'TB',
    nodesep: 50,
    ranksep: 70
  },
  defaultEdge: {
    type: 'flow-edge',
    style: {
      lineDash: [5, 5],
      stroke: '#999',
      endArrow: { path: G6.Arrow.triangle(10, 12, 25) }
    }
  },
  modes: { default: ['click-select'] }
});

// 加载数据
fetch('data.json').then(res => res.json()).then(data => {
  graph.data(data);
  graph.render();

  // 节点点击事件
  graph.on('node:click', (e) => {
    const node = e.item;
    const edges = node.getEdges();
    
    edges.forEach(edge => {
      // 高亮连接线并加速动画
      graph.updateItem(edge, {
        style: {
          stroke: '#1890ff',
          lineWidth: 2,
          lineDash: [3, 3]
        }
      });
      edge.getContainer().get('children')[0].animate({}, true);
    });
  });
});
