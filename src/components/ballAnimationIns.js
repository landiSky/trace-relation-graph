// 计算圆形节点边缘点
function getCircleEdge(node, targetNode) {
    const nodeModel = node.getModel();
    const targetModel = targetNode.getModel();
    const dx = targetModel.x - nodeModel.x;
    const dy = targetModel.y - nodeModel.y;
    const angle = Math.atan2(dy, dx);

    // 兼容size为数值或数组
    const radius = Array.isArray(nodeModel.size) ?
        nodeModel.size[0] / 2 :
        nodeModel.size / 2;

    return {
        x: nodeModel.x + Math.cos(angle) * radius,
        y: nodeModel.y + Math.sin(angle) * radius
    };
}

// 计算矩形节点边缘点
function getRectEdge(node, targetNode) {
    const nodeModel = node.getModel();
    const targetModel = targetNode.getModel();
    const [width, height] = Array.isArray(nodeModel.size) ?
        nodeModel.size :
        [nodeModel.size, nodeModel.size];
    const halfW = width / 2;
    const halfH = height / 2;

    const dx = targetModel.x - nodeModel.x;
    const dy = targetModel.y - nodeModel.y;
    const angle = Math.atan2(dy, dx);
    const tanTheta = Math.tan(angle);

    let intersectX, intersectY;

    // 判断与哪条边相交
    if (Math.abs(tanTheta) <= halfH / halfW) {
        intersectX = dx > 0 ? nodeModel.x + halfW : nodeModel.x - halfW;
        intersectY = nodeModel.y + tanTheta * (intersectX - nodeModel.x);
    } else {
        intersectY = dy > 0 ? nodeModel.y + halfH : nodeModel.y - halfH;
        intersectX = nodeModel.x + (intersectY - nodeModel.y) / tanTheta;
    }

    // 边界约束
    return {
        x: Math.max(nodeModel.x - halfW, Math.min(intersectX, nodeModel.x + halfW)),
        y: Math.max(nodeModel.y - halfH, Math.min(intersectY, nodeModel.y + halfH))
    };
}

// ================== 动画控制器 ==================
class EdgeAnimator {
    constructor(graph) {
        this.graph = graph;
        this.animations = new Map(); // {edgeId: {ball, path}}
        this.speed = 0.3; // 像素/毫秒
    }

    // 启动节点所有边动画
    start(nodeId) {
        const node = this.graph.findById(nodeId);
        const edges = [...node.getOutEdges(), ...node.getInEdges()];

        edges.forEach(edge => {
            const source = edge.getSource();
            const target = edge.getTarget();
            const isOutEdge = edge.getSource() === node;

            // 计算精准起点终点
            const startNode = isOutEdge ? source : target;
            const endNode = isOutEdge ? target : source;

            const startPoint = this.calculateEdgePoint(startNode, endNode);
            const endPoint = this.calculateEdgePoint(endNode, startNode);

            // 创建动画对象
            const ball = this.createBall(startPoint);
            const animation = {
                ball,
                start: startPoint,
                end: endPoint,
                progress: 0
            };

            this.animations.set(edge.getID(), animation);
            this.runAnimation(edge.getID());
        });
    }

    // 计算边缘点（自动判断节点类型）
    calculateEdgePoint(node, oppositeNode) {
        switch (node.getType()) {
            case 'circle':
                return getCircleEdge(node, oppositeNode);
            case 'rect':
                return getRectEdge(node, oppositeNode);
            default:
                return node.getModel();
        }
    }

    createBall(position) {
        return this.graph.getGroup().addShape('circle', {
            attrs: {
                x: position.x,
                y: position.y,
                r: 6,
                fill: '#FF4D4F',
                shadowBlur: 8
            }
        });
    }

    runAnimation(edgeId) {
        const anim = this.animations.get(edgeId);
        if (!anim || anim.progress >= 1) return;

        const dx = anim.end.x - anim.start.x;
        const dy = anim.end.y - anim.start.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const duration = distance / this.speed;

        let startTime;
        const animate = (timestamp) => {
            if (!startTime) startTime = timestamp;
            const elapsed = timestamp - startTime;
            anim.progress = Math.min(elapsed / duration, 1);

            anim.ball.attr({
                x: anim.start.x + dx * anim.progress,
                y: anim.start.y + dy * anim.progress
            });

            if (anim.progress < 1) {
                requestAnimationFrame(animate);
            } else {
                anim.ball.remove();
                this.animations.delete(edgeId);
            }
        };

        requestAnimationFrame(animate);
    }
    // 动态更新路径
    updateOnDrag(node) {
        const edges = [...node.getOutEdges(), ...node.getInEdges()];

        edges.forEach(edge => {
            const anim = this.animations.get(edge.getID());
            if (!anim) return;

            // 重新计算路径
            const source = edge.getSource();
            const target = edge.getTarget();
            const isOutEdge = source === node;

            const newStart = this.calculateEdgePoint(
                isOutEdge ? node : target,
                isOutEdge ? target : node
            );
            const newEnd = this.calculateEdgePoint(
                isOutEdge ? target : node,
                isOutEdge ? node : target
            );

            // 保留当前进度
            const totalDist = Math.sqrt(
                Math.pow(anim.end.x - anim.start.x, 2) +
                Math.pow(anim.end.y - anim.start.y, 2)
            );
            const currentDist = Math.sqrt(
                Math.pow(anim.ball.attr('x') - anim.start.x, 2) +
                Math.pow(anim.ball.attr('y') - anim.start.y, 2)
            );
            const progress = currentDist / totalDist;

            // 更新路径数据
            anim.start = newStart;
            anim.end = newEnd;
            anim.progress = progress;

            // 重置动画
            this.runAnimation(edge.getID());
        });
    }
}
export default EdgeAnimator;