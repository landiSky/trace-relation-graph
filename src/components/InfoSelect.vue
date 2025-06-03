<!-- 弹框勾选界面 -->
<template>
    <div class="vue-shape">
      <div class="shape-header">
        <slot name="header">
          {{ props.nodeInfo.label }}
        </slot>
      </div>
      
      <div class="shape-body">
        <slot name="content">
          <p>{{ props.nodeInfo.code }}</p>
        </slot>
      </div>
    </div>
  </template>
  
  <script setup>
  import { computed, watch, defineProps } from "vue";
  const props = defineProps({
    nodeInfo: Object,
    offset: {
      type: Object,
      default: () => ({ dx: 0, dy: 0 })
    },
  });
  
  const emit = defineEmits(['action', 'click']);
  
  //根据nodeInfo的xy坐标计算shape的位置
  const x = computed(() => props.nodeInfo.x);
  const y = computed(() => props.nodeInfo.y);

  // 组件的高度（与CSS中的height保持一致,后续需要动态计算）
  const shapeHeight = 330;
  
  //根据nodeInfo的xy坐标计算shape的位置并赋值给css
  const absoluteX = computed(() => `${x.value}px`);
  const absoluteY = computed(() => {
    const nodeY = y.value;
    const viewportHeight = window.innerHeight;
    // 计算如果放在节点下方的位置
    const belowPosition = nodeY;
    // 判断是否有足够空间放在下方
    const canPlaceBelow = belowPosition + shapeHeight <= viewportHeight;
    if (canPlaceBelow) {
      // 放在节点下方
      return `${belowPosition}px`;
    } else {
      // 放在节点上方
      return `${nodeY - shapeHeight - 90}px`;
    }
  });

</script>
    
  <style scoped>
      .vue-shape{
        position: absolute;
        left: v-bind(absoluteX);
        top: v-bind(absoluteY);
        width: 280px;
        height: 330px;
        box-shadow: 0 0 4px rgba(0, 0, 0, 0.3);
        padding: 20px;
        border-radius: 10px;
        background-color: rgb(216, 226, 226);
      }
  </style>