/**
 * PMT GTW (ONLINE) — Universal Drop-In Checkout Client Script
 * Zero external dependencies. Works on any website, framework, or static HTML.
 */

(function () {
  'use strict';

  if (window.PmtGateway) return;

  const STYLES = `
    .pmt-modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.75);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      z-index: 9999999;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1), visibility 0.25s;
    }
    .pmt-modal-backdrop.pmt-open {
      opacity: 1;
      visibility: visible;
    }
    .pmt-modal-container {
      position: relative;
      width: 100%;
      max-width: 440px;
      height: 90vh;
      max-height: 720px;
      background: #0f172a;
      border-radius: 20px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05);
      overflow: hidden;
      transform: scale(0.95) translateY(10px);
      transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      display: flex;
      flex-direction: column;
    }
    .pmt-modal-backdrop.pmt-open .pmt-modal-container {
      transform: scale(1) translateY(0);
    }
    .pmt-modal-close {
      position: absolute;
      top: 14px;
      right: 14px;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.1);
      color: #94a3b8;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      z-index: 10;
      transition: background 0.15s, color 0.15s;
    }
    .pmt-modal-close:hover {
      background: rgba(255, 255, 255, 0.2);
      color: #ffffff;
    }
    .pmt-iframe {
      width: 100%;
      height: 100%;
      border: none;
      background: transparent;
    }
    @media (max-width: 640px) {
      .pmt-modal-backdrop {
        align-items: flex-end;
      }
      .pmt-modal-container {
        max-width: 100%;
        height: 92vh;
        max-height: 92vh;
        border-bottom-left-radius: 0;
        border-bottom-right-radius: 0;
        transform: translateY(100%);
      }
      .pmt-modal-backdrop.pmt-open .pmt-modal-container {
        transform: translateY(0);
      }
    }
  `;

  class PmtGatewayInstance {
    constructor() {
      this.currentCallback = null;
      this.backdropEl = null;
      this.iframeEl = null;
      this.injectStyles();
      this.createModal();
      this.bindWindowEvents();
    }

    injectStyles() {
      const styleEl = document.createElement('style');
      styleEl.innerHTML = STYLES;
      document.head.appendChild(styleEl);
    }

    createModal() {
      const backdrop = document.createElement('div');
      backdrop.className = 'pmt-modal-backdrop';
      backdrop.id = 'pmt-modal-backdrop';

      const container = document.createElement('div');
      container.className = 'pmt-modal-container';

      const closeBtn = document.createElement('button');
      closeBtn.className = 'pmt-modal-close';
      closeBtn.setAttribute('aria-label', 'Close Payment Modal');
      closeBtn.innerHTML = '✕';
      closeBtn.onclick = () => this.close();

      const iframe = document.createElement('iframe');
      iframe.className = 'pmt-iframe';
      iframe.name = 'pmt_checkout_frame';
      iframe.setAttribute('allow', 'payment; camera; clipboard-write');

      container.appendChild(closeBtn);
      container.appendChild(iframe);
      backdrop.appendChild(container);
      document.body.appendChild(backdrop);

      this.backdropEl = backdrop;
      this.iframeEl = iframe;

      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) {
          this.close();
        }
      });
    }

    bindWindowEvents() {
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.isOpen()) {
          this.close();
        }
      });

      window.addEventListener('message', (event) => {
        if (!event.data || typeof event.data !== 'object') return;
        const { type, data } = event.data;

        if (type === 'PMT_PAYMENT_SUCCESS') {
          if (this.currentCallback && typeof this.currentCallback.onSuccess === 'function') {
            this.currentCallback.onSuccess(data);
          }
          if (this.currentCallback && this.currentCallback.redirectUrl) {
            setTimeout(() => {
              window.location.href = this.currentCallback.redirectUrl;
            }, 1200);
          }
        } else if (type === 'PMT_PAYMENT_FAILED') {
          if (this.currentCallback && typeof this.currentCallback.onFailure === 'function') {
            this.currentCallback.onFailure(data);
          }
        } else if (type === 'PMT_MODAL_CLOSE') {
          this.close();
        }
      });
    }

    isOpen() {
      return this.backdropEl && this.backdropEl.classList.contains('pmt-open');
    }

    /**
     * Open checkout modal.
     * @param {object} options
     * @param {string} [options.checkoutUrl] - Direct checkout URL
     * @param {string} [options.paymentId] - Payment ID if hosted on default portal
     * @param {string} [options.portalBaseUrl='http://localhost:7000']
     * @param {Function} [options.onSuccess]
     * @param {Function} [options.onFailure]
     * @param {Function} [options.onDismiss]
     * @param {string} [options.redirectUrl]
     */
    open(options = {}) {
      this.currentCallback = options;
      const portalBase = (options.portalBaseUrl || 'http://localhost:7000').replace(/\/$/, '');
      const url = options.checkoutUrl || `${portalBase}/checkout/${options.paymentId}?embed=true`;

      this.iframeEl.src = url;
      this.backdropEl.classList.add('pmt-open');
      document.body.style.overflow = 'hidden';
    }

    close() {
      if (!this.isOpen()) return;
      this.backdropEl.classList.remove('pmt-open');
      document.body.style.overflow = '';
      this.iframeEl.src = 'about:blank';

      if (this.currentCallback && typeof this.currentCallback.onDismiss === 'function') {
        this.currentCallback.onDismiss();
      }
      this.currentCallback = null;
    }
  }

  // Initialize singleton
  let instance = null;
  function getInstance() {
    if (!instance) instance = new PmtGatewayInstance();
    return instance;
  }

  window.PmtGateway = {
    open: (options) => getInstance().open(options),
    close: () => getInstance().close()
  };

  // Auto-bind to [data-pmt-pay] buttons
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-pmt-pay]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const paymentId = btn.getAttribute('data-payment-id');
        const checkoutUrl = btn.getAttribute('data-checkout-url');
        const redirectUrl = btn.getAttribute('data-redirect-url');
        window.PmtGateway.open({ paymentId, checkoutUrl, redirectUrl });
      });
    });
  });
})();
