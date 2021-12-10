// import Vue, { VNode, VueConstructor, CreateElement } from 'vue';
import { VNode } from 'vue';
import upperFirst from 'lodash/upperFirst';
import pick from 'lodash/pick';
import mixins from '../utils/mixins';
import getConfigReceiverMixins, { TreeConfig } from '../config-provider/config-receiver';
import TreeStore from '../_common/js/tree/tree-store';
import TreeNode from '../_common/js/tree/tree-node';
import TreeItem from './tree-item';
import props from './props';
import { renderTNodeJSX } from '../utils/render-tnode';
import { ClassName, TNodeReturnValue, TreeOptionData } from '../common';
import { TdTreeProps } from './type';
import {
  TypeTdTreeProps,
  TreeNodeValue,
  TypeValueMode,
  TypeEventState,
  TreeNodeState,
  TypeTreeNodeModel,
  TypeTreeInstance,
  TypeTargetNode,
} from './interface';
import {
  CLASS_NAMES,
  FX,
} from './constants';
import {
  getMark,
  getNode,
  emitEvent,
} from './util';

export default mixins(getConfigReceiverMixins<TypeTreeInstance, TreeConfig>('tree')).extend({
  name: 'TTree',
  model: {
    prop: 'value',
    event: 'change',
  },
  props,
  data() {
    const {
      checkProps,
      empty,
      icon,
      label,
      line,
      operations,
    } = this;

    return {
      store: null,
      nodesMap: null,
      mouseEvent: null,
      treeNodes: [],
      treeScope: {
        checkProps,
        empty,
        icon,
        label,
        line,
        operations,
        scopedSlots: null,
      },
      transitionCD: null,
    };
  },
  computed: {
    classList(): ClassName {
      const list: Array<string> = [CLASS_NAMES.tree];
      const {
        disabled,
        hover,
        transition,
        checkable,
        expandOnClickNode,
      } = this;
      if (disabled) {
        list.push(CLASS_NAMES.disabled);
      }
      if (hover) {
        list.push(CLASS_NAMES.treeHoverable);
      }
      if (checkable) {
        list.push(CLASS_NAMES.treeCheckable);
      }
      if (transition) {
        list.push(CLASS_NAMES.treeFx);
      }
      if (expandOnClickNode) {
        list.push(CLASS_NAMES.treeBlockNode);
      }
      return list;
    },
  },
  watch: {
    data(list) {
      this.rebuild(list);
    },
    value(nVal) {
      this.store.replaceChecked(nVal);
    },
    expanded(nVal) {
      this.store.replaceExpanded(nVal);
    },
    actived(nVal) {
      this.store.replaceActived(nVal);
    },
  },
  methods: {
    // 创建单个 tree 节点
    renderItem(node: TreeNode) {
      const { treeScope } = this;
      const treeItem = (
        <TreeItem
          key={node.value}
          node={node}
          treeScope={treeScope}
          onClick={this.handleClick}
          onChange={this.handleChange}
        />
      );
      return treeItem;
    },
    // 获取视图节点映射关系
    getNodesMap() {
      let { nodesMap } = this;
      if (!nodesMap) {
        nodesMap = new Map();
        this.nodesMap = nodesMap;
      }
      return nodesMap;
    },
    // 更新视图节点映射关系
    updateNodesMap() {
      const { store, treeNodes } = this;
      const nodesMap = this.getNodesMap();

      let index = 0;
      while (index < treeNodes.length) {
        const nodeView = treeNodes[index];
        if (nodeView && nodeView.componentInstance) {
          const { node } = nodeView.componentInstance;
          if (node && !store.getNode(node.value)) {
            // 视图列表中的节点，在树中不存在
            const nodeViewIndex = treeNodes.indexOf(nodeView);
            // 则从视图中删除对应节点
            treeNodes.splice(nodeViewIndex, 1);
            // 注意 $destroy 是一个耗时操作
            nodeView.componentInstance.$destroy();
            nodesMap.set(node.value, null);
            nodesMap.delete(node.value);
          } else {
            index += 1;
          }
        } else {
          index += 1;
        }
      }
    },
    // 刷新树的视图状态
    refresh() {
      const {
        store,
        treeNodes,
      } = this;

      // 性能改进说明
      // $destroy 方法极耗性能，因此不能频繁调用
      // 但没有 $destroy 方法的调用，重复创建节点，会导致内存泄露
      // 即使用缓存存储节点，如果反复插入节点，也会发现占用内存持续走高，而释放速度不足
      // 因此不再对显示隐藏行为进行节点增删操作，仅改变样式

      const nodesMap = this.getNodesMap();
      this.updateNodesMap();

      // 遍历模型中的所有节点
      let index = 0;
      const allNodes = store.getNodes();
      allNodes.forEach((node: TreeNode) => {
        if (nodesMap.has(node.value)) {
          const nodeView = nodesMap.get(node.value);
          const nodeViewIndex = treeNodes.indexOf(nodeView);
          if (nodeViewIndex !== index) {
            // 节点存在，但位置与可视节点位置冲突，需要更新节点位置
            treeNodes.splice(nodeViewIndex, 1);
            treeNodes.splice(index, 0, nodeView);
          }
        } else if (node.visible) {
          // 初次仅渲染可显示的节点
          // 不存在节点视图，则创建该节点视图并插入到当前位置
          const nodeView = this.renderItem(node);
          treeNodes.splice(index, 0, nodeView);
          nodesMap.set(node.value, nodeView);
        }
        index += 1;
      });
    },
    // 同步 Store 选项
    updateStoreConfig() {
      const { store } = this;
      if (!store) return;
      // 统一更新选项，然后在 store 统一识别属性更新
      const storeProps = pick(this, [
        'keys',
        'expandAll',
        'expandLevel',
        'expandMutex',
        'expandParent',
        'activable',
        'activeMultiple',
        'disabled',
        'checkable',
        'checkStrictly',
        'load',
        'lazy',
        'valueMode',
        'filter',
      ]);
      store.setConfig(storeProps);
    },
    updateExpanded() {
      const {
        store,
        expanded,
        expandParent,
      } = this;
      // 初始化展开状态
      // 校验是否自动展开父节点
      if (Array.isArray(expanded)) {
        const expandedMap = new Map();
        expanded.forEach((val) => {
          expandedMap.set(val, true);
          if (expandParent) {
            const node = store.getNode(val);
            node.getParents().forEach((tn: TypeTreeNodeModel) => {
              expandedMap.set(tn.value, true);
            });
          }
        });
        const expandedArr = Array.from(expandedMap.keys());
        store.setExpanded(expandedArr);
      }
    },
    // 初始化树结构
    build() {
      let list = this.data;
      const {
        actived,
        value,
        valueMode,
        filter,
      } = this;

      const store = new TreeStore({
        valueMode: valueMode as TypeValueMode,
        filter,
        onLoad: (info: TypeEventState) => {
          this.handleLoad(info);
        },
        onUpdate: () => {
          this.refresh();
        },
      });

      // 初始化数据
      this.store = store;
      this.updateStoreConfig();

      if (!Array.isArray(list)) {
        list = [];
      }
      store.append(list);

      // 刷新节点，必须在配置选中之前执行
      // 这样选中态联动判断才能找到父节点
      store.refreshNodes();

      // 初始化选中状态
      if (Array.isArray(value)) {
        store.setChecked(value);
      }

      this.updateExpanded();

      // 初始化激活状态
      if (Array.isArray(actived)) {
        store.setActived(actived);
      }

      // 树的数据初始化之后，需要立即进行一次视图刷新
      this.refresh();
    },
    rebuild(list: TdTreeProps['data']) {
      this.getNodesMap().clear();
      this.treeNodes.length = 0;
      const {
        store,
        value,
        actived,
      } = this;
      store.reload(list);
      // 初始化选中状态
      if (Array.isArray(value)) {
        store.setChecked(value);
      }
      this.updateExpanded();
      // 初始化激活状态
      if (Array.isArray(actived)) {
        store.setActived(actived);
      }
      store.refreshState();
    },
    toggleActived(item: TypeTargetNode): TreeNodeValue[] {
      const node = getNode(this.store, item);
      return this.setActived(node, !node.isActived());
    },
    setActived(item: TypeTargetNode, isActived: boolean) {
      const node = getNode(this.store, item);
      const actived = node.setActived(isActived);
      const { mouseEvent } = this;
      const ctx = {
        node: node.getModel(),
        e: mouseEvent,
      };
      emitEvent<Parameters<TypeTdTreeProps['onActive']>>(this, 'active', actived, ctx);
      return actived;
    },
    toggleExpanded(item: TypeTargetNode): TreeNodeValue[] {
      const node = getNode(this.store, item);
      return this.setExpanded(node, !node.isExpanded());
    },
    setExpanded(item: TypeTargetNode, isExpanded: boolean): TreeNodeValue[] {
      const node = getNode(this.store, item);
      const expanded = node.setExpanded(isExpanded);
      const { mouseEvent } = this;
      const ctx = {
        node: node.getModel(),
        e: mouseEvent,
      };
      emitEvent<Parameters<TypeTdTreeProps['onExpand']>>(this, 'expand', expanded, ctx);
      return expanded;
    },
    toggleChecked(item: TypeTargetNode): TreeNodeValue[] {
      const node = getNode(this.store, item);
      return this.setChecked(node, !node.isChecked());
    },
    setChecked(item: TypeTargetNode, isChecked: boolean): TreeNodeValue[] {
      const node = getNode(this.store, item);
      const checked = node.setChecked(isChecked);
      const ctx = {
        node: node.getModel(),
      };
      emitEvent<Parameters<TypeTdTreeProps['onChange']>>(this, 'change', checked, ctx);
      return checked;
    },
    handleLoad(info: TypeEventState): void {
      const { node } = info;
      const ctx = {
        node: node.getModel(),
      };
      const {
        value,
        expanded,
        actived,
        store,
      } = this;
      if (value && value.length > 0) {
        store.replaceChecked(value);
      }
      if (expanded && expanded.length > 0) {
        store.replaceExpanded(expanded);
      }
      if (actived && actived.length > 0) {
        store.replaceActived(actived);
      }
      emitEvent<Parameters<TypeTdTreeProps['onLoad']>>(this, 'load', ctx);
    },
    handleClick(state: TypeEventState): void {
      const { expandOnClickNode } = this;
      const {
        mouseEvent,
        event,
        node,
      } = state;

      if (!node || this.disabled || node.disabled) {
        return;
      }

      this.mouseEvent = mouseEvent;

      let shouldExpand = expandOnClickNode;
      let shouldActive = true;
      ['trigger', 'ignore'].forEach((markName) => {
        const mark = getMark(
          markName,
          event.target as HTMLElement,
          event.currentTarget as HTMLElement,
        );
        const markValue = mark?.value || '';
        if (markValue.indexOf('expand') >= 0) {
          if (markName === 'trigger') {
            shouldExpand = true;
          } else if (markName === 'ignore') {
            shouldExpand = false;
          }
        }
        if (markValue.indexOf('active') >= 0) {
          if (markName === 'ignore') {
            shouldActive = false;
          }
        }
      });

      if (shouldExpand) {
        this.toggleExpanded(node);
      }
      if (shouldActive) {
        this.toggleActived(node);
      }

      const ctx = {
        node: node.getModel(),
        e: mouseEvent,
      };
      emitEvent<Parameters<TypeTdTreeProps['onClick']>>(this, 'click', ctx);

      this.mouseEvent = null;
    },
    handleChange(state: TypeEventState): void {
      const { disabled } = this;
      const { node } = state;
      if (!node || disabled || node.disabled) {
        return;
      }
      this.toggleChecked(node);
    },

    // -------- 公共方法 start --------
    setItem(value: TreeNodeValue, options: TreeNodeState): void {
      const node: TreeNode = this.store.getNode(value);
      const spec = options;
      const keys = Object.keys(spec);
      if (node && spec) {
        ['expanded', 'actived', 'checked'].forEach((name) => {
          if (keys.includes(name)) {
            this[`set${upperFirst(name)}`](node, spec[name]);
            delete spec[name];
          }
        });
        node.set(spec);
      }
    },
    getItem(value: TreeNodeValue): TypeTreeNodeModel {
      const node: TreeNode = this.store.getNode(value);
      return node?.getModel();
    },
    getItems(value?: TreeNodeValue): TypeTreeNodeModel[] {
      const nodes = this.store.getNodes(value);
      return nodes.map((node: TreeNode) => node.getModel());
    },
    appendTo(para?: TreeNodeValue, item?: TreeOptionData | TreeOptionData[]) {
      let list = [];
      if (Array.isArray(item)) {
        list = item;
      } else {
        list = [item];
      }
      list.forEach((item) => {
        const val = item?.value || '';
        const node = getNode(this.store, val);
        if (node) {
          this.store.appendNodes(para, node);
        } else {
          this.store.appendNodes(para, item);
        }
      });
    },
    insertBefore(value: TreeNodeValue, item: TreeOptionData) {
      const val = item?.value || '';
      const node = getNode(this.store, val);
      if (node) {
        this.store.insertBefore(value, node);
      } else {
        this.store.insertBefore(value, item);
      }
    },
    insertAfter(value: TreeNodeValue, item: TreeOptionData) {
      const val = item?.value || '';
      const node = getNode(this.store, val);
      if (node) {
        this.store.insertAfter(value, node);
      } else {
        this.store.insertAfter(value, item);
      }
    },
    remove(value?: TreeNodeValue) {
      return this.store.remove(value);
    },
    getIndex(value: TreeNodeValue): number {
      return this.store.getNodeIndex(value);
    },
    getParent(value: TreeNodeValue): TypeTreeNodeModel {
      const node = this.store.getParent(value);
      return node?.getModel();
    },
    getParents(value: TreeNodeValue): TypeTreeNodeModel[] {
      const nodes = this.store.getParents(value);
      return nodes.map((node: TreeNode) => node.getModel());
    },
    getPath(value: TreeNodeValue): TypeTreeNodeModel[] {
      const node = this.store.getNode(value);
      let pathNodes = [];
      if (node) {
        pathNodes = node.getPath()
          .map((node: TreeNode) => node.getModel());
      }
      return pathNodes;
    },
    // -------- 公共方法 end --------
  },
  created() {
    this.build();
  },
  render(): VNode {
    const {
      classList,
      treeNodes,
      // 用于同步 slot 属性
      treeScope,
      $scopedSlots: scopedSlots,
    } = this;

    const scopeProps = pick(this, [
      'checkProps',
      'disableCheck',
      'empty',
      'icon',
      'label',
      'line',
      'operations',
    ]);

    this.updateStoreConfig();
    Object.assign(treeScope, scopeProps);
    treeScope.scopedSlots = scopedSlots;

    let emptyNode: TNodeReturnValue = null;
    let treeNodeList = null;

    if (treeNodes.length <= 0) {
      const useLocale = !this.empty && !this.$scopedSlots.empty;
      emptyNode = (
        <div class={CLASS_NAMES.treeEmpty}>
          {useLocale ? this.t(this.global.empty) : renderTNodeJSX(this, 'empty')}
        </div>
      );
    }

    treeNodeList = (
      <transition-group
        name={FX.treeNode}
        tag="div"
        class={CLASS_NAMES.treeList}
      >{treeNodes}</transition-group>
    );

    return (
      <div class={classList}>
        {treeNodeList}
        {emptyNode}
      </div>
    );
  },
});
