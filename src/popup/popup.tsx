import Vue from 'vue';
import { createPopper } from '@popperjs/core';
import ResizeSensor from 'css-element-queries/src/ResizeSensor';
import config from '../config';
import CLASSNAMES from '../utils/classnames';
import { on, off, addClass, removeClass, getAttach } from '../utils/dom';
import props from '../../types/popup/props';
import { renderTNodeJSX, renderContent } from '../utils/render-tnode';

const stop = (e: MouseEvent): void => e.stopPropagation();
const { prefix } = config;
const name = `${prefix}-popup`;
const placementMap = {
  top: 'top',
  'top-left': 'top-start',
  'top-right': 'top-end',
  bottom: 'bottom',
  'bottom-left': 'bottom-start',
  'bottom-right': 'bottom-end',
  left: 'left',
  'left-top': 'left-start',
  'left-bottom': 'left-end',
  right: 'right',
  'right-top': 'right-start',
  'right-bottom': 'right-end',
};
const showTimeout = 250;
const hideTimeout = 150;

export default Vue.extend({
  name,

  props: { ...props },

  data() {
    return {
      name,
      showPopper: false,
      currentPlacement: '',
      popperElm: null,
      referenceElm: null,
      resizeSensor: null,
      popperJS: null,
      timeout: null,
      refOverlayElm: null,
      caledOverlayStyle: null,
    };
  },
  computed: {
    overlayClasses(): ClassName {
      const base =  [
        `${name}-content`,
        {
          [`${name}-content--arrow`]: this.showArrow,
          [CLASSNAMES.STATUS.disabled]: this.disabled,
        },
      ] as ClassName;
      return base.concat(this.overlayClassName);
    },
    manualTrigger(): boolean {
      return this.trigger.indexOf('manual') > -1;
    },
    hoverTrigger(): boolean {
      return this.trigger.indexOf('hover') > -1;
    },
    clickTrigger(): boolean {
      return this.trigger.indexOf('click') > -1;
    },
    focusTrigger(): boolean {
      return this.trigger.indexOf('focus') > -1;
    },
    contextMenuTrigger(): boolean {
      return this.trigger.indexOf('context-menu') > -1;
    },
  },
  watch: {
    showPopper(val): void {
      if (this.disabled) {
        return;
      }
      if (val) {
        this.updatePopper();
      } else {
        this.destroyPopper();
      }
      this.$emit('visibleChange', val);
      if (typeof this.onVisibleChange === 'function') {
        this.onVisibleChange(val);
      }
    },
    visible(val): void {
      if (this.trigger === 'manual') {
        this.showPopper = val;
      }
    },
  },
  mounted() {
    this.currentPlacement = this.currentPlacement || this.placement;
    this.popperElm = this.popperElm || this.$refs.popper;
    this.referenceElm = this.referenceElm || this.$refs.reference;
    if (!this.popperElm || !this.referenceElm) return;

    this.createPopperJS();
    const reference = this.referenceElm;
    const popper = this.popperElm;

    if (!this.clickTrigger) {
      on(reference, 'focusin', this.handleFocus);
      on(popper, 'focusin', this.handleFocus);
      on(reference, 'focusout', this.handleBlur);
      on(popper, 'focusout', this.handleBlur);
    }
    on(reference, 'keydown', this.handleKeydown);
    on(reference, 'click', this.handleClick);

    if (this.clickTrigger) {
      on(reference, 'click', this.doToggle);
      on(document, 'click', this.handleDocumentClick);
    }
    if (this.hoverTrigger) {
      on(reference, 'mouseenter', this.doShow);
      on(popper, 'mouseenter', this.doShow);
      on(reference, 'mouseleave', this.doClose);
      on(popper, 'mouseleave', this.doClose);
    }
    if (this.focusTrigger) {
      if (reference.querySelector('input, textarea')) {
        on(reference, 'focusin', this.doShow);
        on(reference, 'focusout', this.doClose);
      } else {
        on(reference, 'mousedown', this.doShow);
        on(reference, 'mouseup', this.doClose);
      }
    }
    if (this.contextMenuTrigger) {
      reference.oncontextmenu = (): boolean => false;
      on(reference, 'mousedown', this.handleRightClick);
      on(document, 'click', this.handleDocumentClick);
    }
    if (this.manualTrigger) {
      this.showPopper = !!this.visible;
    }
    this.updateOverlayStyle();
  },
  beforeDestroy(): void {
    this.doDestroy(true);
    if (this.popperElm && this.popperElm.parentNode === document.body) {
      this.popperElm.removeEventListener('click', stop);
      document.body.removeChild(this.popperElm);
    }
  },
  destroyed(): void {
    const reference = this.referenceElm;
    off(reference, 'click', this.doToggle);
    off(reference, 'mouseup', this.doClose);
    off(reference, 'mousedown', this.doShow);
    off(reference, 'focusin', this.doShow);
    off(reference, 'focusout', this.doClose);
    off(reference, 'mousedown', this.doShow);
    off(reference, 'mouseup', this.doClose);
    off(reference, 'mouseleave', this.doClose);
    off(reference, 'mouseenter', this.doShow);
    off(document, 'click', this.handleDocumentClick);
  },
  methods: {
    createPopperJS(): void {
      const overlayContainer = getAttach(this.attach);

      overlayContainer.appendChild(this.popperElm);

      if (this.popperJS && this.popperJS.destroy) {
        this.popperJS.destroy();
      }
      this.popperJS = createPopper(this.referenceElm, this.popperElm, {
        placement: placementMap[this.currentPlacement],
        onFirstUpdate: () => {
          this.$nextTick(this.updatePopper);
        },
        modifiers: [
          {
            name: 'arrow',
            options: {
              padding: 5, // 5px from the edges of the popper
            },
          },
        ],
      });
      this.popperElm.addEventListener('click', stop);

      // 监听trigger元素尺寸变化
      this.resizeSensor = new ResizeSensor(this.referenceElm, () => {
        this.popperJS.update();
        this.updateOverlayStyle();
      });
    },

    updatePopper(): void {
      if (this.popperJS) {
        this.popperJS.update();
      } else {
        this.createPopperJS();
      }
    },

    updateOverlayStyle() {
      const { overlayStyle } = this;
      const referenceElm = this.$refs.reference as HTMLElement;
      const refOverlayElm = this.$refs.overlay as HTMLElement;
      if (typeof overlayStyle === 'function' && referenceElm && refOverlayElm) {
        const userOverlayStyle = overlayStyle(referenceElm);
        this.setOverlayStyle(userOverlayStyle);
      } else if (typeof overlayStyle === 'object' && refOverlayElm) {
        this.setOverlayStyle(overlayStyle);
      }
    },

    setOverlayStyle(styles: Styles) {
      const refOverlayElm = this.$refs.overlay as HTMLElement;
      if (typeof styles === 'object' && refOverlayElm) {
        refOverlayElm.setAttribute(
          'style',
          Object.keys(styles).map(key => `${key}: ${styles[key]}`)
            .join(';')
        );
      }
    },

    doDestroy(forceDestroy: boolean): void {
      if (!this.popperJS || (this.showPopper && !forceDestroy)) return;
      this.popperJS.destroy();
      this.popperJS = null;
    },

    destroyPopper(): void {
      if (this.popperJS) {
        if (this.destroyOnHide) {
          this.popperJS.destroy();
          this.popperJS = null;
          this.popperElm.parentNode.removeChild(this.popperElm);
        }
      }
    },

    doToggle(): void {
      this.showPopper = !this.showPopper;
    },
    doShow(): void {
      clearTimeout(this.timeout);
      this.timeout = setTimeout(() => {
        this.showPopper = true;
      }, this.clickTrigger ? 0 : showTimeout);
    },
    doClose(): void {
      clearTimeout(this.timeout);
      this.timeout = setTimeout(() => {
        this.showPopper = false;
      }, this.clickTrigger ? 0 : hideTimeout);
    },
    handleFocus(): void {
      addClass(this.referenceElm, 'focusing');
      if (this.clickTrigger || this.focusTrigger) this.showPopper = true;
    },
    handleClick(): void {
      removeClass(this.referenceElm, 'focusing');
    },
    handleBlur(): void {
      removeClass(this.referenceElm, 'focusing');
      if (this.clickTrigger || this.focusTrigger) this.showPopper = false;
    },
    handleKeydown(ev: KeyboardEvent): void {
      if (ev.keyCode === 27 && this.manualTrigger) { // esc
        this.doClose();
      }
    },
    handleDocumentClick(e: Event): void {
      const reference = this.referenceElm;
      const popper = this.popperElm;
      if (!this.$el || !reference
        || this.$el.contains(e.target as Element)
        || reference.contains(e.target as Node)
        || !popper
        || popper.contains(e.target as Node)) return;
      this.showPopper = false;
    },
    handleRightClick(e: MouseEvent): void {
      if (e.button === 2) {
        this.doToggle();
      }
    },
  },

  render() {
    return (
      <div class={`${name}-reference`} ref="reference">
        <transition name={`${name}_animation`} appear>
          <div
            class={name}
            ref='popper'
            v-show={!this.disabled && this.showPopper}
            role='tooltip'
            aria-hidden={(this.disabled || !this.showPopper) ? 'true' : 'false'}
          >
            <div class={this.overlayClasses} ref="overlay">
              {renderTNodeJSX(this, 'content')}
              {this.showArrow && <div class={`${name}__arrow`} data-popper-arrow></div>}
            </div>
          </div>
        </transition>
        {renderContent(this, 'default', 'triggerElement')}
      </div>
    );
  },
});