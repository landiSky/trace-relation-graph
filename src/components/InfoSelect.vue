<!-- 弹框勾选界面 -->
<template>
    <div class="vue-shape"  @click="handleClick">
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
    import { computed, watch,defineProps } from "vue";
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

    //根据nodeInfo的xy坐标计算shape的位置并赋值给css
    const absoluteX = computed(() => `${x.value-0}px`);
    const absoluteY = computed(() => `${y.value+0}px`);



    function handleClick() {
      emit('click', props.cfg);
    }

    watch(()=>props.nodeInfo,(v)=>{
      console.log(v);
    },{immediate:true});
    
    function emitAction(action) {
      emit('action', {
        type: action.name,
        nodeId: props.cfg.id,
        data: action.data
      });
    }
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