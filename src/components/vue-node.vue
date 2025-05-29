<!-- VueShape.vue -->
<template>
    <div class="vue-shape" :style="shapeStyle" @click="handleClick">
      <div class="shape-header">
        <slot name="header">
          {{ cfg.label }}
        </slot>
      </div>
      
      <div class="shape-body">
        <slot name="content">
          <p>{{ cfg.description }}</p>
        </slot>
      </div>
      
      <div class="shape-actions">
        <button v-for="action in cfg.actions" 
                :key="action.name"
                @click="emitAction(action)">
          {{ action.label }}
        </button>
      </div>
    </div>
  </template>
  
  <script setup>
  import { computed } from 'vue';
  
  const props = defineProps({
    cfg: Object
  });
  
  const emit = defineEmits(['action', 'click']);
  
  const shapeStyle = computed(() => ({
    backgroundColor: props.cfg.status === 'active' ? '#e6f7ff' : '#ffffff',
    border: `2px solid ${props.cfg.color || '#91d5ff'}`,
    borderRadius: props.cfg.radius + 'px' || '4px',
    width: '100%',
    height: '100%',
    boxSizing: 'border-box'
  }));
  
  function handleClick() {
    emit('click', props.cfg);
  }
  
  function emitAction(action) {
    emit('action', {
      type: action.name,
      nodeId: props.cfg.id,
      data: action.data
    });
  }
  </script>
  
  <style scoped>
  .vue-shape {
    padding: 12px;
    transition: all 0.3s ease;
    box-shadow: 0 2px 5px rgba(0,0,0,0.1);
    cursor: pointer;
  }
  
  .vue-shape:hover {
    box-shadow: 0 4px 12px rgba(24, 144, 255, 0.3);
    transform: translateY(-2px);
  }
  
  .shape-header {
    font-weight: bold;
    font-size: 16px;
    margin-bottom: 8px;
    color: #1890ff;
  }
  
  .shape-body {
    margin-bottom: 12px;
  }
  
  .shape-actions button {
    margin-right: 8px;
    padding: 4px 12px;
    background: #1890ff;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }
  </style>